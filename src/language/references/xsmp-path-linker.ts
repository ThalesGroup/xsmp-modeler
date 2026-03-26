import type { AstNode, AstNodeDescription, CstNode, LangiumDocument, Reference, ReferenceInfo } from 'langium';
import {
    AstUtils,
    DefaultLinker,
    DocumentState,
    isAstNode,
    isAstNodeDescription
} from 'langium';
import * as ast from '../generated/ast-partial.js';

const path_ref_resolving = Symbol('path_ref_resolving');

interface OptionalReference extends Reference {
    _ref?: AstNode | typeof path_ref_resolving;
    _nodeDescription?: AstNodeDescription;
}

export class XsmpPathLinker extends DefaultLinker {
    protected override doLink(refInfo: ReferenceInfo, document: LangiumDocument): void {
        if (!this.isPathReference(refInfo)) {
            super.doLink(refInfo, document);
            return;
        }

        const ref = refInfo.reference as OptionalReference;
        if (ref._ref !== undefined) {
            return;
        }

        ref._ref = path_ref_resolving;
        try {
            const description = this.scopeProvider.getScope(refInfo).getElement(ref.$refText);
            if (description) {
                ref._nodeDescription = description;
                ref._ref = this.langiumDocuments().hasDocument(description.documentUri)
                    ? this.loadAstNode(description)
                    : undefined;
            } else {
                ref._ref = undefined;
            }
        } catch (err) {
            console.error(`An error occurred while resolving optional reference to '${ref.$refText}':`, err);
            ref._ref = undefined;
        }

        if (!document.references.includes(ref)) {
            document.references.push(ref);
        }
    }

    override buildReference(node: AstNode, property: string, refNode: CstNode | undefined, refText: string): Reference {
        if (!(ast.isLocalNamedReference(node) && property === 'reference')) {
            return super.buildReference(node, property, refNode, refText);
        }

        const loadAstNode = this.loadAstNode.bind(this);
        const getScope = this.scopeProvider.getScope.bind(this.scopeProvider);
        const reference: OptionalReference = {
            $refNode: refNode,
            $refText: refText,

            get ref() {
                if (isAstNode(this._ref)) {
                    return this._ref;
                }
                if (isAstNodeDescription(this._nodeDescription)) {
                    const linkedNode = loadAstNode(this._nodeDescription);
                    this._ref = linkedNode;
                    return linkedNode;
                }
                if (this._ref === undefined) {
                    this._ref = path_ref_resolving;
                    const document = AstUtils.findRootNode(node).$document;
                    const description = getScope({ reference, container: node, property }).getElement(reference.$refText);
                    if (!description && document && document.state < DocumentState.ComputedScopes) {
                        this._ref = undefined;
                        return undefined;
                    }
                    if (description) {
                        this._nodeDescription = description;
                        const linkedNode = loadAstNode(description);
                        if (!linkedNode && document && document.state < DocumentState.ComputedScopes) {
                            this._ref = undefined;
                            return undefined;
                        }
                        this._ref = linkedNode;
                    } else {
                        this._ref = undefined;
                    }
                    if (document && !document.references.includes(this)) {
                        document.references.push(this);
                    }
                    return isAstNode(this._ref) ? this._ref : undefined;
                }
                if (this._ref === path_ref_resolving) {
                    return undefined;
                }
                return undefined;
            },
            get $nodeDescription() {
                return this._nodeDescription;
            },
            get error() {
                return undefined;
            }
        };
        return reference;
    }

    protected isPathReference(refInfo: ReferenceInfo): boolean {
        return ast.isLocalNamedReference(refInfo.container) && refInfo.property === 'reference';
    }
}
