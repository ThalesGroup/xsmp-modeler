import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { builtInScheme } from '../language/builtins.js';
import { createProjectWizard } from '../language/wizard/wizard.js';
import { GetServerFileContentRequest, RegisterContributor } from '../language/lsp/language-server.js';

let client: LanguageClient;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);
    BuiltinLibraryFileSystemProvider.register(context);

    // New project Wizard
    context.subscriptions.push(
        vscode.commands.registerCommand('xsmp.wizard', createProjectWizard)
    );
    vscode.commands.registerCommand('xsmp.registerContributor', async (modulePath: string) => {
        client.sendRequest(RegisterContributor, modulePath);
    });

}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    return client ? client.stop() : undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs')),
        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
        // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
        debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET ?? '6009'}`] },

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
        },

        // Options to control the language client
        clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'xsmpproject' },
                { scheme: builtInScheme, language: 'xsmpproject' },
                { scheme: 'file', language: 'xsmpcat' },
                { scheme: builtInScheme, language: 'xsmpcat' },
                { scheme: 'file', language: 'xsmpasb' },
                { scheme: builtInScheme, language: 'xsmpasb' },
                { scheme: 'file', language: 'xsmpcfg' },
                { scheme: builtInScheme, language: 'xsmpcfg' },
                { scheme: 'file', language: 'xsmplnk' },
                { scheme: builtInScheme, language: 'xsmplnk' },
                { scheme: 'file', language: 'xsmpsed' },
                { scheme: builtInScheme, language: 'xsmpsed' },
            ],
            markdown: {
                isTrusted: true, supportHtml: true
            },
        },

        // Create the language client and start the client.
        client = new LanguageClient(
            'xsmp',
            'Xsmp',
            serverOptions,
            clientOptions
        );
    // Start the client. This will also launch the server
    await client.start();
    return client;
}

export class BuiltinLibraryFileSystemProvider implements vscode.FileSystemProvider {

    static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(builtInScheme, new BuiltinLibraryFileSystemProvider(), {
                isReadonly: true,
                isCaseSensitive: true
            }));
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const date = Date.now();
        const value = await client.sendRequest(GetServerFileContentRequest, uri.toString());
        if (value) {
            return {
                ctime: date,
                mtime: date,
                size: Buffer.from(value).length,
                type: vscode.FileType.File
            };
        }

        return {
            ctime: date,
            mtime: date,
            size: 0,
            type: vscode.FileType.Unknown
        };
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const value = await client.sendRequest(GetServerFileContentRequest, uri.toString());
        if (value) { return new Uint8Array(Buffer.from(value)); }

        return new Uint8Array();
    }

    // The following class members only serve to satisfy the interface

    private readonly didChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile = this.didChangeFile.event;

    watch() {
        return {
            dispose: () => { }
        };
    }

    readDirectory(): [] {
        throw vscode.FileSystemError.NoPermissions();
    }

    createDirectory() {
        throw vscode.FileSystemError.NoPermissions();
    }

    writeFile() {
        throw vscode.FileSystemError.NoPermissions();
    }

    delete() {
        throw vscode.FileSystemError.NoPermissions();
    }

    rename() {
        throw vscode.FileSystemError.NoPermissions();
    }
}
