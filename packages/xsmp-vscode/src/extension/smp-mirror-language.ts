import * as vscode from 'vscode';
import { URI } from 'langium';
import { smpMirrorScheme } from '@xsmp/core';
import { getSmpMirrorLanguageId } from '@xsmp/core/smp';

/** Select the XSMP language without associating real SMP XML files with it. */
export async function registerSmpMirrorLanguages(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(setMirrorLanguage));
    await Promise.all(vscode.workspace.textDocuments.map(setMirrorLanguage));
}

async function setMirrorLanguage(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== smpMirrorScheme || document.isClosed) {
        return;
    }
    const languageId = getSmpMirrorLanguageId(URI.parse(document.uri.toString()));
    if (languageId && languageId !== document.languageId) {
        try {
            // Changing the language emits another open event; the languageId guard makes it idempotent.
            await vscode.languages.setTextDocumentLanguage(document, languageId);
        } catch (error) {
            console.error(`Failed to select the XSMP language for ${document.uri.toString()}`, error);
        }
    }
}
