import * as ast from '../generated/ast-partial.js';
import type { AttributeHelper } from '../utils/attribute-helper.js';

export function isNullPointerDefault(expression: ast.Expression): boolean {
    let valueExpression: ast.Expression | undefined = expression;
    while (ast.isParenthesizedExpression(valueExpression)) valueExpression = valueExpression.expr;
    return ast.isKeywordExpression(valueExpression) && valueExpression.name === 'nullptr';
}

export function getParameterDefaultIssue(parameter: ast.Parameter, attributes: AttributeHelper): string | undefined {
    if (!parameter.default) return undefined;
    if ((attributes.isByPointer(parameter) || ast.isValueReference(parameter.type?.ref)) && !isNullPointerDefault(parameter.default)) {
        return 'A pointer parameter default shall be nullptr.';
    }
    if (attributes.isByReference(parameter) && !attributes.isConst(parameter)) {
        return 'A non-const reference parameter cannot bind to a default value expression.';
    }
    return undefined;
}
