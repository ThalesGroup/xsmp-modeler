import type { AstNode, CstNode } from 'langium';
import { AstUtils, CstUtils, isJSDoc, isLeafCstNode, isRootCstNode } from 'langium';
import * as ast from '../generated/ast-partial.js';
import * as Solver from './solver.js';
import { PTK } from './primitive-type-kind.js';
import { VisibilityKind } from './visibility-kind.js';

/**
 * Get the full qualified name of an element
 * @param element the element
 * @param separator optional separator (default is '.')
 * @returns qualified name separated by the separator
 */
export function fqn(node: ast.NamedElement | ast.ReturnParameter | undefined, separator: string = '.'): string {
    if (!node) {
        return '<undefined>';
    }
    let name = node.name ?? 'return';
    let parent = node.$container;

    while (parent && (parent.$type === ast.Namespace || ast.reflection.isSubtype(parent.$type, ast.Type))) {
        name = `${(parent as ast.NamedElement).name}${separator}${name}`;
        parent = parent.$container;
    }
    return name;
}

export function escape(input: string | undefined): string {
    if (!input) {
        return '';
    }
    return input.replaceAll('\t', '\\t').replaceAll('\b', '\\b').replaceAll('\n', '\\n').replaceAll('\r', '\\r')
        .replaceAll('\f', '\\f').replaceAll("'", "\\'").replaceAll('"', '\\"');
}

export function isUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(str);
}

/**
 * @param element the element
 * @returns the visibility
 */
export function getVisibility(node: ast.VisibilityElement): VisibilityKind | undefined {
    if (node.modifiers.includes('private')) { return VisibilityKind.private; }
    if (node.modifiers.includes('protected')) { return VisibilityKind.protected; }
    if (node.modifiers.includes('public')) { return VisibilityKind.public; }
    return undefined;
}
export function getRealVisibility(node: ast.NamedElement): VisibilityKind {

    if (ast.reflection.isSubtype(node.$type, ast.VisibilityElement)) {
        if (node.$container?.$type === ast.Structure || node.$container?.$type === ast.Interface) {
            return VisibilityKind.public;
        }
        return getVisibility(node as ast.VisibilityElement) ?? VisibilityKind.private;
    }
    return VisibilityKind.public;
}

export function getAccessKind(node: ast.Property): ast.AccessKind | undefined {
    if (node.modifiers.includes('readOnly')) { return 'readOnly'; }
    if (node.modifiers.includes('readWrite')) { return 'readWrite'; }
    if (node.modifiers.includes('writeOnly')) { return 'writeOnly'; }
    return undefined;
}

export function isAbstractType(node: ast.Class | ast.Component): boolean {
    return node.modifiers.includes('abstract');
}
export function isInput(node: ast.VisibilityElement): boolean {
    return node.modifiers.includes('input');
}
export function isOutput(node: ast.VisibilityElement): boolean {
    return node.modifiers.includes('output');
}
export function isState(node: ast.VisibilityElement): boolean {
    return !node.modifiers.includes('transient');
}
export function isString8(type: ast.Type | undefined): boolean {
    return fqn(type) === 'Smp.String8';
}
export function getPTK(type: ast.Type | undefined, defaultKind: PTK = PTK.None): PTK {
    if (!type) { return defaultKind; }
    switch (type.$type) {
        case ast.PrimitiveType:
            switch (fqn(type)) {
                case 'Smp.Bool': return PTK.Bool;
                case 'Smp.Char8': return PTK.Char8;
                case 'Smp.DateTime': return PTK.DateTime;
                case 'Smp.Duration': return PTK.Duration;
                case 'Smp.Float32': return PTK.Float32;
                case 'Smp.Float64': return PTK.Float64;
                case 'Smp.Int8': return PTK.Int8;
                case 'Smp.Int16': return PTK.Int16;
                case 'Smp.Int32': return PTK.Int32;
                case 'Smp.Int64': return PTK.Int64;
                case 'Smp.UInt8': return PTK.UInt8;
                case 'Smp.UInt16': return PTK.UInt16;
                case 'Smp.UInt32': return PTK.UInt32;
                case 'Smp.UInt64': return PTK.UInt64;
                case 'Smp.String8': return PTK.String8;
                default: return PTK.None;
            }
        case ast.Float: return getPTK((type as ast.Float).primitiveType?.ref, PTK.Float64);
        case ast.Integer: return getPTK((type as ast.Integer).primitiveType?.ref, PTK.Int32);
        case ast.StringType: return PTK.String8;
        case ast.Enumeration: return PTK.Enum;
        default: return PTK.None;
    }
}

