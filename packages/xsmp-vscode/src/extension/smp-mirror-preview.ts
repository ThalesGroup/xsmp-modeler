import * as vscode from 'vscode';
import { getSmpSourcePathFromMirrorPath } from '@xsmp/core/smp';
import { getSmpMirrorPreviewUri, isSmpMirrorPreviewSourcePath } from './smp-mirror-preview-support.js';

export const SmpMirrorPreviewViewType = 'xsmp.smpMirrorPreview';

interface SmpMirrorPreviewDocument extends vscode.CustomDocument {
    readonly uri: vscode.Uri;
}

export function registerSmpMirrorPreview(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            SmpMirrorPreviewViewType,
            new SmpMirrorPreviewEditorProvider(),
            {
                webviewOptions: {
                    retainContextWhenHidden: false,
                },
            },
        ),
    );
    context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(event => {
        for (const tab of event.opened) {
            void migrateLegacyMirrorTab(tab);
        }
    }));
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            void migrateLegacyMirrorTab(tab);
        }
    }
}

/** Older releases persisted mirror tabs with the XSMP suffix instead of the source suffix. */
async function migrateLegacyMirrorTab(tab: vscode.Tab): Promise<void> {
    if (!(tab.input instanceof vscode.TabInputText) || tab.input.uri.scheme !== 'xsmp-smp') {
        return;
    }
    const uri = tab.input.uri;
    const viewColumn = tab.group.viewColumn;
    const preview = tab.isPreview;
    const sourcePath = getSmpSourcePathFromMirrorPath(uri.path);
    if (!sourcePath) {
        return;
    }
    try {
        const document = await vscode.workspace.openTextDocument(uri.with({ path: sourcePath }));
        await vscode.window.showTextDocument(document, {
            viewColumn,
            preserveFocus: true,
            preview,
        });
        // Fill the group before closing its old tab, and re-read handles after opening an editor.
        const current = vscode.window.tabGroups.all.find(group => group.viewColumn === viewColumn)?.tabs
            .find(candidate => candidate.input instanceof vscode.TabInputText && candidate.input.uri.toString() === uri.toString());
        if (current) {
            await vscode.window.tabGroups.close(current, true);
        }
    } catch (error) {
        console.error(`Failed to reopen SMP preview ${uri.toString()}`, error);
    }
}

class SmpMirrorPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider<SmpMirrorPreviewDocument> {
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

        const textDocument = await this.resolveTextDocument(document.uri);
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

    protected async resolveTextDocument(sourceUri: vscode.Uri): Promise<vscode.TextDocument> {
        if (sourceUri.scheme !== 'file' || !isSmpMirrorPreviewSourcePath(sourceUri.fsPath)) {
            return vscode.workspace.openTextDocument(sourceUri);
        }

        const mirrorUri = getSmpMirrorPreviewUri(sourceUri.fsPath);
        if (!mirrorUri) {
            return vscode.workspace.openTextDocument(sourceUri);
        }

        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(mirrorUri));
        return document.getText() ? document : vscode.workspace.openTextDocument(sourceUri);
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
