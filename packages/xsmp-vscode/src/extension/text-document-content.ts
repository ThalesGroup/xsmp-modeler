import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { TextDocumentContentRequest } from 'vscode-languageserver-protocol';

/** Re-read open virtual documents after the language client's providers have been registered. */
export function refreshOpenServerDocuments(client: LanguageClient): void {
    const providers = client.getFeature(TextDocumentContentRequest.method)?.getProviders() ?? [];
    for (const { uri } of vscode.workspace.textDocuments) {
        providers.find(provider => provider.scheme === uri.scheme)?.onDidChangeEmitter.fire(uri);
    }
}
