import * as ast from '@xsmp/core/ast-partial';
import { type AttributeHelper, isOutput } from '@xsmp/core/utils';

export function isCdkField(field: ast.Field, attributes: AttributeHelper): boolean {
    return ast.isComponent(field.$container) && !attributes.isStatic(field) && !ast.isClass(field.type?.ref)
        && (isOutput(field) || attributes.isFailure(field) || attributes.isForcible(field)
            || isCdkFieldType(field.type?.ref, attributes));
}

function isCdkFieldType(type: ast.Type | undefined, attributes: AttributeHelper, visited?: Set<ast.Type>): boolean {
    if (ast.isClass(type)) return false;
    if (ast.isStructure(type)) return type.elements.some(element => ast.isField(element) && isCdkField(element, attributes));
    if (!ast.isArrayType(type) || visited?.has(type)) return false;
    visited ??= new Set<ast.Type>();
    visited.add(type);
    return isCdkFieldType(type.itemType?.ref, attributes, visited);
}
