import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { GetServerFileContentRequest } from 'xsmp/lsp';
import { getSmpMirrorPreviewUri, isSmpMirrorPreviewSourcePath } from './smp-mirror-preview-support.js';

export const SmpMirrorPreviewViewType = 'xsmp.smpMirrorPreview';

interface SmpMirrorPreviewDocument extends vscode.CustomDocument {
    readonly uri: vscode.Uri;
}

export function registerSmpMirrorPreview(
    context: vscode.ExtensionContext,
    getClient: () => LanguageClient,
): void {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            SmpMirrorPreviewViewType,
            new SmpMirrorPreviewEditorProvider(getClient),
            {
                webviewOptions: {
                    retainContextWhenHidden: false,
                },
            },
        ),
    );
}

class SmpMirrorPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider<SmpMirrorPreviewDocument> {
    protected readonly getClient: () => LanguageClient;

    constructor(getClient: () => LanguageClient) {
        this.getClient = getClient;
    }

    async openCustomDocument(uri: vscode.Uri): Promise<SmpMirrorPreviewDocument> {
        return {
            uri,
            dispose() { },
        };
    }

    async resolveCustomEditor(
        document: SmpMirrorPreviewDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        webviewPanel.webview.html = renderLoadingHtml(document.uri);

        const targetUri = await this.resolveTargetUri(document.uri);
        const textDocument = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(textDocument, {
            viewColumn: webviewPanel.viewColumn,
            preview: true,
            preserveFocus: true,
        });

        const customEditorTab = findCustomEditorTab(document.uri);
        if (customEditorTab) {
            await vscode.window.tabGroups.close(customEditorTab, true);
        }
    }

    protected async resolveTargetUri(sourceUri: vscode.Uri): Promise<vscode.Uri> {
        if (sourceUri.scheme !== 'file' || !isSmpMirrorPreviewSourcePath(sourceUri.fsPath)) {
            return sourceUri;
        }

        const mirrorUri = getSmpMirrorPreviewUri(sourceUri.fsPath);
        if (!mirrorUri) {
            return sourceUri;
        }

        const content = await this.getClient().sendRequest(GetServerFileContentRequest, mirrorUri);
        return content ? vscode.Uri.parse(mirrorUri) : sourceUri;
    }
}

function findCustomEditorTab(uri: vscode.Uri): vscode.Tab | undefined {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (!(tab.input instanceof vscode.TabInputCustom)) {
                continue;
            }
            if (tab.input.viewType !== SmpMirrorPreviewViewType) {
                continue;
            }
            if (tab.input.uri.toString() === uri.toString()) {
                return tab;
            }
        }
    }
    return undefined;
}

function renderLoadingHtml(uri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 1rem;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
        }
    </style>
</head>
<body>
    Opening XSMP for ${escapeHtml(uri.fsPath)}...
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}
