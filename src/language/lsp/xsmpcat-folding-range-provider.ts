import { type LangiumDocument } from 'langium';
import { DefaultFoldingRangeProvider, type FoldingRangeAcceptor } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';

export class XsmpcatFoldingRangeProvider extends DefaultFoldingRangeProvider {
    protected override collectFolding(document: LangiumDocument, acceptor: FoldingRangeAcceptor): void {
        const root = document.parseResult.value;
        if (ast.isCatalogue(root)) {
            this.collectCommentFolding(document, root, acceptor);
            for (const namespace of root.elements) {
                this.collectNamespaceFolding(document, namespace, acceptor);
            }
        }
    }
    protected collectNamespaceFolding(document: LangiumDocument, namespace: ast.Namespace, acceptor: FoldingRangeAcceptor): void {
        this.collectObjectFolding(document, namespace, acceptor);
        for (const element of namespace.elements) {
            if (element.$type === ast.Namespace)
                this.collectNamespaceFolding(document, element, acceptor);
            else
                this.collectTypeFolding(document, element, acceptor);
        }
    }
    protected collectTypeFolding(document: LangiumDocument, type: ast.Type, acceptor: FoldingRangeAcceptor): void {
        this.collectObjectFolding(document, type, acceptor);
    }
}