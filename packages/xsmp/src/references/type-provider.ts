import type { AstNode } from 'langium';
import { WorkspaceCache } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import { type AttributeHelper } from '../utils/attribute-helper.js';

/**
 * Provide the the type of any Expression in the AST.
 * Types are cached to improve performances.
 */
export class XsmpTypeProvider {

    protected readonly typeCache: WorkspaceCache<AstNode, ast.Type | undefined>;
    protected readonly attrHelper: AttributeHelper;
    constructor(services: XsmpSharedServices) {
        this.typeCache = new WorkspaceCache<AstNode, ast.Type | undefined>(services);
        this.attrHelper = services.AttributeHelper;
    }

    /** Get the type of the expression or undefined if no type can be found */
    public getType(node: AstNode): ast.Type | undefined {
        return this.typeCache.get(node, () => this.doGetType(node));
    }

    private doGetType(node: AstNode): ast.Type | undefined {
        if (ast.isField(node.$container) || ast.isConstant(node.$container) || ast.isParameter(node.$container) || ast.isReturnParameter(node.$container)) {
            return node.$container.type?.ref;
        }
        else if (ast.isCollectionLiteral(node.$container)) {
            const type = this.getType(node.$container);
            if (ast.isStructure(type)) {
                const field = this.attrHelper.getAllFields(type).toArray().at(node.$containerIndex!);
                if (field) { return (field as ast.Field).type?.ref; }
            }
            else if (ast.isArrayType(type)) {
                return type.itemType?.ref;
            }
        }
        else if (ast.isExpression(node.$container)) {
            return this.getType(node.$container);
        }
        else if (ast.isAttribute(node.$container)) {
            const attributeType = node.$container.type?.ref;
            if (ast.isAttributeType(attributeType)) {
                return attributeType.type?.ref;
            }
        }
        else if (ast.isAttributeType(node.$container)) {
            return node.$container.type?.ref;
        }
        return undefined;
    }
}