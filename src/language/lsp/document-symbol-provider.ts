import { interruptAndCheck, type AstNode, Cancellation, type LangiumDocument, type MaybePromise, type WorkspaceLock } from 'langium';
import type { DocumentSymbolProvider, NodeKindProvider } from 'langium/lsp';
import type { DocumentSymbol, DocumentSymbolParams } from 'vscode-languageserver';
import * as ast from '../generated/ast.js';
import type { XsmpNodeInfoProvider } from './node-info-provider.js';
import { type AttributeHelper } from '../utils/attribute-helper.js';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpDocumentSymbolProvider implements DocumentSymbolProvider {

    protected readonly nodeKindProvider: NodeKindProvider;
    protected readonly nodeInfoProvider: XsmpNodeInfoProvider;
    protected readonly workspaceManager: WorkspaceLock;
    protected readonly attrHelper: AttributeHelper;

    constructor(services: XsmpServices) {
        this.nodeKindProvider = services.shared.lsp.NodeKindProvider;
        this.nodeInfoProvider = services.shared.lsp.NodeInfoProvider;
        this.workspaceManager = services.shared.workspace.WorkspaceLock;
        this.attrHelper = services.shared.AttributeHelper;
    }

    getSymbols(document: LangiumDocument, _params: DocumentSymbolParams, cancelToken = Cancellation.CancellationToken.None): MaybePromise<DocumentSymbol[]> {
        return this.workspaceManager.read(() => this.getSymbol(document, document.parseResult.value, cancelToken));
    }

    protected async getSymbol(document: LangiumDocument, astNode: AstNode, cancelToken: Cancellation.CancellationToken): Promise<DocumentSymbol[]> {
        await interruptAndCheck(cancelToken);
        const node = astNode.$cstNode;
        const name = this.getSymbolName(astNode);

        if (node && name) {
            return [{
                kind: this.nodeKindProvider.getSymbolKind(astNode),
                name: name,
                range: node.range,
                selectionRange: node.range,
                children: await this.getChildSymbols(document, astNode, cancelToken),
                tags: this.nodeInfoProvider.getTags(astNode),
                detail: this.nodeInfoProvider.getDetails(astNode),
            }];
        }
        return await this.getChildSymbols(document, astNode, cancelToken);
    }

    protected async getChildSymbols(document: LangiumDocument, astNode: AstNode, cancelToken: Cancellation.CancellationToken): Promise<DocumentSymbol[]> {
        if ('elements' in astNode) {
            const symbols = await Promise.all(
                (astNode.elements as AstNode[]).map(async (e) => await this.getSymbol(document, e, cancelToken))
            );
            return symbols.flat();
        }
        return [];
    }

    protected getSymbolName(node: AstNode): string | undefined {
        if (!ast.reflection.isSubtype(node.$type, ast.NamedElement)) {
            return undefined;
        }
        return this.attrHelper.getSignature(node as ast.NamedElement);
    }
}