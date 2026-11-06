import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AstUtils, Cancellation, DocumentState, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import { resolveContributionManifestEntries } from '@xsmp/core/contributions';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-contribution-restoration-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

const descriptorText = 'tool "restored"\n';
const builtinText = `catalogue Current
namespace ext {
    /** @uuid 46646611-3ed9-4d3c-8a22-5e3544cc6575 */
    public struct Active {}
}
`;

function createContribution() {
    const extensionRoot = path.join(tempDir, 'extension');
    fs.mkdirSync(extensionRoot);
    fs.writeFileSync(path.join(extensionRoot, 'restored.xsmptool'), descriptorText);
    fs.writeFileSync(path.join(extensionRoot, 'types.xsmpcat'), builtinText);
    fs.writeFileSync(path.join(extensionRoot, 'handler.mjs'), 'export function registerContribution() {}\n');
    return resolveContributionManifestEntries('test.restored', extensionRoot, [{
        descriptor: 'restored.xsmptool',
        handler: 'handler.mjs',
        apiVersion: '^2.0.0',
        builtins: ['types.xsmpcat'],
    }]);
}

describe('contribution document restoration', () => {
    test.each(['empty', 'stale'] as const)('restores canonical documents over %s documents opened before registration', async mode => {
        const entries = createContribution();
        const projectDir = path.join(tempDir, 'project');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'xsmp.project'), 'project "app"\ntool "restored"\nsource "src"\n');
        fs.writeFileSync(path.join(projectDir, 'src', 'app.xsmpcat'), `catalogue app
namespace app {
    /** @uuid 8e76e765-e3a6-47bc-8dbf-c3c791107642 */
    public struct Consumer { field ext.Active value }
}
`);
        const services = createXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);
        const { LangiumDocuments: documents, LangiumDocumentFactory: factory, DocumentBuilder: builder, IndexManager: index } = services.shared.workspace;
        const builtinUri = URI.parse('xsmp:/extensions/test.restored/types.xsmpcat');
        const descriptorUri = URI.parse('xsmp:/extensions/test.restored/restored.xsmptool');
        const oldDocuments = ([
            [builtinUri, 'catalogue Obsolete namespace ext { public struct Obsolete {} }'],
            [descriptorUri, 'tool "obsolete"'],
        ] as const).map(([uri, text]) => mode === 'empty'
            ? factory.fromModel({ $type: 'INVALID' }, uri)
            : factory.fromString(text, uri));
        for (const document of oldDocuments) documents.addDocument(document);
        await builder.update(oldDocuments.map(document => document.uri), [], Cancellation.CancellationToken.None);
        if (mode === 'empty') {
            expect(oldDocuments[0].textDocument.getText()).toBe('');
            expect(oldDocuments[0].parseResult.parserErrors).not.toHaveLength(0);
        } else {
            expect(index.allElements().some(element => element.name === 'ext.Obsolete')).toBe(true);
        }

        const report = await services.shared.ContributionRegistry.registerExtensionManifestEntries(entries);

        expect(report.failures).toEqual([]);
        expect(documents.getDocument(builtinUri)?.textDocument.getText()).toBe(builtinText);
        expect(documents.getDocument(descriptorUri)?.textDocument.getText()).toBe(descriptorText);
        expect(documents.getDocument(builtinUri)).toBe(services.shared.ContributionRegistry.getPayloadBuiltinDocuments()[0]);
        expect(documents.getDocument(builtinUri)?.state).toBe(DocumentState.Validated);
        expect(index.allElements().some(element => element.name === 'ext.Obsolete')).toBe(false);
        expect(index.allElements().some(element => element.name === 'ext.Active')).toBe(true);
        const consumer = documents.getDocument(URI.file(path.join(projectDir, 'src', 'app.xsmpcat')))!;
        expect(consumer.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        expect(consumer.references).toHaveLength(1);
        expect(AstUtils.getDocument(consumer.references[0].ref!)).toBe(documents.getDocument(builtinUri));
    });

    test('deduplicates builtin URIs and manifest entries and leaves repeated registration unchanged', async () => {
        const entries = createContribution().map(entry => ({ ...entry, builtins: [...entry.builtins, ...entry.builtins] }));
        const services = createXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const registry = services.shared.ContributionRegistry;
        const report = await registry.registerExtensionManifestEntries([...entries, ...entries]);
        expect(report.failures).toEqual([]);
        const builtin = registry.getPayloadBuiltinDocuments()[0];
        expect(services.shared.workspace.LangiumDocuments.getDocument(builtin.uri)).toBe(builtin);
        const build = vi.spyOn(services.shared.workspace.DocumentBuilder, 'build');

        const repeated = await registry.registerExtensionManifestEntries([...entries, ...entries]);

        expect(repeated.failures).toEqual([]);
        expect(build).not.toHaveBeenCalled();
        expect(services.shared.workspace.LangiumDocuments.getDocument(builtin.uri)).toBe(builtin);
    });
});