export function findDocumentationNode(cstNode: CstNode | undefined): CstNode | undefined {
    if (cstNode) {
        let previous = CstUtils.getPreviousNode(cstNode, true);
        while (previous) {
            if (isDocumentationNode(previous)) {
                return previous;
            }
            if (!previous.hidden) {
                break;
            }
            previous = CstUtils.getPreviousNode(previous, true);
        }
        if (isRootCstNode(cstNode)) {
            // Go from the first non-hidden node through all nodes in reverse order
            // We do this to find the comment node which directly precedes the root node
            const endIndex = cstNode.content.findIndex(e => !e.hidden);
            for (let i = endIndex - 1; i >= 0; i--) {
                const child = cstNode.content[i];
                if (isDocumentationNode(child)) {
                    return child;
                }
            }
        }
    }
    return undefined;
}

function isDocumentationNode(cstNode: CstNode): boolean {
    return isLeafCstNode(cstNode) && 'ML_COMMENT' === cstNode.tokenType.name && isJSDoc(cstNode);
}

export function isAncestor(ancestor: AstNode | undefined, element: AstNode | undefined): boolean {
    return AstUtils.hasContainerOfType(element, c => c === ancestor);
}

export function getLower(element: ast.NamedElementWithMultiplicity): bigint | undefined {
    if (element.optional) {
        return BigInt(0);
    }
    if (element.multiplicity === undefined) {
        return BigInt(1);
    }
    if (element.multiplicity.lower === undefined && element.multiplicity.upper === undefined) {
        return BigInt(element.multiplicity.aux ? 1 : 0);
    }
    return Solver.getValue(element.multiplicity.lower)?.integralValue(PTK.Int64)?.getValue();
}

export function getUpper(element: ast.NamedElementWithMultiplicity): bigint | undefined {
    if (element.optional || element.multiplicity === undefined) {
        return BigInt(1);
    }
    if (element.multiplicity.lower === undefined && element.multiplicity.upper === undefined) {
        return BigInt(-1);
    }
    if (element.multiplicity.upper === undefined) {
        return element.multiplicity.aux ? BigInt(-1) : Solver.getValue(element.multiplicity.lower)?.integralValue(PTK.Int64)?.getValue() ?? BigInt(0);
    }
    return Solver.getValue(element.multiplicity.upper)?.integralValue(PTK.Int64)?.getValue();
}

function checkIsBaseOfInterface(parent: ast.Interface, base: ast.Type | undefined, visited: Set<ast.Type>): boolean {
    if (!base || visited.has(base)) {
        return false;
    }
    visited.add(base);
    return base === parent || ast.isInterface(base) && base.base.some(b => checkIsBaseOfInterface(parent, b.ref, visited));
}

export function isBaseOfInterface(parent: ast.Interface, base: ast.Type | undefined): boolean {
    return checkIsBaseOfInterface(parent, base, new Set<ast.Type>());
}

function checkIsBaseOfComponent(parent: ast.Component, base: ast.Type | undefined, visited: Set<ast.Type>): boolean {
    if (!base || visited.has(base)) {
        return false;
    }
    visited.add(base);
    return base === parent || ast.isComponent(base) && checkIsBaseOfComponent(parent, base.base?.ref, visited);
}
export function isBaseOfComponent(parent: ast.Component, base: ast.Type | undefined): boolean {
    return checkIsBaseOfComponent(parent, base, new Set<ast.Type>());
}

function checkIsBaseOfClass(parent: ast.Class, base: ast.Type | undefined, visited: Set<ast.Type>): boolean {
    if (!base || visited.has(base)) {
        return false;
    }
    visited.add(base);
    return base === parent || ast.isClass(base) && checkIsBaseOfClass(parent, base.base?.ref, visited);
}
export function isBaseOfClass(parent: ast.Class, base: ast.Type | undefined): boolean {
    return checkIsBaseOfClass(parent, base, new Set<ast.Type>());
}

