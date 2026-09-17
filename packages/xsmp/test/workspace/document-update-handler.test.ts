import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cancellation, DocumentState, OperationCancelled, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBuiltinTestXsmpServices } from '../test-services.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-document-update-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP document update handler', () => {
    test('rebuilds an in-memory built-in without reading its virtual URI from disk', async () => {
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);

        const builtinUri = URI.parse('xsmp:///ecss.smp@ECSS_SMP_2020.xsmpcat');
        const builtinDocument = services.shared.workspace.LangiumDocuments.getDocument(builtinUri);
        expect(builtinDocument).toBeDefined();
        const builtinText = builtinDocument!.textDocument.getText();

        const cancellation = new Cancellation.CancellationTokenSource();
        cancellation.cancel();
        await expect(
            services.shared.workspace.DocumentBuilder.update(
                [builtinUri],
                [],
                cancellation.token,
            ),
        ).rejects.toBe(OperationCancelled);
        expect(builtinDocument!.state).toBe(DocumentState.Changed);

        await expect(
            services.shared.workspace.DocumentBuilder.update(
                [],
                [],
                Cancellation.CancellationToken.None,
            ),
        ).resolves.toBeUndefined();

        expect(builtinDocument!.textDocument.getText()).toBe(builtinText);
        expect(builtinDocument!.state).toBe(DocumentState.Validated);
    });

    test('rebuilds opened documents to the validated state', async () => {
        const projectDir = createProject(tempDir, 'app', `
project 'app'
using 'ECSS_SMP_2025'
source 'src'
`, {
            'src/app.xsmpcat': `
catalogue app
`,
        });

        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir).toString() },
        ]);

        const documentUri = URI.file(path.join(projectDir, 'src', 'app.xsmpcat'));
        const document = services.shared.workspace.LangiumDocuments.getDocument(documentUri);
        expect(document).toBeDefined();
        expect(document?.state).toBe(DocumentState.IndexedReferences);

        services.shared.lsp.DocumentUpdateHandler.didOpenDocument?.({
            document: document!.textDocument,
        });

        await expect.poll(
            () => services.shared.workspace.LangiumDocuments.getDocument(documentUri)?.state,
            { timeout: 5_000 },
        ).toBe(DocumentState.Validated);

        await expect(
            services.shared.workspace.DocumentBuilder.waitUntil(DocumentState.Validated, documentUri, Cancellation.CancellationToken.None),
        ).resolves.toEqual(documentUri);

        expect(services.shared.workspace.LangiumDocuments.getDocument(documentUri)?.diagnostics).toBeDefined();
    });

    test('handles document build failures without leaving an unhandled rejection', async () => {
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'catalogue app\n',
            URI.file('/workspace/app.xsmpcat'),
        );
        const updateError = new Error('synthetic document build failure');
        vi.spyOn(services.shared.workspace.DocumentBuilder, 'update').mockRejectedValueOnce(updateError);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        services.shared.lsp.DocumentUpdateHandler.didChangeContent?.({
            document: document.textDocument,
        });

        await expect.poll(() => consoleError.mock.calls.length).toBe(1);
        expect(consoleError).toHaveBeenCalledWith('Could not perform document update.', updateError);
    });
});

function createProject(baseDir: string, projectName: string, projectContent: string, files: Record<string, string>): string {
    const projectDir = path.join(baseDir, projectName);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), projectContent.trimStart(), 'utf-8');

    for (const [relativePath, content] of Object.entries(files)) {
        const targetPath = path.join(projectDir, relativePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content.trimStart(), 'utf-8');
    }

    return projectDir;
}
