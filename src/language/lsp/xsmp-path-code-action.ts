import { AstUtils, type Cancellation, type LangiumDocument, type MaybePromise } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import { CodeActionKind, TextEdit, type Diagnostic } from 'vscode-languageserver';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import type { CodeAction, Command, Range } from 'vscode-languageserver-types';
import * as ast from '../generated/ast.js';

export class XsmpPathCodeActionProvider implements CodeActionProvider {

    getCodeActions(document: LangiumDocument, params: CodeActionParams, _cancelToken?: Cancellation.CancellationToken): MaybePromise<Array<Command | CodeAction>> {
        const groups = new Map<string, { path: ast.Path; diagnostics: Diagnostic[] }>();
        const paths = AstUtils.streamAst(document.parseResult.value).filter(ast.isPath).toArray();

        for (const diagnostic of params.context.diagnostics) {
            const path = this.findDiagnosticPath(document, diagnostic.range, paths);
            if (!path || path.unsafe || !path.$cstNode) {
                continue;
            }

            const key = this.getPathKey(path);
            const group = groups.get(key);
            if (group) {
                group.diagnostics.push(diagnostic);
            } else {
                groups.set(key, { path, diagnostics: [diagnostic] });
            }
        }

        return Array.from(groups.values(), group => this.createUnsafeCodeAction(document, group.path, group.diagnostics));
    }

    protected findDiagnosticPath(document: LangiumDocument, range: Range, paths: ast.Path[]): ast.Path | undefined {
        const start = document.textDocument.offsetAt(range.start);
        const end = document.textDocument.offsetAt(range.end);
        let candidate: ast.Path | undefined;
        let candidateSpan = Number.MAX_SAFE_INTEGER;

        for (const path of paths) {
            const pathRange = path.$cstNode?.range;
            if (!pathRange) {
                continue;
            }

            const pathStart = document.textDocument.offsetAt(pathRange.start);
            const pathEnd = document.textDocument.offsetAt(pathRange.end);
            if (start < pathStart || end > pathEnd) {
                continue;
            }

            const span = pathEnd - pathStart;
            if (span < candidateSpan) {
                candidate = path;
                candidateSpan = span;
            }
        }

        return candidate;
    }

    protected createUnsafeCodeAction(document: LangiumDocument, path: ast.Path, diagnostics: Diagnostic[]): CodeAction {
        return {
            title: 'Declare as `unsafe`.',
            kind: CodeActionKind.QuickFix,
            diagnostics,
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [TextEdit.insert(path.$cstNode!.range.start, 'unsafe ')],
                },
            },
        };
    }

    protected getPathKey(path: ast.Path): string {
        const range = path.$cstNode!.range;
        return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    }
}
