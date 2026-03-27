import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getEmbeddedDocumentationTarget, type XsmpEmbeddedDocumentationTarget } from './embedded-documentation-links.js';
import { createXsmpDocumentSelector } from './xsmp-language-support.js';

export const OpenEmbeddedDocumentationCommand = 'xsmp.openDocumentation';

export function registerEmbeddedDocumentation(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(OpenEmbeddedDocumentationCommand, async (target: XsmpEmbeddedDocumentationTarget) => {
            const pageUri = resolveEmbeddedDocumentationUri(context, target.page);
            const targetUri = target.anchor ? pageUri.with({ fragment: target.anchor }) : pageUri;
            if (!fs.existsSync(pageUri.fsPath)) {
                void vscode.window.showErrorMessage(`Embedded XSMP documentation page not found: ${target.page}`);
                return;
            }

            await vscode.commands.executeCommand('markdown.showPreviewToSide', targetUri);
        }),
    );

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            createXsmpDocumentSelector(),
            {
                provideHover(document, position) {
                    const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
                    if (!range) {
                        return undefined;
                    }

                    if (isInsideCommentOrString(document, position)) {
                        return undefined;
                    }

                    const keyword = document.getText(range);
                    const target = getEmbeddedDocumentationTarget(document.languageId, keyword, document.lineAt(position.line).text);
                    if (!target) {
                        return undefined;
                    }

                    const targetUri = resolveEmbeddedDocumentationUri(context, target.page);
                    if (!fs.existsSync(targetUri.fsPath)) {
                        return undefined;
                    }

                    const markdown = new vscode.MarkdownString(
                        `[Open docs](${createOpenDocumentationCommandUri(target)})`,
                    );
                    markdown.isTrusted = { enabledCommands: [OpenEmbeddedDocumentationCommand] };
                    return new vscode.Hover(markdown, range);
                },
            },
        ),
    );
}

function resolveEmbeddedDocumentationUri(context: vscode.ExtensionContext, page: string): vscode.Uri {
    return vscode.Uri.file(context.asAbsolutePath(path.join('out', 'docs', page)));
}

function createOpenDocumentationCommandUri(target: XsmpEmbeddedDocumentationTarget): vscode.Uri {
    return vscode.Uri.parse(
        `command:${OpenEmbeddedDocumentationCommand}?${encodeURIComponent(JSON.stringify([target]))}`,
    );
}

function isInsideCommentOrString(document: vscode.TextDocument, position: vscode.Position): boolean {
    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.slice(0, position.character);
    if (linePrefix.includes('//')) {
        return true;
    }

    if (hasUnclosedQuote(linePrefix, '"') || hasUnclosedQuote(linePrefix, '\'')) {
        return true;
    }

    const textBeforeOffset = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const lastBlockCommentStart = textBeforeOffset.lastIndexOf('/*');
    const lastBlockCommentEnd = textBeforeOffset.lastIndexOf('*/');
    return lastBlockCommentStart > lastBlockCommentEnd;
}

function hasUnclosedQuote(text: string, quote: '"' | '\''): boolean {
    let escaped = false;
    let opened = false;
    for (const char of text) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === quote) {
            opened = !opened;
        }
    }
    return opened;
}
