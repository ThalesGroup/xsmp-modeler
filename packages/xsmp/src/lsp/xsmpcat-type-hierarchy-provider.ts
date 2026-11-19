import { AstUtils, CstUtils, GrammarUtils, type AstNode, type MaybePromise } from 'langium';
import { AbstractTypeHierarchyProvider, type NodeKindProvider } from 'langium/lsp';
import { type TypeHierarchyItem } from 'vscode-languageserver';
import * as ast from '../generated/ast-partial.js';
import type { XsmpcatServices } from '../xsmpcat-module.js';
import type { XsmpNodeInfoProvider } from './node-info-provider.js';

export class XsmpcatTypeHierarchyProvider extends AbstractTypeHierarchyProvider {
    protected readonly nodeInfoProvider: XsmpNodeInfoProvider;
    protected readonly nodeKindProvider: NodeKindProvider;

    constructor(services: XsmpcatServices) {
        super(services);
        this.nodeInfoProvider = services.shared.lsp.NodeInfoProvider;
        this.nodeKindProvider = services.shared.lsp.NodeKindProvider;
    }

    protected override getTypeHierarchyItems(targetNode: AstNode): TypeHierarchyItem[] | undefined {
        return super.getTypeHierarchyItems(targetNode, AstUtils.getDocument(targetNode));
    }

    protected override getSupertypes(node: AstNode): MaybePromise<TypeHierarchyItem[] | undefined> {
        const items = this.getSupertypeNodes(node).map(type => this.getXsmpTypeHierarchyItem(type));
        return items.length === 0 ? undefined : items;
    }

    private getSupertypeNodes(node: AstNode): ast.Type[] {
        switch (node.$type) {
            case ast.Interface.$type:
                return (node as ast.Interface).base.flatMap(base => base.ref ? [base.ref] : []);
            case ast.Model.$type:
            case ast.Service.$type: {
                const component = node as ast.Component;
                return [component.base?.ref, ...component.interface.map(base => base.ref)]
                    .filter(type => type !== undefined);
            }
            case ast.Class.$type:
            case ast.Exception.$type: {
                const base = (node as ast.Class).base?.ref;
                return base ? [base] : [];
            }
            case ast.Integer.$type:
            case ast.Float.$type: {
                const base = (node as ast.Integer | ast.Float).primitiveType?.ref;
                return base ? [base] : [];
            }
        }
        return [];
    }

    protected getXsmpTypeHierarchyItem(targetNode: ast.Type): TypeHierarchyItem {
        const document = AstUtils.getDocument(targetNode);
        return {
            name: targetNode.name ?? '<anonymous>',
            range: targetNode.$cstNode!.range,
            selectionRange: GrammarUtils.findNodeForProperty(targetNode.$cstNode, ast.NamedElement.name)!.range,
            uri: document.uri.toString(),
            kind: this.nodeKindProvider.getSymbolKind(targetNode),
            tags: this.nodeInfoProvider.getTags(targetNode),
            detail: this.nodeInfoProvider.getDetails(targetNode),
        };

    }
    protected override getSubtypes(node: AstNode): MaybePromise<TypeHierarchyItem[] | undefined> {
        if (!ast.isLanguageType(node)) {
            return undefined;
        }
        const items = this.references
            .findReferences(node, { includeDeclaration: false })
            .flatMap(ref => {
                const document = this.documents.getDocument(ref.sourceUri);
                if (!document) {
                    return [];
                }

                const rootNode = document.parseResult.value;
                if (!rootNode.$cstNode) {
                    return [];
                }

                const refCstNode = CstUtils.findLeafNodeAtOffset(rootNode.$cstNode, ref.segment.offset);
                if (!refCstNode) {
                    return [];
                }

                const refNode = refCstNode.astNode;
                if (!ast.isLanguageType(refNode) || !this.getSupertypeNodes(refNode).includes(node)) {
                    return [];
                }

                return [refNode];
            })
            .distinct()
            .map(type => this.getXsmpTypeHierarchyItem(type))
            .toArray();
        return items.length === 0 ? undefined : items;
    }
}
