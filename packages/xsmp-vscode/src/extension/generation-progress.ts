import * as vscode from 'vscode';
import { LSPErrorCodes, ResponseError } from 'vscode-languageclient/node';
import type { XsmpProjectGenerationReport } from '@xsmp/core/lsp';

export async function withGenerationProgress(
    generate: (token: vscode.CancellationToken) => Promise<XsmpProjectGenerationReport>,
): Promise<XsmpProjectGenerationReport | undefined> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating XSMP sources',
        cancellable: true,
    }, async (_progress, token) => {
        try {
            return await generate(token);
        } catch (error) {
            if (error instanceof vscode.CancellationError
                || (error instanceof ResponseError && error.code === LSPErrorCodes.RequestCancelled)) {
                return undefined;
            }
            throw error;
        }
    });
}
