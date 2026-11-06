import { interruptAndCheck, URI, type Cancellation } from 'langium';
import type { TextDocumentContentProvider } from 'langium/lsp';
import { ErrorCodes, ResponseError, type TextDocumentContentParams, type TextDocumentContentResult } from 'vscode-languageserver-protocol';
import { builtInScheme, smpMirrorScheme } from '../builtins.js';
import type { XsmpSharedServices } from '../xsmp-module.js';

export class XsmpTextDocumentContentProvider implements TextDocumentContentProvider {
    readonly schemes = [builtInScheme, smpMirrorScheme];
    protected readonly services: XsmpSharedServices;
    protected supportsRefresh = false;

    constructor(services: XsmpSharedServices) {
        this.services = services;
        services.lsp.LanguageServer.onInitialize(params => {
            this.supportsRefresh = params.capabilities.workspace?.textDocumentContent !== undefined;
        });
    }

    async provideTextDocumentContent(params: TextDocumentContentParams, token: Cancellation.CancellationToken): Promise<TextDocumentContentResult> {
        await interruptAndCheck(token);
        const uri = URI.parse(params.uri);
        if (!this.schemes.includes(uri.scheme)) {
            throw new ResponseError(ErrorCodes.InvalidParams, `Unsupported virtual document scheme '${uri.scheme}'.`);
        }
        await this.services.workspace.WorkspaceManager.ready;
        const text = await this.services.workspace.WorkspaceLock.read(async () => {
            await interruptAndCheck(token);
            return uri.scheme === smpMirrorScheme
                ? await this.services.SmpMirrorManager.getOrCreateMirrorContent(uri)
                : this.services.workspace.LangiumDocuments.getDocument(uri)?.textDocument.getText();
        });
        // WorkspaceLock absorbs OperationCancelled; propagate request cancellation outside the lock.
        await interruptAndCheck(token);
        // A deleted mirror clears its open editor. The LSP client requires a result object.
        return { text: text ?? '' };
    }

    /** Refresh changed or deleted virtual documents after the workspace write has completed. */
    async refresh(uris: readonly URI[]): Promise<void> {
        const connection = this.services.lsp.Connection;
        if (!this.supportsRefresh || !connection || uris.length === 0) return;

        const results = await Promise.allSettled([...new Set(uris.map(uri => uri.toString()))]
            .map(async uri => connection.workspace.textDocumentContent.refresh(uri)));
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (errors.length > 0) {
            console.error('Could not refresh virtual XSMP documents.', new AggregateError(errors));
        }
    }
}
