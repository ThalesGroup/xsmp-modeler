import * as ast from '../generated/ast-partial.js';
import type { AttributeHelper } from './attribute-helper.js';

/** SMP identifies dynamically invoked operations by name, not by C++ signature. */
export function getOperationInvocationIssue(operation: ast.Operation, attributes: AttributeHelper): string | undefined {
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
