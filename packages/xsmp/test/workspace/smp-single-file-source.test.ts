import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileChangeType } from 'vscode-languageserver';
import { createSmpMirrorDescriptor } from '@xsmp/core/smp';
import { createBuiltinTestXsmpServices } from '../test-services.js';
import type { XsmpDocumentUpdateHandler } from '../../src/lsp/document-update-handler.js';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-single-smp-')); });
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function write(file: string, text: string): string {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return target;
}
function catalogue(name = 'External'): string {
    return `<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="${name}" Name="${name}"><Namespace Id="dep" Name="dep"><Type xsi:type="Types:Structure" Id="dep.Value" Name="Value" Visibility="public" Uuid="11111111-1111-1111-1111-111111111111"/></Namespace></Catalogue:Catalogue>`;
}
async function initialize(source: string) {
    write('xsmp.project', `project 'app' using 'ECSS_SMP_2025'\nsource '${source}'\nsource 'app.xsmpcat'\n`);
    write('app.xsmpcat', 'catalogue App\nnamespace app { /** @uuid 22222222-2222-2222-2222-222222222222 */ public struct Owner { field dep.Value value } }');
    const services = await createBuiltinTestXsmpServices(NodeFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'app', uri: URI.file(directory).toString() }]);
    return services;
}

describe('individual SMP source declarations', () => {
    test.each([
        ['external.smpcat', 'external.smpcat'],
        ['src', 'src/external.smpcat'],
        ['folder.smpcat', 'folder.smpcat/external.smpcat'],
    ])('loads source %s and resolves dependent native types', async (source, file) => {
        const sourcePath = write(file, catalogue());
        const services = await initialize(source);
        const mirrorUri = createSmpMirrorDescriptor(sourcePath)!.mirrorUri;
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual([sourcePath]);
        expect(services.shared.SmpMirrorManager.getMirrorContent(mirrorUri)).toContain('catalogue External');
        const native = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(directory, 'app.xsmpcat')))!;
        expect(native.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    });

    test('does not include neighbouring SMP files', async () => {
        const sourcePath = write('external.smpcat', catalogue());
        write('other.smpcat', catalogue('Other'));
        const services = await initialize('external.smpcat');
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual([sourcePath]);
    });

    test('refreshes an explicitly selected file after deletion and recreation', async () => {
        const sourcePath = write('external.smpcat', catalogue());
        const services = await initialize('external.smpcat');
        const mirrorUri = createSmpMirrorDescriptor(sourcePath)!.mirrorUri;
        const updates = services.shared.lsp.DocumentUpdateHandler as XsmpDocumentUpdateHandler;
        fs.unlinkSync(sourcePath);
        await updates.updateWatchedFiles({ changes: [{ uri: URI.file(sourcePath).toString(), type: FileChangeType.Deleted }] });
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual([]);
        expect(services.shared.SmpMirrorManager.getMirrorContent(mirrorUri)).toBeUndefined();
        write('external.smpcat', catalogue('Recreated'));
        await updates.updateWatchedFiles({ changes: [{ uri: URI.file(sourcePath).toString(), type: FileChangeType.Created }] });
        expect(services.shared.SmpMirrorManager.getMirrorContent(mirrorUri)).toContain('catalogue Recreated');
    });

    test('preserves native homologue precedence for a selected SMP file', async () => {
        const sourcePath = write('external.smpcat', catalogue());
        write('external.xsmpcat', 'catalogue Native');
        const services = await initialize('external.smpcat');
        const mirrorUri = createSmpMirrorDescriptor(sourcePath)!.mirrorUri;
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual([sourcePath]);
        expect(services.shared.SmpMirrorManager.getMirrorContent(mirrorUri)).toBeUndefined();
        expect(services.shared.SmpMirrorManager.getSourceDiagnostics(URI.file(sourcePath)).map(diagnostic => diagnostic.message))
            .toEqual([expect.stringContaining("Ignoring 'external.smpcat' because 'external.xsmpcat' is present")]);
    });

    test('keeps native single-file sources unchanged', async () => {
        const sourcePath = write('external.xsmpcat', 'catalogue External\nnamespace dep { /** @uuid 11111111-1111-1111-1111-111111111111 */ public struct Value {} }');
        const services = await initialize('external.xsmpcat');
        expect(services.shared.SmpWorkspaceIndex.getEligibleSourcePaths()).toEqual([]);
        expect(services.shared.workspace.LangiumDocuments.getDocument(URI.file(sourcePath))).toBeDefined();
        const native = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(directory, 'app.xsmpcat')))!;
        await services.shared.workspace.DocumentBuilder.build([native], { validation: true });
        expect(native.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    });
});
