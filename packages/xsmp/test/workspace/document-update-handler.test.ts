import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Cancellation, DocumentState, URI } from 'langium';
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
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP document update handler', () => {
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
