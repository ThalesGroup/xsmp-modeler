import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { TextDocumentContentRefreshRequest, TextDocumentContentRequest } from 'vscode-languageserver-protocol';

export interface ServerFiles extends vscode.Disposable {
    /** Install immediately after start(), before registering external contributions. */
    onClientStarted(): void;
    /** Re-read retained editors after contributions have been restored. */
    refreshOpenDocuments(): void;
}

/** Give server-backed documents native read-only file editors, which VS Code can restore. */
export function registerServerFiles(client: LanguageClient, schemes: readonly string[]): ServerFiles {
    const files = new Map(schemes.map(scheme => [scheme, new ServerFileSystem(client)]));
    const registrations = [...files].map(([scheme, provider]) =>
        vscode.workspace.registerFileSystemProvider(scheme, provider, { isReadonly: true, isCaseSensitive: true }));
    let refreshHandler: vscode.Disposable | undefined;
    let disposed = false;

    function refresh(uri: vscode.Uri): void {
        const fileSystem = files.get(uri.scheme);
        if (fileSystem) {
            fileSystem.refresh(uri);
        } else {
            const providers = client.getFeature(TextDocumentContentRequest.method)?.getProviders() ?? [];
            for (const provider of providers) {
                if (provider.scheme === uri.scheme) {
                    provider.onDidChangeEmitter.fire(uri);
                }
            }
        }
    }

    return {
        onClientStarted(): void {
            if (disposed) return;
            // The standard handler edits text models directly. File editors must instead
            // reload through their file provider, or they can become dirty and read twice.
            refreshHandler?.dispose();
            refreshHandler = client.onRequest(TextDocumentContentRefreshRequest.type, params => {
                refresh(client.protocol2CodeConverter.asUri(params.uri));
            });
        },
        refreshOpenDocuments(): void {
            if (disposed) return;
            for (const { uri } of vscode.workspace.textDocuments) {
                refresh(uri);
            }
        },
        dispose(): void {
            disposed = true;
            refreshHandler?.dispose();
            refreshHandler = undefined;
            for (const registration of registrations) registration.dispose();
            for (const provider of files.values()) provider.dispose();
        },
    };
}

class ServerFileSystem implements vscode.FileSystemProvider, vscode.Disposable {
    private readonly client: LanguageClient;
    private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.changes.event;
    private readonly created = Date.now();
    private modified = this.created;

    constructor(client: LanguageClient) {
        this.client = client;
    }

    refresh(uri: vscode.Uri): void {
        // A scalar revision keeps etags fresh without retaining metadata for every file.
        this.modified = Math.max(Date.now(), this.modified + 1);
        this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    stat(): vscode.FileStat {
        return {
            type: vscode.FileType.File,
            ctime: this.created,
            mtime: this.modified,
            size: 0,
            permissions: vscode.FilePermission.Readonly,
        };
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const result = await this.client.sendRequest(TextDocumentContentRequest.type, {
            uri: this.client.code2ProtocolConverter.asUri(uri),
        });
        return Buffer.from(result.text, 'utf8');
    }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    readDirectory(uri: vscode.Uri): never {
        throw vscode.FileSystemError.FileNotADirectory(uri);
    }

    createDirectory(uri: vscode.Uri): never {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    writeFile(uri: vscode.Uri): never {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    delete(uri: vscode.Uri): never {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    rename(uri: vscode.Uri): never {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    dispose(): void {
        this.changes.dispose();
    }
}