function checkIsBaseOfReferenceType(parent: ast.ReferenceType, base: ast.Type | undefined, visited: Set<ast.Type>): boolean {
    if (!base || visited.has(base)) {
        return false;
    }
    if (base === parent) {
        return true;
    }
    visited.add(base);
    if (ast.isInterface(base)) {
        return base.base.some(i => checkIsBaseOfReferenceType(parent, i.ref, visited));
    }

    if (ast.isComponent(base)) {
        const parentFqn = fqn(parent);
        if (parentFqn === 'Smp.IObject' ||
            parentFqn === 'Smp.IComponent' ||
            (parentFqn === 'Smp.IModel' && base.$type === ast.Model) ||
            (parentFqn === 'Smp.IService' && base.$type === ast.Service) ||
            (parentFqn === 'Smp.IEntryPointPublisher' && base.elements.some(ast.isEntryPoint)) ||
            (parentFqn === 'Smp.IComposite' && base.elements.some(ast.isContainer)) ||
            (parentFqn === 'Smp.IAggregate' && base.elements.some(ast.isReference)) ||
            (parentFqn === 'Smp.IEventConsumer' && base.elements.some(ast.isEventSink)) ||
            (parentFqn === 'Smp.IEventProvider' && base.elements.some(ast.isEventSource)) ||
            (parentFqn === 'Smp.IDynamicInvocation' && base.elements.some(ast.isInvokable))) {
            return true;
        }
        return (checkIsBaseOfReferenceType(parent, base.base?.ref, visited)) ||
            base.interface.some(i => checkIsBaseOfReferenceType(parent, i.ref, visited));
    }

    return false;
}
export function isBaseOfReferenceType(parent: ast.ReferenceType, base: ast.Type | undefined): boolean {
    return checkIsBaseOfReferenceType(parent, base, new Set<ast.Type>());
}

function checkIsRecursiveType(parent: ast.Type, other: ast.Type | undefined, visited: Set<ast.Type>): boolean {

    if (!other || visited.has(other)) {
        return false;
    }
    visited.add(other);
    if (parent === other) {
        return true;
    }
    if (ast.isArrayType(other)) {
        return checkIsRecursiveType(parent, other.itemType?.ref, visited);
    }
    if (ast.isStructure(other)) {
        return other.elements.filter(ast.isField).some(f => checkIsRecursiveType(parent, f.type?.ref, visited));
    }
    return false;
}

export function isRecursiveType(parent: ast.Type, other: ast.Type | undefined): boolean {
    return checkIsRecursiveType(parent, other, new Set<ast.Type>());
}

export function isConstantVisibleFrom(from: ast.Expression, element: ast.Constant): boolean {
    return element.$container === AstUtils.getContainerOfType(from, ast.isType) || getRealVisibility(element) !== VisibilityKind.private;
}
export function isTypeVisibleFrom(from: AstNode, element: ast.Type): boolean {
    const visibility = getRealVisibility(element);
    return !((visibility === VisibilityKind.protected && AstUtils.getDocument(element) !== AstUtils.getDocument(from)) ||
        (visibility === VisibilityKind.private && !isAncestor(AstUtils.getContainerOfType(element, ast.isNamespace), from)));

}

export function getNodeType(node: AstNode): string {
    switch (node.$type) {
        case ast.ArrayType:
            return 'Array';
        case ast.ReturnParameter:
            return ast.Parameter;
        case ast.StringType:
            return 'String';
        default:
            return node.$type;
    }
}

export function getKeywordForType(type: ast.Type): string | undefined {
    switch (type.$type) {
        case ast.ArrayType: return 'array';
        case ast.AttributeType: return 'attribute';
        case ast.Class: return 'class';
        case ast.Enumeration: return 'enum';
        case ast.EventType: return 'event';
        case ast.Exception: return 'exception';
        case ast.Float: return 'float';
        case ast.Integer: return 'integer';
        case ast.Interface: return 'interface';
        case ast.Model: return 'model';
        case ast.NativeType: return 'native';
        case ast.PrimitiveType: return 'primitive';
        case ast.Service: return 'service';
        case ast.StringType: return 'string';
        case ast.Structure: return 'struct';
        case ast.ValueReference: return 'using';
    }
    return undefined;
}

export function capitalizeFirstLetter(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}