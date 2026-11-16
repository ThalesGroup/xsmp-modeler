import type { ValidationChecks } from 'langium';
import type { XsmpcatServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getAccessKind, isOutput } from '@xsmp/core/utils';
import { isCdkField } from './fields.js';

export function registerXsmpSdkValidationChecks(services: XsmpcatServices, category: string): void {
    const attributes = services.shared.AttributeHelper;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Property(property: ast.Property, accept) {
            const field = property.attachedField?.ref;
            const type = field?.type?.ref;
            if (!field || !type || !attributes.isByReference(property) || getAccessKind(property) === 'writeOnly'
                || !isCdkField(field, attributes)) return;

            const simpleArray = ast.isArrayType(type) && attributes.isSimpleArray(type);
            if (!ast.isSimpleType(type) && !simpleArray) {
                accept('error', 'The XSMP SDK field wrapper converts to a value; an attached Property getter cannot return a reference to it.', {
                    node: property, property: ast.Property.attachedField
                });
            } else if (!attributes.isConst(property) && (isOutput(field) || (!simpleArray && attributes.isForcible(field)))) {
                accept('error', 'The XSMP SDK field wrapper provides only a const reference; the attached Property getter cannot return a non-const reference.', {
                    node: property, property: ast.Property.attachedField
                });
            }
        }
    };
    services.validation.ValidationRegistry.register(checks, undefined, category);
}
