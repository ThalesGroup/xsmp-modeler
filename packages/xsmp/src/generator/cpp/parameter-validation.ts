import { type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../../generated/ast.js';
import type { XsmpcatServices } from '../../xsmpcat-module.js';
import type { AttributeHelper } from '../../utils/attribute-helper.js';
import { getValue } from '../../utils/solver.js';
import { isIntegralType, PTK } from '../../utils/primitive-type-kind.js';

export function isCppNullPointerDefault(expression: ast.Expression): boolean {
    let valueExpression: ast.Expression | undefined = expression;
    while (ast.isParenthesizedExpression(valueExpression)) valueExpression = valueExpression.expr;
    if (ast.isKeywordExpression(valueExpression)) return valueExpression.name === 'nullptr';
    const value = getValue(valueExpression);
    return value !== undefined && isIntegralType(value.primitiveTypeKind())
        && value.integralValue(PTK.Int64)?.getValue() === 0n;
}

export function getCppParameterDefaultIssue(parameter: ast.Parameter, attributes: AttributeHelper): string | undefined {
    if (!parameter.default) return undefined;
    if (attributes.isByPointer(parameter) && !isCppNullPointerDefault(parameter.default)) {
        return 'A C++ pointer parameter default shall be nullptr or an integer zero.';
    }
    if (attributes.isByReference(parameter) && !attributes.isConst(parameter)) {
        return 'A non-const C++ reference parameter cannot bind to a default value expression.';
    }
    return undefined;
}

export function registerCppParameterValidationChecks(services: XsmpcatServices, category: string): void {
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Parameter: (parameter: ast.Parameter, accept: ValidationAcceptor) => {
            const issue = getCppParameterDefaultIssue(parameter, services.shared.AttributeHelper);
            if (issue) accept('error', issue, { node: parameter, property: 'default' });
        },
    };
    services.validation.ValidationRegistry.register(checks, undefined, category);
}
