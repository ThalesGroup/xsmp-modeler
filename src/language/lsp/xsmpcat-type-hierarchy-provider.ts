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
    protected override getSupertypes(node: AstNode): MaybePromise<TypeHierarchyItem[] | undefined> {
        switch (node.$type) {
            case ast.Interface.$type: {
                const items = (node as ast.Interface).base.filter(i => i.ref !== undefined).map(i => this.getXsmpTypeHierarchyItem(i.ref!), this);
                return items.length === 0 ? undefined : items;
            }
            case ast.Model.$type:
            case ast.Service.$type: {
                const items: TypeHierarchyItem[] = [];
                if ((node as ast.Component).base?.ref) {
                    items.push(this.getXsmpTypeHierarchyItem((node as ast.Component).base!.ref!));
                }
                items.push(...(node as ast.Component).interface.filter(i => i.ref !== undefined).map(i => this.getXsmpTypeHierarchyItem(i.ref!), this));
                return items.length === 0 ? undefined : items;
            }
            case ast.Class.$type:
            case ast.Exception.$type:
                return (node as ast.Class).base?.ref ? [this.getXsmpTypeHierarchyItem((node as ast.Class).base!.ref!)] : undefined;
            case ast.Integer.$type:
                return (node as ast.Integer).primitiveType?.ref ? [this.getXsmpTypeHierarchyItem((node as ast.Integer).primitiveType!.ref!)] : undefined;
            case ast.Float.$type:
                return (node as ast.Float).primitiveType?.ref ? [this.getXsmpTypeHierarchyItem((node as ast.Float).primitiveType!.ref!)] : undefined;
        }
        return undefined;
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
                if (!ast.isLanguageType(refNode)) {
                    return [];
                }

                return [this.getXsmpTypeHierarchyItem(refNode)];
            })
            .toArray();
        return items.length === 0 ? undefined : items;
    }
}
