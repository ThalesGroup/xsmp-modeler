import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cancellation, URI } from 'langium';
import { GenerateAllProjects, GenerateProject, GetContributionSummaries, RegisterContributions } from '@xsmp/core/lsp';
import { createSmpMirrorDescriptor } from '@xsmp/core/smp';
import {
    CompletionRequest,
    DidChangeWatchedFilesNotification,
    DidOpenTextDocumentNotification,
    DocumentSymbolRequest,
    ErrorCodes,
    ExitNotification,
    FileChangeType,
    InitializedNotification,
    InitializeRequest,
    LSPErrorCodes,
    RegistrationRequest,
    ResponseError,
    ShutdownRequest,
    TextDocumentContentRefreshRequest,
    TextDocumentContentRequest,
    createProtocolConnection,
} from 'vscode-languageserver-protocol/node';
import { expect, test } from 'vitest';

test('bundled language server supports virtual content, refresh, cancellation and shutdown over stdio', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xsmp-lsp-runtime-'));
    const text = 'catalogue Demo\nnamespace demo {\n    public struct Point {\n        field Smp.Int32 x\n    }\n}\n';
    await fs.writeFile(path.join(directory, 'xsmp.project'), "project 'demo' using 'ECSS_SMP_2025'\nsource '.'\n");
    await fs.writeFile(path.join(directory, 'demo.xsmpcat'), text);
    const uri = URI.file(path.join(directory, 'demo.xsmpcat')).toString();
    const sourcePath = path.join(directory, 'external.smpcat');
    await fs.writeFile(sourcePath, smpCatalogue('ExternalType'));
    const mirrorUri = createSmpMirrorDescriptor(sourcePath)!.mirrorUri.toString();
    const server = spawn(process.execPath, [fileURLToPath(new URL('../out/language/main.cjs', import.meta.url)), '--stdio'], {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 20_000,
    });
    const exited = new Promise<number | null>(resolve => server.once('exit', resolve));
    let stderr = '';
    server.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const connection = createProtocolConnection(server.stdout, server.stdin);
    connection.onRequest(RegistrationRequest.type, () => undefined);
    const refreshUris: string[] = [];
    let refreshReceived: ((text: string) => void) | undefined;
    connection.onRequest(TextDocumentContentRefreshRequest.type, async params => {
        refreshUris.push(params.uri);
        if (params.uri === mirrorUri) {
            // Fetch before acknowledging refresh: holding a server write lock would deadlock here.
            const content = await connection.sendRequest(TextDocumentContentRequest.type, { uri: params.uri });
            refreshReceived?.(content.text);
        }
    });
    connection.listen();
    const cancellation = new Cancellation.CancellationTokenSource();

    try {
        const initialized = await connection.sendRequest(InitializeRequest.type, {
            processId: process.pid,
            rootUri: URI.file(directory).toString(),
            workspaceFolders: [{ name: 'demo', uri: URI.file(directory).toString() }],
            capabilities: {
                workspace: { workspaceFolders: true, textDocumentContent: { dynamicRegistration: true } },
                textDocument: {
                    completion: { completionItem: { snippetSupport: true, insertReplaceSupport: true } },
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                },
            },
        });
        expect(initialized.capabilities.completionProvider).toBeDefined();
        expect(initialized.capabilities.workspace?.textDocumentContent?.schemes).toEqual(expect.arrayContaining(['xsmp', 'xsmp-smp']));

        // Hold the request at WorkspaceManager.ready, then cancel before starting the workspace.
        // This exercises cancellation across the JSON-RPC transport without a timing-dependent build.
        const cancelled = connection.sendRequest(CompletionRequest.type, {
            textDocument: { uri },
            position: { line: 3, character: 18 },
        }, cancellation.token).catch((error: unknown) => error);
        cancellation.cancel();
        await connection.sendNotification(InitializedNotification.type, {});
        const error = await cancelled;
        expect(error).toBeInstanceOf(ResponseError);
        expect(error).toMatchObject({ code: LSPErrorCodes.RequestCancelled });

        const builtin = await connection.sendRequest(TextDocumentContentRequest.type, {
            uri: URI.parse('xsmp:///ecss.smp.l1@ECSS_SMP_2025.xsmpcat').toString(),
        });
        expect(builtin.text).toContain('catalogue ecss_smp_l1');
        await expect(connection.sendRequest(TextDocumentContentRequest.type, { uri })).rejects.toMatchObject({
            code: ErrorCodes.InvalidParams,
        });
        expect(await connection.sendRequest(TextDocumentContentRequest.type, { uri: 'xsmp:/missing.xsmpcat' })).toEqual({ text: '' });

        const mirror = await connection.sendRequest(TextDocumentContentRequest.type, { uri: mirrorUri });
        expect(mirror.text).toContain('struct ExternalType');
        expect(refreshUris).toEqual([]);
        await connection.sendNotification(DidOpenTextDocumentNotification.type, {
            textDocument: { uri: mirrorUri, languageId: 'xsmpcat', version: 1, text: mirror.text },
        });

        async function changeSource(type: FileChangeType, content?: string): Promise<string> {
            const refreshed = new Promise<string>(resolve => { refreshReceived = resolve; });
            if (content === undefined) {
                await fs.unlink(sourcePath);
            } else {
                await fs.writeFile(sourcePath, smpCatalogue(content));
            }
            await connection.sendNotification(DidChangeWatchedFilesNotification.type, {
                changes: [{ uri: URI.file(sourcePath).toString(), type }],
            });
            const refreshedText = await refreshed;
            refreshReceived = undefined;
            return refreshedText;
        }

        expect(await changeSource(FileChangeType.Changed, 'UpdatedType')).toContain('struct UpdatedType');
        expect(await changeSource(FileChangeType.Deleted)).toBe('');
        expect(await changeSource(FileChangeType.Created, 'RestoredType')).toContain('struct RestoredType');

        const contributions = await connection.sendRequest(GetContributionSummaries, undefined);
        expect(contributions.length).toBeGreaterThan(0);

        const symbols = await connection.sendRequest(DocumentSymbolRequest.type, { textDocument: { uri } });
        expect(JSON.stringify(symbols)).toContain('Point');
        const completion = await connection.sendRequest(CompletionRequest.type, {
            textDocument: { uri },
            position: { line: 3, character: 18 },
        });
        expect(Array.isArray(completion) ? completion.length : completion?.items.length).toBeGreaterThan(0);

        // Langium returns ResponseError here. A duplicated JSON-RPC runtime can turn it into a result.
        await expect(connection.sendRequest(CompletionRequest.type, {
            textDocument: { uri: URI.file(path.join(directory, 'missing.xsmpcat')).toString() },
            position: { line: 0, character: 0 },
        })).rejects.toMatchObject({ code: LSPErrorCodes.ServerCancelled });

        await connection.sendRequest(ShutdownRequest.type);
        await connection.sendNotification(ExitNotification.type);
        expect(await exited, stderr).toBe(0);
        expect(stderr).toBe('');
    } finally {
        cancellation.dispose();
        connection.dispose();
        if (server.exitCode === null) {
            server.kill();
        }
        await exited;
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 30_000);

test.each(['project', 'workspace'] as const)('cancels %s generation before workspace initialization', async scope => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xsmp-lsp-cancel-'));
    await fs.writeFile(path.join(directory, 'xsmp.project'), "project 'demo'\nsource '.'\ntool 'smp'\n");
    await fs.writeFile(path.join(directory, 'demo.xsmpcat'), 'catalogue Demo\nnamespace demo {}\n');
    const server = spawn(process.execPath, [fileURLToPath(new URL('../out/language/main.cjs', import.meta.url)), '--stdio'], {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 20_000,
    });
    const exited = new Promise<number | null>(resolve => server.once('exit', resolve));
    let stderr = '';
    server.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const connection = createProtocolConnection(server.stdout, server.stdin);
    connection.onRequest(RegistrationRequest.type, () => undefined);
    connection.listen();
    const cancellation = new Cancellation.CancellationTokenSource();
    try {
        await connection.sendRequest(InitializeRequest.type, {
            processId: process.pid,
            rootUri: URI.file(directory).toString(),
            workspaceFolders: [{ name: 'demo', uri: URI.file(directory).toString() }],
            capabilities: { workspace: { workspaceFolders: true } },
        });
        const request = scope === 'project'
            ? connection.sendRequest(GenerateProject, URI.file(path.join(directory, 'xsmp.project')).toString(), cancellation.token)
            : connection.sendRequest(GenerateAllProjects, cancellation.token);
        const cancelled = request.catch((error: unknown) => error);
        cancellation.cancel();
        await connection.sendNotification(InitializedNotification.type, {});
        expect(await cancelled).toMatchObject({ code: LSPErrorCodes.RequestCancelled });
        await expect(fs.stat(path.join(directory, 'smdl-gen'))).rejects.toMatchObject({ code: 'ENOENT' });

        const report = await connection.sendRequest(GenerateAllProjects);
        expect(report.generatedProjects).toEqual(['demo']);
        expect(await fs.readFile(path.join(directory, 'smdl-gen', 'demo.smpcat'), 'utf8')).toContain('Catalogue');
        await connection.sendRequest(ShutdownRequest.type);
        await connection.sendNotification(ExitNotification.type);
        expect(await exited, stderr).toBe(0);
        expect(stderr).toBe('');
    } finally {
        cancellation.dispose();
        connection.dispose();
        if (server.exitCode === null) server.kill();
        await exited;
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 30_000);

test('cancels through LSP between generated files and leaves the server usable', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xsmp-lsp-cancel-files-'));
    await fs.writeFile(path.join(directory, 'xsmp.project'), "project 'demo'\nsource '.'\ntool 'audit.cancel'\n");
    await fs.writeFile(path.join(directory, 'demo.xsmpcat'), 'catalogue Demo\nnamespace demo {}\n');
    const descriptorPath = path.join(directory, 'audit.xsmptool');
    const handlerPath = path.join(directory, 'audit.mjs');
    await fs.writeFile(descriptorPath, "tool 'audit.cancel'\n");
    await fs.writeFile(handlerPath, `
export function registerContribution(api) {
    api.addGenerator(services => ({
        id: 'cancel-test',
        prepare({ createFiles }) {
            return createFiles({ gen: { directory: 'gen', writeMode: 'if-changed', cleanup: 'directory' } });
        },
        generate(node, context) {
            if (node.$type !== 'Catalogue') return;
            context.acceptTask(async () => {
                await context.files.write('gen', 'first.txt', 'first');
                const cancelled = new Promise(resolve => {
                    if (context.cancelToken.isCancellationRequested) return resolve();
                    const listener = context.cancelToken.onCancellationRequested(() => {
                        listener.dispose();
                        resolve();
                    });
                });
                services.lsp.Connection.sendNotification('audit/firstFile');
                await cancelled;
                await context.files.write('gen', 'second.txt', 'second');
            });
        }
    }));
}
`);
    const server = spawn(process.execPath, [fileURLToPath(new URL('../out/language/main.cjs', import.meta.url)), '--stdio'], {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 20_000,
    });
    const exited = new Promise<number | null>(resolve => server.once('exit', resolve));
    let stderr = '';
    server.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const connection = createProtocolConnection(server.stdout, server.stdin);
    connection.onRequest(RegistrationRequest.type, () => undefined);
    const cancellation = new Cancellation.CancellationTokenSource();
    connection.onNotification('audit/firstFile', () => cancellation.cancel());
    connection.listen();
    try {
        await connection.sendRequest(InitializeRequest.type, {
            processId: process.pid,
            rootUri: URI.file(directory).toString(),
            workspaceFolders: [{ name: 'demo', uri: URI.file(directory).toString() }],
            capabilities: { workspace: { workspaceFolders: true } },
        });
        await connection.sendNotification(InitializedNotification.type, {});
        const registration = await connection.sendRequest(RegisterContributions, [{
            extensionId: 'audit.cancel', extensionRoot: directory, descriptorPath, handlerPath,
            apiVersion: '2.0.0', aliases: [], deprecatedAliases: [], builtins: [],
        }]);
        expect(registration.failures).toEqual([]);
        await expect(connection.sendRequest(GenerateAllProjects, cancellation.token)).rejects.toMatchObject({
            code: LSPErrorCodes.RequestCancelled,
        });
        expect(await fs.readFile(path.join(directory, 'gen', 'first.txt'), 'utf8')).toBe('first');
        await expect(fs.stat(path.join(directory, 'gen', 'second.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await connection.sendRequest(GetContributionSummaries, undefined)).toContainEqual(expect.objectContaining({ id: 'audit.cancel' }));
        await connection.sendRequest(ShutdownRequest.type);
        await connection.sendNotification(ExitNotification.type);
        expect(await exited, stderr).toBe(0);
        expect(stderr).toBe('');
    } finally {
        cancellation.dispose();
        connection.dispose();
        if (server.exitCode === null) server.kill();
        await exited;
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 30_000);

function smpCatalogue(typeName: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="external" Name="external">
  <Namespace Name="external">
    <Type xsi:type="Types:Structure" Id="external.Type" Name="${typeName}" Uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/>
  </Namespace>
</Catalogue:Catalogue>
`;
}
