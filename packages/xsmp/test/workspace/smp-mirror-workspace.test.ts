import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cancellation, type LangiumDocument, OperationCancelled, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileChangeType, type DidChangeWatchedFilesParams, type LocationLink, type TextDocumentPositionParams } from 'vscode-languageserver';
import { createXsmpServices } from '@xsmp/core';
import { createSmpMirrorDescriptor, type SmpImportService } from '@xsmp/core/smp';
import { resolveServerFileContent, SmpMirrorsChangedNotification } from '@xsmp/core/lsp';
import { createBuiltinTestXsmpServices } from '../test-services.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-mirror-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SMP mirror workspace support', () => {
    test('creates XSMP mirrors for SMP source files and resolves XSMP references against them', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="dep" Name="types">
  <Namespace Name="dep">
    <Type xsi:type="Types:Structure" Id="dep.ExternalType" Name="ExternalType" Uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/>
  </Namespace>
</Catalogue:Catalogue>
`,
            'src/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    struct UsesExternal
    {
        field dep.ExternalType external
    }
}
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'types.smpcat'));
        expect(mirrorUri).toBeDefined();
        const mirrorDocument = mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri);
        expect(mirrorDocument).toBeDefined();

        const appDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(projectDir, 'src', 'app.xsmpcat')));
        expect(appDocument?.diagnostics?.some(diagnostic => diagnostic.message.includes('Could not resolve reference'))).not.toBe(true);
    });

    test('does not publish partial mirror state when a refresh is cancelled', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/a.smpcat': createSmpCatalogue('a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
            'src/b.smpcat': createSmpCatalogue('b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorManager = services.shared.SmpMirrorManager;
        const aMirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'a.smpcat'))!;
        const bMirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'b.smpcat'))!;
        const previousAContent = mirrorManager.getMirrorContent(aMirrorUri);
        const previousBContent = mirrorManager.getMirrorContent(bMirrorUri);
        const previousEligibleSourcePaths = [...services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()];
        const previousDiagnostics = mirrorManager.getSourceDiagnosticEntries().map(entry => ({
            uri: entry.uri.toString(),
            diagnostics: entry.diagnostics,
        }));
        const cSourcePath = path.join(projectDir, 'src', 'c.smpcat');
        const cMirrorUri = createSmpMirrorDescriptor(cSourcePath)!.mirrorUri;
        fs.writeFileSync(cSourcePath, createSmpCatalogue('c', 'cccccccc-cccc-cccc-cccc-cccccccccccc'));

        const importer = (mirrorManager as unknown as { importer: SmpImportService }).importer;
        const renderImportedDocument = importer.renderImportedDocument.bind(importer);
        const cancellation = new Cancellation.CancellationTokenSource();
        vi.spyOn(importer, 'renderImportedDocument').mockImplementationOnce(async request => {
            const result = await renderImportedDocument(request);
            cancellation.cancel();
            return {
                ...result,
                content: `${result.content}\n// staged but never published`,
                warnings: [...result.warnings, 'staged warning'],
            };
        });

        await expect(mirrorManager.refreshWorkspaceMirrors(cancellation.token)).rejects.toBe(OperationCancelled);

        expect(mirrorManager.getMirrorContent(aMirrorUri)).toBe(previousAContent);
        expect(mirrorManager.getMirrorContent(bMirrorUri)).toBe(previousBContent);
        expect(services.shared.workspace.LangiumDocuments.getDocument(aMirrorUri)).toBeDefined();
        expect(services.shared.workspace.LangiumDocuments.getDocument(bMirrorUri)).toBeDefined();
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual(previousEligibleSourcePaths);
        expect(services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(cSourcePath)).toBeUndefined();
        expect(mirrorManager.getMirrorContent(cMirrorUri)).toBeUndefined();
        expect(mirrorManager.getSourceDiagnosticEntries().map(entry => ({
            uri: entry.uri.toString(),
            diagnostics: entry.diagnostics,
        }))).toEqual(previousDiagnostics);

        const nextRefresh = await mirrorManager.refreshWorkspaceMirrors(Cancellation.CancellationToken.None);
        expect(nextRefresh.changed.map(uri => uri.toString())).toContain(cMirrorUri.toString());
        expect(services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(cSourcePath)?.toString()).toBe(cMirrorUri.toString());
        expect(mirrorManager.getMirrorContent(cMirrorUri)).toContain('catalogue c');
        expect(services.shared.workspace.LangiumDocuments.getDocument(cMirrorUri)).toBeDefined();
    });

    test('resolves cross-project references against SMP mirrors from dependency source folders', async () => {
        const foundationDir = createProject(tempDir, 'foundation', `
project 'foundation'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/foundation_catalogue.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<!--Generated By SmpTool-1.99-->
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="foundation" Name="foundation_catalogue">
  <Namespace Id="demo" Name="demo">
    <Namespace Id="demo.foundation" Name="foundation">
      <Type xsi:type="Types:Structure" Id="demo.foundation.ExternalType" Name="ExternalType" Visibility="public" Uuid="dddddddd-dddd-dddd-dddd-dddddddddddd"/>
    </Namespace>
  </Namespace>
</Catalogue:Catalogue>
`,
        });
        const avionicsDir = createProject(tempDir, 'avionics', `
project 'avionics'
using 'ECSS_SMP_2025'
source 'src'
dependency 'foundation'
`, {
            'src/avionics_catalogue.xsmpcat': `
catalogue avionics_catalogue

namespace demo::avionics
{
    /** @uuid eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee */
    struct UsesExternal
    {
        field demo.foundation.ExternalType external
    }
}
`,
        });

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'foundation', uri: URI.file(foundationDir).toString() },
            { name: 'avionics', uri: URI.file(avionicsDir).toString() },
        ]);

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(foundationDir, 'src', 'foundation_catalogue.smpcat'));
        expect(mirrorUri).toBeDefined();
        const mirrorDocument = mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri);
        expect(mirrorDocument).toBeDefined();
        const avionicsDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(avionicsDir, 'src', 'avionics_catalogue.xsmpcat')));
        expect(avionicsDocument?.diagnostics?.some(diagnostic => diagnostic.message.includes('Could not resolve reference'))).not.toBe(true);

        const referenceOffset = avionicsDocument?.textDocument.getText().indexOf('demo.foundation.ExternalType');
        expect(referenceOffset).toBeGreaterThanOrEqual(0);
        const definitions = await services.xsmpcat.lsp.DefinitionProvider?.getDefinition(
            avionicsDocument!,
            positionParams(avionicsDocument!, referenceOffset! + 'demo.foundation.'.length),
        ) ?? [];

        expectMirrorLocation(
            definitions,
            mirrorUri!,
            mirrorDocument!,
            'ExternalType',
        );
    });

    test('marks workspace ready only after dependency SMP mirrors are available', async () => {
        const foundationDir = createProject(tempDir, 'foundation', `
project 'foundation'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/foundation_catalogue.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="foundation" Name="foundation_catalogue">
  <Namespace Id="demo" Name="demo">
    <Namespace Id="demo.foundation" Name="foundation">
      <Type xsi:type="Types:Float" Id="demo.foundation.TemperatureC" Name="TemperatureC" Visibility="public" Uuid="01010101-0101-0101-0101-010101010101" PrimitiveType="Float32"/>
    </Namespace>
  </Namespace>
</Catalogue:Catalogue>
`,
        });
        const avionicsDir = createProject(tempDir, 'avionics', `
project 'avionics'
using 'ECSS_SMP_2025'
source 'src'
dependency 'foundation'
`, {
            'src/avionics_catalogue.xsmpcat': `
catalogue avionics_catalogue

namespace demo::avionics
{
    /** @uuid 13131313-1313-1313-1313-131313131313 */
    struct UsesExternal
    {
        field demo.foundation.TemperatureC external
    }
}
`,
        });

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;
        void services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'foundation', uri: URI.file(foundationDir).toString() },
            { name: 'avionics', uri: URI.file(avionicsDir).toString() },
        ]);

        await services.shared.workspace.WorkspaceManager.ready;

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(foundationDir, 'src', 'foundation_catalogue.smpcat'));
        expect(mirrorUri).toBeDefined();
        expect(mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)).toBeDefined();

        const avionicsDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(avionicsDir, 'src', 'avionics_catalogue.xsmpcat')));
        expect(avionicsDocument?.diagnostics?.some(diagnostic => diagnostic.message.includes('Could not resolve reference'))).not.toBe(true);
    });

    test('prefers a real XSMP homologue and reports the SMP source as ignored', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="dep" Name="types">
  <Namespace Name="dep">
    <Type xsi:type="Types:Structure" Id="dep.ExternalType" Name="ExternalType" Uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"/>
  </Namespace>
</Catalogue:Catalogue>
`,
            'src/types.xsmpcat': `
catalogue types

namespace dep
{
    /** @uuid 22222222-2222-2222-2222-222222222222 */
    struct ExternalType
    {
    }
}
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'types.smpcat'));
        expect(mirrorUri).toBeDefined();
        expect(mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)).toBeUndefined();

        const diagnostics = services.shared.SmpMirrorManager.getSourceDiagnosticEntries()
            .find(entry => entry.uri.fsPath === path.join(projectDir, 'src', 'types.smpcat'));
        expect(diagnostics?.diagnostics.map(diagnostic => diagnostic.message)).toEqual([
            expect.stringContaining("Ignoring 'types.smpcat' because 'types.xsmpcat' is present"),
        ]);
    });

    test('can render SMP mirrors on demand even when the workspace mirror is unavailable', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="dep" Name="types">
  <Namespace Name="dep">
    <Type xsi:type="Types:Structure" Id="dep.ExternalType" Name="ExternalType" Uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"/>
  </Namespace>
</Catalogue:Catalogue>
`,
            'src/types.xsmpcat': `
catalogue types

namespace dep
{
    /** @uuid 22222222-2222-2222-2222-222222222222 */
    struct ExternalType
    {
    }
}
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'types.smpcat'));
        expect(mirrorUri).toBeDefined();
        expect(mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)).toBeUndefined();

        const content = await resolveServerFileContent(services.shared, mirrorUri!);

        expect(content).toContain('catalogue types');
        expect(content).toContain('@uuid bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
        expect(content).not.toContain('@uuid 22222222-2222-2222-2222-222222222222');

        const refresh = await services.shared.SmpMirrorManager.refreshWorkspaceMirrors();
        expect(refresh.deleted.map(uri => uri.toString())).toContain(mirrorUri!.toString());

        const mirrorDocument = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(mirrorUri!);
        await services.shared.workspace.DocumentBuilder.build([mirrorDocument], { validation: true }, Cancellation.CancellationToken.None);
        expect(mirrorDocument.textDocument.getText()).toContain('catalogue types');
    });

    test('does not restore an on-demand mirror after a refresh removes its source', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': createSmpCatalogue('types', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const sourcePath = path.join(projectDir, 'src', 'types.smpcat');
        const staleCachePath = path.join(projectDir, 'src', 'stale-external.smpcat');
        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(sourcePath)!;
        const mirrorManager = services.shared.SmpMirrorManager;
        const mutableMirrorManager = mirrorManager as unknown as {
            importer: SmpImportService;
            mirrorContentByUri: Map<string, string>;
        };
        mutableMirrorManager.mirrorContentByUri.delete(mirrorUri.toString());
        services.shared.workspace.LangiumDocuments.deleteDocument(mirrorUri);

        const renderImportedDocument = mutableMirrorManager.importer.renderImportedDocument.bind(mutableMirrorManager.importer);
        let notifyRenderFinished!: () => void;
        const renderFinished = new Promise<void>(resolve => {
            notifyRenderFinished = resolve;
        });
        let resumeRender!: () => void;
        const renderCanFinish = new Promise<void>(resolve => {
            resumeRender = resolve;
        });
        vi.spyOn(mutableMirrorManager.importer, 'renderImportedDocument').mockImplementationOnce(async request => {
            const rendered = await renderImportedDocument(request);
            notifyRenderFinished();
            await renderCanFinish;
            request.workspaceIndex?.setCachedExternalDocumentIndex(staleCachePath, {});
            return rendered;
        });

        const pendingContent = resolveServerFileContent(services.shared, mirrorUri);
        await renderFinished;
        fs.rmSync(sourcePath);
        try {
            await mirrorManager.refreshWorkspaceMirrors(Cancellation.CancellationToken.None);
        } finally {
            resumeRender();
        }

        await expect(pendingContent).resolves.toBeNull();
        expect(mirrorManager.getMirrorContent(mirrorUri)).toBeUndefined();
        expect(services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(sourcePath)).toBeUndefined();
        expect(services.shared.SmpWorkspaceIndex.getCachedExternalDocumentIndex(staleCachePath)).toBeUndefined();

        const staleDocument = services.shared.workspace.LangiumDocumentFactory.fromString('catalogue stale\n', mirrorUri);
        services.shared.workspace.LangiumDocuments.addDocument(staleDocument);
        await expect(resolveServerFileContent(services.shared, mirrorUri)).resolves.toBeNull();
    });

    test('preserves both results when two mirrors are rendered on demand concurrently', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/a.smpcat': createSmpCatalogue('a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
            'src/b.smpcat': createSmpCatalogue('b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorManager = services.shared.SmpMirrorManager;
        const mutableMirrorManager = mirrorManager as unknown as {
            importer: SmpImportService;
            mirrorContentByUri: Map<string, string>;
        };
        const mirrorUris = ['a', 'b'].map(name =>
            services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', `${name}.smpcat`))!
        );
        for (const mirrorUri of mirrorUris) {
            mutableMirrorManager.mirrorContentByUri.delete(mirrorUri.toString());
            services.shared.workspace.LangiumDocuments.deleteDocument(mirrorUri);
        }

        const renderImportedDocument = mutableMirrorManager.importer.renderImportedDocument.bind(mutableMirrorManager.importer);
        let notifyBothRendersFinished!: () => void;
        const bothRendersFinished = new Promise<void>(resolve => {
            notifyBothRendersFinished = resolve;
        });
        let resumeRenders!: () => void;
        const rendersCanFinish = new Promise<void>(resolve => {
            resumeRenders = resolve;
        });
        let finishedRenderCount = 0;
        vi.spyOn(mutableMirrorManager.importer, 'renderImportedDocument').mockImplementation(async request => {
            const rendered = await renderImportedDocument(request);
            finishedRenderCount++;
            if (finishedRenderCount === mirrorUris.length) {
                notifyBothRendersFinished();
            }
            await rendersCanFinish;
            return rendered;
        });

        const pendingContents = mirrorUris.map(uri => resolveServerFileContent(services.shared, uri));
        await bothRendersFinished;
        resumeRenders();

        const contents = await Promise.all(pendingContents);
        expect(contents[0]).toContain('catalogue a');
        expect(contents[1]).toContain('catalogue b');
        expect(mirrorManager.getMirrorContent(mirrorUris[0])).toBe(contents[0]);
        expect(mirrorManager.getMirrorContent(mirrorUris[1])).toBe(contents[1]);
    });

    test('unblocks an on-demand mirror read after a refresh is cancelled', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': createSmpCatalogue('types', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorManager = services.shared.SmpMirrorManager;
        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(
            path.join(projectDir, 'src', 'types.smpcat'),
        )!;
        const cancellation = new Cancellation.CancellationTokenSource();
        cancellation.cancel();
        const refresh = mirrorManager.refreshWorkspaceMirrors(cancellation.token);
        const refreshAssertion = expect(refresh).rejects.toBe(OperationCancelled);
        const content = mirrorManager.getOrCreateMirrorContent(mirrorUri);

        await refreshAssertion;
        await expect(content).resolves.toContain('catalogue types');
    });

    test('does not render SMP mirrors on demand for files outside declared source folders', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'smdl-gen/generated.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="generated" Name="generated">
  <Namespace Name="demo">
    <Type xsi:type="Types:Structure" Id="demo.GeneratedType" Name="GeneratedType" Uuid="abababab-abab-abab-abab-abababababab"/>
  </Namespace>
</Catalogue:Catalogue>
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const sourcePath = path.join(projectDir, 'smdl-gen', 'generated.smpcat');
        const mirrorUri = createSmpMirrorDescriptor(sourcePath)?.mirrorUri;
        expect(mirrorUri).toBeDefined();
        expect(services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(sourcePath)).toBeUndefined();

        const content = await resolveServerFileContent(services.shared, mirrorUri!);

        expect(content).toBeNull();
        expect(services.shared.workspace.LangiumDocuments.getDocument(mirrorUri!)).toBeUndefined();
    });

    test('does not scan SMP source folders outside the project directory', async () => {
        const outsideDir = path.join(tempDir, 'outside');
        fs.mkdirSync(outsideDir, { recursive: true });
        const outsideSmpPath = path.join(outsideDir, 'leaked.smpcat');
        fs.writeFileSync(outsideSmpPath, `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="leaked" Name="leaked">
  <Namespace Name="outside">
    <Type xsi:type="Types:Structure" Id="outside.Leaked" Name="Leaked" Uuid="abababab-abab-abab-abab-abababababab"/>
  </Namespace>
</Catalogue:Catalogue>
`, 'utf-8');
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source '../outside'
`, {});

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        expect(services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(outsideSmpPath)).toBeUndefined();
        const projectDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(projectDir, 'xsmp.project')));
        expect(projectDocument).toBeDefined();
        await services.shared.workspace.DocumentBuilder.build([projectDocument!], { validation: true }, Cancellation.CancellationToken.None);
        expect(projectDocument?.diagnostics?.some(diagnostic =>
            diagnostic.message.includes("Source path '../outside' is not contained within the project directory.")
        )).toBe(true);
    });

    test('revalidates surviving XSMP documents after deleting an SMP mirror source', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/types.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="dep" Name="types">
  <Namespace Name="dep">
    <Type xsi:type="Types:Structure" Id="dep.ExternalType" Name="ExternalType" Uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/>
  </Namespace>
</Catalogue:Catalogue>
`,
            'src/app.xsmpcat': `
catalogue app

namespace dep
{
    /** @uuid aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa */
    struct ExternalType
    {
    }
}
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const smpPath = path.join(projectDir, 'src', 'types.smpcat');
        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(smpPath);
        const appUri = URI.file(path.join(projectDir, 'src', 'app.xsmpcat'));
        const appDocumentBefore = services.shared.workspace.LangiumDocuments.getDocument(appUri);

        expect(mirrorUri).toBeDefined();
        expect(hasDiagnosticMessage(appDocumentBefore, 'Duplicated UUID.')).toBe(true);
        expect(hasDiagnosticMessage(appDocumentBefore, 'Duplicated Type name.')).toBe(true);

        fs.rmSync(smpPath);

        const updateHandler = services.shared.lsp.DocumentUpdateHandler as unknown as {
            updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
        };
        await updateHandler.updateWatchedFiles({
            changes: [
                { uri: URI.file(smpPath).toString(), type: FileChangeType.Deleted },
            ],
        });

        expect(mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)).toBeUndefined();

        const appDocumentAfter = services.shared.workspace.LangiumDocuments.getDocument(appUri);
        expect(hasDiagnosticMessage(appDocumentAfter, 'Duplicated UUID.')).toBe(false);
        expect(hasDiagnosticMessage(appDocumentAfter, 'Duplicated Type name.')).toBe(false);
    });

    test('ignores SMP files under smdl-gen and generates outputs from mirrored SMP sources', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
tool 'smp'
`, {
            'src/types.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="dep" Name="types">
  <Namespace Name="dep">
    <Type xsi:type="Types:Structure" Id="dep.ExternalType" Name="ExternalType" Uuid="cccccccc-cccc-cccc-cccc-cccccccccccc"/>
  </Namespace>
</Catalogue:Catalogue>
`,
            'src/smdl-gen/generated.smpcat': `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="ignored" Name="ignored"/>
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const ignoredMirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(path.join(projectDir, 'src', 'smdl-gen', 'generated.smpcat'));
        expect(ignoredMirrorUri).toBeUndefined();

        const project = services.shared.workspace.ProjectManager.getProjects().find(candidate => candidate.name === 'app');
        expect(project).toBeDefined();
        const report = await services.shared.DocumentGenerator.generateValidatedProject(project!, Cancellation.CancellationToken.None);

        expect(report.generatedProjects).toEqual(['app']);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'types.smpcat'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'types.smppkg'))).toBe(true);
    });

    test('skips validated project generation when visible documents have errors', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
tool 'smp'
`, {
            'src/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid dddddddd-dddd-dddd-dddd-dddddddddddd */
    struct Broken
    {
        field MissingType missing
    }
}
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const project = services.shared.workspace.ProjectManager.getProjects().find(candidate => candidate.name === 'app');
        expect(project).toBeDefined();
        const report = await services.shared.DocumentGenerator.generateValidatedProject(project!, Cancellation.CancellationToken.None);

        expect(report.generatedProjects).toEqual([]);
        expect(report.skippedProjects).toHaveLength(1);
        expect(report.skippedProjects[0].projectName).toBe('app');
        expect(report.skippedProjects[0].errorCount).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen'))).toBe(false);
    });

    test('switches from a real XSMP source to an SMP mirror after watched file updates', async () => {
        const foundationDir = createProject(tempDir, 'foundation', `
project 'foundation'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/foundation_catalogue.xsmpcat': `
catalogue foundation_catalogue

namespace demo::foundation
{
    /** @uuid ffffffff-ffff-ffff-ffff-ffffffffffff */
    public struct ExternalType
    {
    }
}
`,
        });
        const avionicsDir = createProject(tempDir, 'avionics', `
project 'avionics'
using 'ECSS_SMP_2025'
source 'src'
dependency 'foundation'
`, {
            'src/avionics_catalogue.xsmpcat': `
catalogue avionics_catalogue

namespace demo::avionics
{
    /** @uuid 12121212-1212-1212-1212-121212121212 */
    struct UsesExternal
    {
        field demo.foundation.ExternalType external
    }
}
`,
        });

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'foundation', uri: URI.file(foundationDir).toString() },
            { name: 'avionics', uri: URI.file(avionicsDir).toString() },
        ]);

        const avionicsUri = URI.file(path.join(avionicsDir, 'src', 'avionics_catalogue.xsmpcat'));
        const avionicsDocumentBefore = services.shared.workspace.LangiumDocuments.getDocument(avionicsUri);
        expect(avionicsDocumentBefore?.diagnostics?.some(diagnostic => diagnostic.message.includes('Could not resolve reference'))).not.toBe(true);

        const foundationXsmpPath = path.join(foundationDir, 'src', 'foundation_catalogue.xsmpcat');
        const foundationSmpPath = path.join(foundationDir, 'src', 'foundation_catalogue.smpcat');
        fs.rmSync(foundationXsmpPath);
        fs.writeFileSync(foundationSmpPath, `<?xml version="1.0" encoding="UTF-8"?>
<!--Generated By SmpTool-1.99-->
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="foundation" Name="foundation_catalogue">
  <Namespace Id="demo" Name="demo">
    <Namespace Id="demo.foundation" Name="foundation">
      <Type xsi:type="Types:Structure" Id="demo.foundation.ExternalType" Name="ExternalType" Visibility="public" Uuid="fefefefe-fefe-fefe-fefe-fefefefefefe"/>
    </Namespace>
  </Namespace>
</Catalogue:Catalogue>
`);

        const sendNotification = vi.fn(async () => undefined);
        const updateHandler = services.shared.lsp.DocumentUpdateHandler as unknown as {
            connection: { sendNotification: typeof sendNotification };
            updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
        };
        updateHandler.connection = { sendNotification };

        await updateHandler.updateWatchedFiles({
            changes: [
                { uri: URI.file(foundationXsmpPath).toString(), type: FileChangeType.Deleted },
                { uri: URI.file(foundationSmpPath).toString(), type: FileChangeType.Created },
            ],
        });

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(foundationSmpPath);
        expect(mirrorUri).toBeDefined();
        expect(mirrorUri && services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)).toBeDefined();
        expect(sendNotification).toHaveBeenCalledWith(SmpMirrorsChangedNotification, {
            changed: [mirrorUri!.toString()],
            deleted: [],
        });

        const avionicsDocumentAfter = services.shared.workspace.LangiumDocuments.getDocument(avionicsUri);
        expect(avionicsDocumentAfter?.diagnostics?.some(diagnostic => diagnostic.message.includes('Could not resolve reference'))).not.toBe(true);
    });

    test('does not notify mirror changes when the locked refresh is cancelled', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {});
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        vi.spyOn(services.shared.SmpMirrorManager, 'refreshWorkspaceMirrors').mockRejectedValueOnce(OperationCancelled);
        const sendNotification = vi.fn(async () => undefined);
        const updateHandler = services.shared.lsp.DocumentUpdateHandler as unknown as {
            connection: { sendNotification: typeof sendNotification };
            updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
        };
        updateHandler.connection = { sendNotification };

        await expect(updateHandler.updateWatchedFiles({
            changes: [{
                uri: URI.file(path.join(projectDir, 'xsmp.project')).toString(),
                type: FileChangeType.Changed,
            }],
        })).resolves.toBeUndefined();

        expect(sendNotification).not.toHaveBeenCalled();
    });

    test.each([
        ['source update', 1],
        ['committed mirror rebuild', 2],
    ] as const)('finishes an atomic mirror refresh when a newer workspace write arrives during the %s', async (_phase, cancelOnCall) => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/a.smpcat': createSmpCatalogue('before', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
        });
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const sourcePath = path.join(projectDir, 'src', 'a.smpcat');
        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(sourcePath)!;
        const mirrorDocument = services.shared.workspace.LangiumDocuments.getDocument(mirrorUri)!;
        const previousContent = mirrorDocument.textDocument.getText();
        fs.writeFileSync(sourcePath, createSmpCatalogue('after', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));

        const sendNotification = vi.fn(async () => undefined);
        const updateHandler = services.shared.lsp.DocumentUpdateHandler as unknown as {
            connection: { sendNotification: typeof sendNotification };
            updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
        };
        updateHandler.connection = { sendNotification };

        const documentBuilder = services.shared.workspace.DocumentBuilder;
        const originalUpdate = documentBuilder.update.bind(documentBuilder);
        let updateCallCount = 0;
        let newerWriteRan = false;
        let newerWrite: Promise<void> | undefined;
        vi.spyOn(documentBuilder, 'update').mockImplementation(async (changed, deleted, cancelToken) => {
            updateCallCount++;
            if (updateCallCount === cancelOnCall) {
                newerWrite = services.shared.workspace.WorkspaceLock.write(() => {
                    newerWriteRan = true;
                });
            }
            await originalUpdate(changed, deleted, cancelToken);
        });

        await updateHandler.updateWatchedFiles({
            changes: [{ uri: URI.file(sourcePath).toString(), type: FileChangeType.Changed }],
        });
        await newerWrite;

        const updatedContent = services.shared.SmpMirrorManager.getMirrorContent(mirrorUri);
        expect(newerWriteRan).toBe(true);
        expect(updateCallCount).toBeGreaterThanOrEqual(2);
        expect(updatedContent).not.toBe(previousContent);
        expect(updatedContent).toContain('catalogue after');
        expect(mirrorDocument.textDocument.getText()).toBe(updatedContent);
        expect(sendNotification).toHaveBeenCalledWith(SmpMirrorsChangedNotification, {
            changed: [mirrorUri.toString()],
            deleted: [],
        });
    });

    test('keeps the server alive when a stale SMP mirror document is reopened', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {});

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const staleSourcePath = path.join(projectDir, 'src', 'renamed-away.smpcat');
        const staleDescriptor = createSmpMirrorDescriptor(staleSourcePath);
        expect(staleDescriptor).toBeDefined();

        const staleDocument = services.shared.workspace.LangiumDocumentFactory.fromString('', staleDescriptor!.mirrorUri);
        services.shared.workspace.LangiumDocuments.addDocument(staleDocument);

        await expect(
            services.shared.workspace.DocumentBuilder.update(
                [staleDescriptor!.mirrorUri],
                [],
                Cancellation.CancellationToken.None,
            ),
        ).resolves.toBeUndefined();

        expect(services.shared.workspace.LangiumDocuments.getDocument(staleDescriptor!.mirrorUri)?.textDocument.getText()).toBe('');
    });
});

function createProject(rootDir: string, name: string, projectContent: string, files: Record<string, string>): string {
    const projectDir = path.join(rootDir, name);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), projectContent.trimStart());

    for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = path.join(projectDir, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, content.trimStart());
    }

    return projectDir;
}

function createSmpCatalogue(name: string, uuid: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="${name}" Name="${name}">
  <Namespace Id="demo" Name="demo">
    <Type xsi:type="Types:Structure" Id="demo.${name}" Name="${name}" Uuid="${uuid}"/>
  </Namespace>
</Catalogue:Catalogue>
`;
}

function positionParams(document: LangiumDocument, offset: number): TextDocumentPositionParams {
    return {
        textDocument: { uri: document.textDocument.uri },
        position: document.textDocument.positionAt(offset),
    };
}

function hasDiagnosticMessage(document: LangiumDocument | undefined, message: string): boolean {
    return document?.diagnostics?.some(diagnostic => diagnostic.message === message) === true;
}

function expectMirrorLocation(
    locations: LocationLink[],
    mirrorUri: URI,
    mirrorDocument: LangiumDocument,
    token: string,
): void {
    expect(locations).toHaveLength(1);
    expect(locations[0].targetUri).toBe(mirrorUri.toString());
    const targetText = mirrorDocument.textDocument.getText();
    const start = targetText.indexOf(token);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(locations[0].targetSelectionRange).toEqual({
        start: mirrorDocument.textDocument.positionAt(start),
        end: mirrorDocument.textDocument.positionAt(start + token.length),
    });
}
