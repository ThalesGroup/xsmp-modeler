import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { GetServerFileContentRequest } from 'xsmp/lsp';
import { getSmpMirrorSourceUri } from 'xsmp/smp';
import { URI } from 'langium';
import { getSmpMirrorPreviewUri, isSmpMirrorPreviewSourcePath } from './smp-mirror-preview-support.js';

export const OpenSmpMirrorCommand = 'xsmp.openSmpMirror';
export const OpenSmpXmlSourceCommand = 'xsmp.openSmpXmlSource';

export function registerSmpMirrorCommands(
    context: vscode.ExtensionContext,
    getClient: () => LanguageClient,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(OpenSmpMirrorCommand, async (uri?: vscode.Uri) => {
            const sourceUri = getActiveSmpSourceUri(uri);
            if (!sourceUri) {
                void vscode.window.showErrorMessage('Open or select an SMP XML file (.smpcat, .smpcfg, .smplnk, .smpasb, or .smpsed) before opening XSMP.');
                return;
            }

            const mirrorUri = getSmpMirrorPreviewUri(sourceUri.fsPath);
            if (!mirrorUri) {
                void vscode.window.showErrorMessage(`No XSMP mapping is available for '${sourceUri.fsPath}'.`);
                return;
            }

            const content = await getClient().sendRequest(GetServerFileContentRequest, mirrorUri);
            if (!content) {
                void vscode.window.showInformationMessage(`No XSMP view is currently available for '${sourceUri.fsPath}'.`);
                return;
            }

            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(mirrorUri));
            await vscode.window.showTextDocument(document, { preview: false });
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(OpenSmpXmlSourceCommand, async (uri?: vscode.Uri) => {
            const sourceUri = getActiveSmpSourceUri(uri)
                ?? getMirrorSourceUri(uri ?? vscode.window.activeTextEditor?.document.uri);
            if (!sourceUri) {
                void vscode.window.showErrorMessage('Open an SMP XML mirror or source file before reopening the XML source.');
                return;
            }

            const document = await vscode.workspace.openTextDocument(sourceUri);
            await vscode.window.showTextDocument(document, { preview: false });
        }),
    );
}

function getActiveSmpSourceUri(uri?: vscode.Uri): vscode.Uri | undefined {
    const candidate = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!candidate || candidate.scheme !== 'file') {
        return undefined;
    }
    return isSmpMirrorPreviewSourcePath(candidate.fsPath) ? candidate : undefined;
}

function getMirrorSourceUri(uri: vscode.Uri | undefined): vscode.Uri | undefined {
    if (!uri || uri.scheme !== 'xsmp-smp') {
        return undefined;
    }

    const sourceUri = getSmpMirrorSourceUri(URI.parse(uri.toString()));
    return sourceUri ? vscode.Uri.parse(sourceUri.toString()) : undefined;
}
