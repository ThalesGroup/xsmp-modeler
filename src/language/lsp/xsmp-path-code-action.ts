import { AstUtils, type Cancellation, type LangiumDocument, type MaybePromise } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import { CodeActionKind, TextEdit, type Diagnostic } from 'vscode-languageserver';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import type { CodeAction, Command, Range } from 'vscode-languageserver-types';
import * as ast from '../generated/ast.js';

export class XsmpPathCodeActionProvider implements CodeActionProvider {

    getCodeActions(document: LangiumDocument, params: CodeActionParams, _cancelToken?: Cancellation.CancellationToken): MaybePromise<Array<Command | CodeAction>> {
        const groups = new Map<string, { node: ast.Path | ast.LocalNamedReference; diagnostics: Diagnostic[] }>();
        const paths = AstUtils.streamAst(document.parseResult.value).filter(ast.isPath).toArray();
        const localReferences = AstUtils.streamAst(document.parseResult.value)
            .filter((node): node is ast.LocalNamedReference => ast.isLocalNamedReference(node) && !ast.isPathNamedSegment(node))
            .toArray();

        for (const diagnostic of params.context.diagnostics) {
            const node = this.findDiagnosticNode(document, diagnostic.range, paths, localReferences);
            if (!node || node.unsafe || !node.$cstNode) {
                continue;
            }

            const key = this.getNodeKey(node);
            const group = groups.get(key);
            if (group) {
                group.diagnostics.push(diagnostic);
            } else {
                groups.set(key, { node, diagnostics: [diagnostic] });
            }
        }

        return Array.from(groups.values(), group => this.createUnsafeCodeAction(document, group.node, group.diagnostics));
    }

    protected findDiagnosticNode(
        document: LangiumDocument,
        range: Range,
        paths: ast.Path[],
        localReferences: ast.LocalNamedReference[],
    ): ast.Path | ast.LocalNamedReference | undefined {
        const start = document.textDocument.offsetAt(range.start);
        const end = document.textDocument.offsetAt(range.end);
        let candidate: ast.Path | ast.LocalNamedReference | undefined;
        let candidateSpan = Number.MAX_SAFE_INTEGER;

        for (const node of [...paths, ...localReferences]) {
            const pathRange = node.$cstNode?.range;
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
                candidate = node;
                candidateSpan = span;
            }
        }

        return candidate;
    }

    protected createUnsafeCodeAction(document: LangiumDocument, node: ast.Path | ast.LocalNamedReference, diagnostics: Diagnostic[]): CodeAction {
        return {
            title: 'Declare as `unsafe`.',
            kind: CodeActionKind.QuickFix,
            diagnostics,
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [TextEdit.insert(node.$cstNode!.range.start, 'unsafe ')],
                },
            },
        };
    }

    protected getNodeKey(node: ast.Path | ast.LocalNamedReference): string {
        const range = node.$cstNode!.range;
        return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    }
}
