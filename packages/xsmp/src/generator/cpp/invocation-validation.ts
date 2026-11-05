import { type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../../generated/ast.js';
import type { XsmpcatServices } from '../../xsmpcat-module.js';
import type { AttributeHelper } from '../../utils/attribute-helper.js';

/** SMP identifies dynamically invoked operations by name, not by C++ signature. */
export function getCppOperationInvocationIssue(operation: ast.Operation, attributes: AttributeHelper): string | undefined {
    if (attributes.isConstructor(operation)) {
        return 'constructors cannot be dynamically invoked';
    }
    if (operation.returnParameter && attributes.isByPointer(operation.returnParameter)) {
        return 'pointer return values cannot be represented by Smp::AnySimple';
    }
    const signatures = new Set<string | undefined>();
    const visited = new Set<ast.WithBody>();
    const visit = (type: ast.Type | undefined): void => {
        if (!ast.isWithBody(type) || visited.has(type) || signatures.size > 1) return;
        visited.add(type);
        for (const member of type.elements) {
            if (ast.isOperation(member) && member.name === operation.name && !attributes.isConstructor(member)) {
                signatures.add(attributes.getSignature(member));
                if (signatures.size > 1) return;
            }
        }
        if (ast.isComponent(type)) {
            visit(type.base?.ref);
            type.interface.forEach(base => visit(base.ref));
        } else if (ast.isInterface(type)) {
            type.base.forEach(base => visit(base.ref));
        } else if (ast.isClass(type)) {
            visit(type.base?.ref);
        }
    };
    visit(operation.$container);
    return signatures.size > 1 ? 'overloaded operation names cannot be distinguished by Smp::IRequest' : undefined;
}

export function registerCppInvocationValidationChecks(services: XsmpcatServices, category: string): void {
    const attributes = services.shared.AttributeHelper;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Operation: (operation: ast.Operation, accept: ValidationAcceptor) => {
            if (!ast.isComponent(operation.$container) || attributes.isConstructor(operation)) return;
            const issue = getCppOperationInvocationIssue(operation, attributes);
            if (issue) accept('warning', `The C++ operation remains available, but is not published for dynamic invocation: ${issue}.`, { node: operation, property: 'name' });
        },
    };
    services.validation.ValidationRegistry.register(checks, undefined, category);
}
