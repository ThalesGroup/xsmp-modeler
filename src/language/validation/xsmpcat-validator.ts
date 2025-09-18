import {
    AstUtils, MultiMap, type ValidationAcceptor, type ValidationChecks, WorkspaceCache, diagnosticData,
    type AstNode, type IndexManager, type Properties, type URI,
    type AstNodeDescription, type LangiumDocument
} from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpcatServices } from '../xsmpcat-module.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import * as Solver from '../utils/solver.js';
import * as IssueCodes from './xsmpcat-issue-codes.js';
import { isBuiltinLibrary } from '../builtins.js';
import { isFloatingType, PTK } from '../utils/primitive-type-kind.js';
import { DiagnosticTag, Location } from 'vscode-languageserver';
import { VisibilityKind } from '../utils/visibility-kind.js';
import { type DocumentationHelper } from '../utils/documentation-helper.js';
import { type AttributeHelper } from '../utils/attribute-helper.js';
import type { ProjectManager } from '../workspace/project-manager.js';

/**
 * Register custom validation checks.
 */
export function registerXsmpcatValidationChecks(services: XsmpcatServices) {
    const registry = services.validation.ValidationRegistry,
        validator = services.validation.XsmpcatValidator,
        checks: ValidationChecks<ast.XsmpAstType> = {

            NamedElement: validator.checkNamedElement,
            Attribute: validator.checkAttribute,
            Constant: validator.checkConstant,
            Field: validator.checkField,
            Enumeration: validator.checkEnumeration,
            Float: validator.checkFloat,
            Integer: validator.checkInteger,
            Type: validator.checkType,
            Association: validator.checkAssociation,
            Container: validator.checkContainer,
            NamedElementWithMultiplicity: validator.checkNamedElementWithMultiplicity,
            Interface: validator.checkInterface,
            Component: validator.checkComponent,
            Structure: validator.checkStructure,
            Class: validator.checkClass,
            EventType: validator.checkEventType,
            NativeType: validator.checkNativeType,
            EventSink: validator.checkEventSink,
            EventSource: validator.checkEventSource,
            StringType: validator.checkString,
            ArrayType: validator.checkArrayType,
            AttributeType: validator.checkAttributeType,
            EntryPoint: validator.checkEntryPoint,
            Service: validator.checkService,
            Catalogue: validator.checkCatalogue,
            Property: validator.checkProperty,
            Reference: validator.checkReference,
            ValueReference: validator.checkValueReference,
            Operation: validator.checkOperation,
            Parameter: validator.checkParameter,
            ReturnParameter: validator.checkReturnParameter,
            PrimitiveType: validator.checkPrimitiveType,
            Namespace: validator.checkNamespace,
        };
    registry.register(checks, validator, 'fast');
}

const reservedNames = new Set([
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
    'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
    'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await',
    'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
    'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
    'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
    'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
    'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert',
    'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local', 'throw', 'true', 'try',
    'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile',
    'wchar_t', 'while', 'xor', 'xor_eq'
]),

    validUsages = new Set(['NamedElement', 'Array', 'Association', 'AttributeType', 'Catalogue',
        'Class', 'Component', 'Constant', 'Container', 'Document', 'EntryPoint', 'Enumeration',
        'EnumerationLiteral', 'EventSink', 'EventSource', 'EventType', 'Exception', 'Field', 'Float',
        'Integer', 'Interface', 'LanguageType', 'Model', 'Namespace', 'NativeType', 'Operation', 'Parameter',
        'PrimitiveType', 'Property', 'ReferenceType', 'Reference', 'Service', 'SimpleType', 'String',
        'Structure', 'Type', 'ValueReference', 'ValueType', 'VisibilityElement']),

    namedElementRegex = /^[a-zA-Z]\w*$/,
    uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Implementation of custom validations.
 */
export class XsmpcatValidator {
    protected readonly indexManager: IndexManager;
    protected readonly globalCache: WorkspaceCache<string, MultiMap<string, AstNodeDescription>>;
    protected readonly visibleCache: WorkspaceCache<URI, MultiMap<string, AstNodeDescription>>;
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpcatServices) {
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalCache = new WorkspaceCache<string, MultiMap<string, AstNodeDescription>>(services.shared);
        this.visibleCache = new WorkspaceCache<URI, MultiMap<string, AstNodeDescription>>(services.shared);
        this.docHelper = services.shared.DocumentationHelper;
        this.attrHelper = services.shared.AttributeHelper;
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    private computeUuidsForTypes(): MultiMap<string, AstNodeDescription> {
        const map = new MultiMap<string, AstNodeDescription>();
        for (const type of this.indexManager.allElements(ast.Type)) {
            if (type.node) {
                const uuid = this.docHelper.getUuid(type.node as ast.Type)?.toString().trim();
                if (uuid) {
                    map.add(uuid, type);
                }
            }
        }
        return map;
    }

    private computeServiceNames(): MultiMap<string, AstNodeDescription> {
        const map = new MultiMap<string, AstNodeDescription>();
        for (const type of this.indexManager.allElements(ast.Service)) {
            const service = type.node as ast.Service;
            if (service.name) {
                map.add(service.name, type);
            }
        }
        return map;
    }

    private computeVisibleNames(document: LangiumDocument): MultiMap<string, AstNodeDescription> {
        const map = new MultiMap<string, AstNodeDescription>();
        for (const element of this.indexManager.allElements(ast.NamedElement, this.projectManager.getVisibleUris(document))) {
            map.add(element.name, element);
        }
        return map;
    }
    private getDuplicatedName(element: ast.Type | ast.Namespace): readonly AstNodeDescription[] {
        const document = AstUtils.getDocument(element);
        return this.visibleCache.get(document.uri, () => this.computeVisibleNames(document)).get(XsmpUtils.fqn(element));
    }

    checkNamedElement(element: ast.NamedElement, accept: ValidationAcceptor): void {

        if (element.name && !namedElementRegex.test(element.name)) {
            accept('error', 'An Element Name shall start with a letter.',
                { node: element, property: 'name' });
        }
        if (element.name && reservedNames.has(element.name)) {
            accept('error', 'An Element Name shall not be an ISO/ANSI C++ keyword.',
                { node: element, property: 'name' });
        }
        this.checkAttributes(element, accept);
    }

    private checkAttributes(element: ast.NamedElement | ast.ReturnParameter, accept: ValidationAcceptor) {
        const visited = new Set<ast.AttributeType>();
        for (const attribute of element.attributes) {
            if (!attribute.type) {
                accept('error', 'Missing type.', { node: attribute, keyword: '@' });
            }
            else if (this.checkTypeReference(accept, attribute, attribute.type.ref, 'type')) {
                const type = attribute.type.ref as ast.AttributeType,
                    usages = this.docHelper.getUsages(type);

                if (usages?.every(t => !ast.reflection.isSubtype(XsmpUtils.getNodeType(element), t.toString().trim()))) {
                    accept('warning', `This annotation is disallowed for element of type ${XsmpUtils.getNodeType(element)}.`,
                        { node: attribute, data: diagnosticData(IssueCodes.InvalidAttribute) });
                }

                if (!this.docHelper.allowMultiple(type) && visited.has(type)) {
                    accept('warning', 'Duplicated annotation of a non-repeatable type. Only annotation types marked with \'@allowMultiple\' can be used multiple times on a single target.',
                        { node: attribute, data: diagnosticData(IssueCodes.InvalidAttribute) });
                }
                visited.add(type);
            }
        }
    }
    public static getReferenceType(type: string, property: string): string {

        const referenceId = `${type}:${property}`;
        switch (referenceId) {
            case 'Attribute:type':
                return ast.AttributeType;
            case 'Class:base':
                return ast.Class;
            case 'Interface:base':
            case 'Model:interface':
            case 'Service:interface':
            case 'Reference:interface':
                return ast.Interface;
            case 'Model:base':
                return ast.Model;
            case 'Service:base':
                return ast.Service;
            case 'ArrayType:itemType':
            case 'ValueReference:type':
            case 'AttributeType:type':
            case 'Field:type':
                return ast.ValueType;
            case 'Integer:primitiveType':
            case 'Float:primitiveType':
                return ast.PrimitiveType;
            case 'EventType:eventArgs':
            case 'Constant:type':
                return ast.SimpleType;
            case 'Parameter:type':
            case 'ReturnParameter:type':
            case 'Association:type':
            case 'Property:type':
                return ast.LanguageType;
            case 'Container:type':
                return ast.ReferenceType;
            case 'Container:defaultComponent':
                return ast.Component;
            case 'EventSink:type':
            case 'EventSource:type':
                return ast.EventType;
            case 'Operation:raisedException':
            case 'Property:getRaises':
            case 'Property:setRaises':
            case 'Exception:base':
                return ast.Exception;
            default: {
                throw new Error(`${referenceId} is not a valid reference id.`);
            }
        }
    }

    checkTypeReference<T extends AstNode, U extends ast.Type>(accept: ValidationAcceptor, node: T, reference: U | undefined, property: Properties<T>, index?: number): reference is U {

        if (!reference) {
            return false;
        }

        const expectedType = XsmpcatValidator.getReferenceType(node.$type, property);

        if (!ast.reflection.isSubtype(reference.$type, expectedType)) {
            accept('error', `The type ${reference.$type} is not a sub type of ${expectedType}.`, { node, property, index });
            return false;
        }
        if (!XsmpUtils.isTypeVisibleFrom(node, reference)) {
            accept('error', `The ${reference.$type} ${XsmpUtils.fqn(reference)} is not visible.`,
                { node, property, index, data: diagnosticData(IssueCodes.TypeNotVisible) });
        }
        const deprecated = this.docHelper.getDeprecated(reference);
        if (deprecated) {
            accept('warning', deprecated.toString().length > 0 ? `Deprecated: ${deprecated.toString()}` : 'Deprecated.', { node, property, index, tags: [DiagnosticTag.Deprecated] });
        }
        return true;
    }

    checkFieldReference<N extends AstNode>(accept: ValidationAcceptor, node: N, field: ast.NamedElement | undefined, property: Properties<N>, index?: number): field is ast.Field {

        if (!field) { return false; }

        if (field.$type !== ast.Field) {
            accept('error', 'Expecting a Field.', { node, property, index });
            return false;
        }

        if (node.$container !== field.$container && XsmpUtils.getRealVisibility(field) === VisibilityKind.private) { accept('error', 'The Field is not visible.', { node, property, index, data: diagnosticData(IssueCodes.FieldNotVisible) }); }

        const deprecated = this.docHelper.getDeprecated(field);
        if (deprecated) {
            accept('warning', deprecated.toString().length > 0 ? `Deprecated: ${deprecated.toString()}` : 'Deprecated.', { node, property, index, tags: [DiagnosticTag.Deprecated] });
        }
        return true;
    }

    checkExpression(type: ast.Type | PTK | undefined, expression: ast.Expression | undefined, accept: ValidationAcceptor) {

        if (!expression || !type) { return; }

        if (ast.isArrayType(type)) {
            if (ast.isCollectionLiteral(expression)) {
                const arraySize = Solver.getValue(type.size)?.integralValue(PTK.UInt64)?.getValue();
                if (arraySize) {
                    const collectionSize = expression.elements.length,
                        size = collectionSize < arraySize ? collectionSize : arraySize;
                    for (let i = 0; i < size; ++i) { this.checkExpression(type.itemType?.ref, expression.elements[i], accept); }
                    const more = expression.elements.at(Number(arraySize));
                    if (more) {
                        accept('error', `The array type expect ${arraySize} element(s), got ${collectionSize} element(s).`, { node: more });
                    }
                    else if (collectionSize < arraySize && collectionSize !== 0) {
                        accept('warning', `Partial initialization, the array type expect ${arraySize} element(s), got ${collectionSize} element(s).`, { node: expression });
                    }
                }
            }
            else {
                accept('error', 'An array shall be initialized with a collection.', { node: expression });
            }
        }

        else if (ast.isStructure(type)) {
            if (ast.isCollectionLiteral(expression)) {
                const fields = this.attrHelper.getAllFields(type).toArray(),
                    fieldCount = fields.length,
                    collectionSize = expression.elements.length,
                    size = collectionSize < fieldCount ? collectionSize : fieldCount;
                for (let i = 0; i < size; ++i) {
                    let exp: ast.Expression | undefined = expression.elements[i];
                    const field = fields[i] as ast.Field;
                    if (ast.isDesignatedInitializer(exp)) {
                        if (exp.field?.ref !== field) {
                            accept('error', `Invalid field name, expecting ${field.name}.`, { node: exp, property: 'field', data: diagnosticData(IssueCodes.InvalidFieldName) });
                        }
                        exp = exp.expr;
                    }
                    this.checkExpression(field.type?.ref, exp, accept);
                }
                const more = expression.elements.at(Number(fieldCount));
                if (more) {
                    accept('error', `The structure type expect ${fieldCount} element(s), got ${collectionSize} element(s).`, { node: more });
                }
                else if (collectionSize < fieldCount && collectionSize !== 0) {
                    accept('warning', `Partial initialization, the structure type expect ${fieldCount} element(s), got ${collectionSize} element(s).`, { node: expression });
                }
            }
            else {
                accept('error', `A ${type.$type} shall be initialized with a collection.`, { node: expression });
            }
        }
        else {
            return Solver.getValueAs(expression, type, accept)?.getValue();
        }
        return undefined;
    }

    checkAttribute(attribute: ast.Attribute, accept: ValidationAcceptor): void {
        if (this.checkTypeReference(accept, attribute, attribute.type?.ref, 'type')) {
            const attributeType = attribute.type.ref as ast.AttributeType;
            if (attribute.value) { this.checkExpression(attributeType.type?.ref, attribute.value, accept); }
            else if (!attributeType.default) { accept('error', 'A value is required.', { node: attribute, property: 'value', data: diagnosticData(IssueCodes.MissingValue) }); }
        }
    }

    checkConstant(constant: ast.Constant, accept: ValidationAcceptor): void {

        if (this.checkTypeReference(accept, constant, constant.type?.ref, 'type')) {
            const type = constant.type.ref as ast.PrimitiveType;
            if (!constant.value) { accept('error', 'A Constant must have an initialization value.', { node: constant, keyword: 'constant', data: diagnosticData(IssueCodes.MissingValue) }); }
            else { this.checkExpression(type, constant.value, accept); }
        }
    }

    checkField(field: ast.Field, accept: ValidationAcceptor): void {
        if (this.checkTypeReference(accept, field, field.type?.ref, 'type')) {
            this.checkExpression(field.type.ref, field.default, accept);
        }
    }

    checkEnumeration(enumeration: ast.Enumeration, accept: ValidationAcceptor): void {
        this.checkModifier(enumeration, [ast.isVisibilityModifiers], accept);
        if (enumeration.literal.length === 0) {
            accept('error', 'An Enumeration shall contains at least one literal.', { node: enumeration, property: 'literal' });
        }

        const values = new Set<string | number | bigint | boolean | ast.EnumerationLiteral>(),
            literals = new Set<string>();
        for (const literal of enumeration.literal) {
            if (literal.name && literals.has(literal.name)) { accept('error', 'Duplicated literal name.', { node: literal, property: 'name' }); }
            else { literals.add(literal.name ?? ''); }

            const value = this.checkExpression(PTK.Int32, literal.value, accept);
            if (value !== undefined) {
                if (values.has(value)) {
                    accept('error', 'Enumeration Literal Values shall be unique within an Enumeration.', { node: literal, property: 'value' });
                }
                else {
                    values.add(value);
                }
            }
        }
    }
    private readonly integerTypes = new Set<PTK>([
        PTK.Int8, PTK.Int16, PTK.UInt8, PTK.UInt16, PTK.Int32, PTK.Int64, PTK.UInt32, PTK.UInt64
    ]);
    checkInteger(integer: ast.Integer, accept: ValidationAcceptor): void {
        this.checkModifier(integer, [ast.isVisibilityModifiers], accept);

        this.checkTypeReference(accept, integer, integer.primitiveType?.ref, 'primitiveType');

        const kind = XsmpUtils.getPTK(integer);
        if (this.integerTypes.has(kind)) {
            const min = this.checkExpression(kind, integer.minimum, accept),
                max = this.checkExpression(kind, integer.maximum, accept);
            if (min !== undefined && max !== undefined && min > max) {
                accept('error', 'Minimum shall be less or equal than Maximum.', { node: integer, property: 'minimum' });
            }
        }
        else {
            accept('error', 'Expecting an Integral Type.', { node: integer, property: 'primitiveType' });
        }

    }
    checkFloat(float: ast.Float, accept: ValidationAcceptor): void {
        this.checkModifier(float, [ast.isVisibilityModifiers], accept);

        this.checkTypeReference(accept, float, float.primitiveType?.ref, 'primitiveType');

        const kind = XsmpUtils.getPTK(float);
        if (isFloatingType(kind)) {
            const min = this.checkExpression(kind, float.minimum, accept),
                max = this.checkExpression(kind, float.maximum, accept);

            if (min !== undefined && max !== undefined) {
                if (min > max || (min === max && float.range !== '...')) {
                    accept('error', float.range !== '...' ? 'Minimum shall be less than Maximum.' : 'Minimum shall be less or equal than Maximum.',
                        { node: float, property: 'minimum' });
                }
            }
        }
        else {
            accept('error', 'Expecting a Floating Point Type.', { node: float, property: 'primitiveType' });
        }
    }

    checkType(type: ast.Type, accept: ValidationAcceptor): void {

        const uuid = this.docHelper.getUuid(type);
        if (uuid === undefined) {
            accept('error', 'Missing Type UUID.', {
                node: type, keyword: XsmpUtils.getKeywordForType(type),
                data: { code: IssueCodes.MissingUuid, actionRange: this.docHelper.getJSDoc(type)?.range ?? { start: type.$cstNode?.range.start, end: type.$cstNode?.range.start } }
            });
        }
        else if (!uuidRegex.test(uuid.toString().trim())) {
            accept('error', 'The UUID is invalid.', { node: type, range: uuid.range, data: diagnosticData(IssueCodes.InvalidUuid) });
        }
        else {
            const duplicates = this.globalCache.get('uuids', () => this.computeUuidsForTypes()).get(uuid.toString().trim());
            if (duplicates.length > 1 && !isBuiltinLibrary(AstUtils.getDocument(type).uri)) {
                accept('error', 'Duplicated UUID.', {
                    node: type,
                    range: uuid.range,
                    data: diagnosticData(IssueCodes.DuplicatedUuid),
                    relatedInformation: duplicates.filter(d => d.node !== type).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
                });
            }
        }
        const duplicates = this.getDuplicatedName(type);
        if (duplicates.length > 1) {
            accept('error', 'Duplicated Type name.', {
                node: type,
                property: 'name',
                data: diagnosticData(IssueCodes.DuplicatedUuid),
                relatedInformation: duplicates.filter(d => d.node !== type).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
            });
        }
    }

    checkAssociation(association: ast.Association, accept: ValidationAcceptor): void {
        this.checkTypeReference(accept, association, association.type?.ref, 'type');
    }

    checkContainer(container: ast.Container, accept: ValidationAcceptor): void {
        if (this.checkTypeReference(accept, container, container.type?.ref, 'type') &&
            this.checkTypeReference(accept, container, container.defaultComponent?.ref, 'defaultComponent') &&
            !XsmpUtils.isBaseOfReferenceType(container.type.ref as ast.ReferenceType, container.defaultComponent.ref)) {
            accept('error', `The default Component shall be a sub type of ${XsmpUtils.fqn(container.type.ref)}`,
                { node: container, property: 'defaultComponent' });
        }
    }

    checkNamedElementWithMultiplicity(element: ast.NamedElementWithMultiplicity, accept: ValidationAcceptor): void {
        const lower = XsmpUtils.getLower(element);
        if (lower !== undefined && lower < 0) {
            accept('error', 'Lower bound shall be a positive number or 0.', { node: element.multiplicity!, property: 'lower' });
        }

        const upper = XsmpUtils.getUpper(element);
        if (upper !== undefined && upper !== BigInt(-1) && lower !== undefined && upper < lower) {
            accept('error', 'Lower bound shall be less or equal to the upper bound, if present.\nUpper bound shall be -1 or larger or equal to the lower bound.',
                { node: element.multiplicity!, property: 'lower' });
        }
    }

    checkModifier(element: ast.VisibilityElement, checks: Array<(item: unknown) => boolean>, accept: ValidationAcceptor) {
        for (const check of checks) {
            let visited = false;
            for (const [index, modifier] of element.modifiers.entries()) {
                if (check(modifier)) {
                    if (visited) { accept('error', 'Illegal modifier.', { node: element, property: 'modifiers', index, data: diagnosticData(IssueCodes.IllegalModifier) }); }
                    visited = true;
                }
            }
        }

        for (const [index, modifier] of element.modifiers.entries()) {
            if (!checks.some(check => check(modifier))) { accept('error', 'Invalid modifier.', { node: element, property: 'modifiers', index, data: diagnosticData(IssueCodes.InvalidModifier) }); }
        }
    }

    checkDuplicatedMember(members: MultiMap<string, ast.NamedElement>, member: ast.NamedElement, accept: ValidationAcceptor) {
        if (member.name) {
            const duplicates = members.get(member.name);
            if (duplicates.length > 0) {
                if (ast.isOperation(member)) {
                    const sig = this.attrHelper.getSignature(member);
                    const duplicatedOp = duplicates.filter(d => !ast.isOperation(d) || (sig === this.attrHelper.getSignature(d) && member.$container === d.$container));
                    if (duplicatedOp.length > 0) {
                        accept('error', 'Duplicated identifier.', {
                            node: member,
                            property: 'name',
                            relatedInformation: duplicatedOp.filter(d => d.$cstNode !== undefined).map(d => ({ location: Location.create(AstUtils.getDocument(d).uri.toString(), d.$cstNode!.range), message: XsmpUtils.fqn(d) }))
                        });
                    }
                }
                else if (!(ast.isConstant(member) || ast.isProperty(member)) || duplicates.find(d => d.$container === member.$container)) {
                    accept('error', 'Duplicated identifier.', {
                        node: member,
                        property: 'name',
                        relatedInformation: duplicates.filter(d => d.$cstNode !== undefined).map(d => ({ location: Location.create(AstUtils.getDocument(d).uri.toString(), d.$cstNode!.range), message: XsmpUtils.fqn(d) }))
                    });
                }

            }
            members.add(member.name, member);
        }
    }

    collectmembers(type: ast.Type | undefined, duplicates: MultiMap<string, ast.NamedElement>, visited: Set<ast.Type>) {
        if (!type || visited.has(type)) { return; }
        visited.add(type);

        if (ast.isInterface(type)) {
            type.elements.forEach(e => duplicates.add(e.name ?? '', e));
            type.base.forEach(b => { this.collectmembers(b.ref, duplicates, visited); }, this);
        }
        else if (ast.isComponent(type)) {
            type.elements.forEach(e => duplicates.add(e.name ?? '', e));
            this.collectmembers(type.base?.ref, duplicates, visited);
            type.interface.forEach(b => { this.collectmembers(b.ref, duplicates, visited); }, this);
        }
        else if (ast.isStructure(type)) {
            type.elements.forEach(e => duplicates.add(e.name ?? '', e));
            if (ast.isClass(type)) { this.collectmembers(type.base?.ref, duplicates, visited); }
        }
    }

    initDuplicatedMembers(type: ast.Type): MultiMap<string, ast.NamedElement> {
        const duplicates = new MultiMap<string, ast.NamedElement>(),
            visited = new Set<ast.Type>();
        visited.add(type);
        if (ast.isInterface(type)) { type.base.forEach(b => { this.collectmembers(b.ref, duplicates, visited); }, this); }
        else if (ast.isComponent(type)) {
            this.collectmembers(type.base?.ref, duplicates, visited);
            type.interface.forEach(b => { this.collectmembers(b.ref, duplicates, visited); }, this);
        }
        else if (ast.isClass(type)) { this.collectmembers(type.base?.ref, duplicates, visited); }

        return duplicates;
    }

    checkInterface(inter: ast.Interface, accept: ValidationAcceptor): void {
        this.checkModifier(inter, [ast.isVisibilityModifiers], accept);
        const visited = new Set<ast.Type>();
        for (const [index, base] of inter.base.entries()) {
            if (this.checkTypeReference(accept, inter, base.ref, 'base', index)) {
                if (visited.has(base.ref)) { accept('error', 'Duplicated interface.', { node: inter, property: 'base', index, data: diagnosticData(IssueCodes.DuplicatedInterfaceBase) }); }
                else {
                    visited.add(base.ref);
                    if (XsmpUtils.isBaseOfInterface(inter, base.ref)) { accept('error', 'Cyclic dependency detected.', { node: inter, property: 'base', index, data: diagnosticData(IssueCodes.CyclicInterfaceBase) }); }
                }
            }
        }

        const duplicates = this.initDuplicatedMembers(inter);
        for (const element of inter.elements) {
            this.checkDuplicatedMember(duplicates, element, accept);

            switch (element.$type) {
                case ast.Constant:
                case ast.Operation:
                    this.checkModifier(element, [], accept);
                    break;
                case ast.Property:
                    this.checkModifier(element, [ast.isAccessKind], accept);
                    break;
            }
        }
    }

    checkComponent(component: ast.Component, accept: ValidationAcceptor): void {

        this.checkModifier(component, [ast.isVisibilityModifiers, (elem) => elem === 'abstract'], accept);
        if (this.checkTypeReference(accept, component, component.base?.ref, 'base') && XsmpUtils.isBaseOfComponent(component, component.base.ref)) { accept('error', 'Cyclic dependency detected.', { node: component, property: 'base', data: diagnosticData(IssueCodes.CyclicComponentBase) }); }

        const visited = new Set<ast.Type | undefined>();
        for (const [index, inter] of component.interface.entries()) {
            if (this.checkTypeReference(accept, component, inter.ref, 'interface', index)) {
                if (visited.has(inter.ref)) { accept('error', 'Duplicated interface.', { node: component, property: 'interface', index, data: diagnosticData(IssueCodes.DuplicatedComponentInterface) }); }
                else { visited.add(inter.ref); }
            }
        }

        const duplicates = this.initDuplicatedMembers(component);
        for (const element of component.elements) {
            this.checkDuplicatedMember(duplicates, element, accept);

            switch (element.$type) {
                case ast.Constant:
                case ast.Operation:
                case ast.Association:
                    this.checkModifier(element, [ast.isVisibilityModifiers], accept);
                    break;
                case ast.Field:
                    this.checkModifier(element, [ast.isVisibilityModifiers, (elem) => elem === 'input', (elem) => elem === 'output', (elem) => elem === 'transient'], accept);
                    break;
                case ast.Property:
                    this.checkModifier(element, [ast.isVisibilityModifiers, ast.isAccessKind], accept);
                    break;
            }
        }

        if (!component.modifiers.includes('abstract') &&
            component.elements.some(e => (ast.isOperation(e) || ast.isProperty(e)) && this.attrHelper.isAbstract(e), this)) { accept('warning', `The ${component.$type} shall be abstract.`, { node: component, keyword: component.$type === ast.Model ? 'model' : 'service', data: diagnosticData(IssueCodes.MissingAbstract) }); }
    }

    checkStructure(structure: ast.Structure, accept: ValidationAcceptor): void {

        if (structure.$type !== ast.Structure) { return; }
        this.checkModifier(structure, [ast.isVisibilityModifiers], accept);

        const duplicates = this.initDuplicatedMembers(structure);
        for (const element of structure.elements) {
            this.checkDuplicatedMember(duplicates, element, accept);

            switch (element.$type) {
                case ast.Constant:
                    this.checkModifier(element, [], accept);
                    break;
                case ast.Field:
                    this.checkModifier(element, [(elem) => elem === 'input', (elem) => elem === 'output', (elem) => elem === 'transient'], accept);
                    if (XsmpUtils.isRecursiveType(structure, element.type?.ref)) { accept('error', 'Recursive Field Type.', { node: element, property: 'type' }); }
                    break;
            }
        }
    }

    checkClass(clazz: ast.Class, accept: ValidationAcceptor): void {
        this.checkModifier(clazz, [ast.isVisibilityModifiers, (elem) => elem === 'abstract'], accept);
        if (clazz.base && this.checkTypeReference(accept, clazz, clazz.base.ref, 'base') && XsmpUtils.isBaseOfClass(clazz, clazz.base.ref)) {
            accept('error', 'Cyclic dependency detected.', { node: clazz, property: 'base', data: diagnosticData(IssueCodes.CyclicClassBase) });
        }

        const duplicates = this.initDuplicatedMembers(clazz);
        for (const element of clazz.elements) {
            this.checkDuplicatedMember(duplicates, element, accept);

            switch (element.$type) {
                case ast.Constant:
                case ast.Operation:
                case ast.Association:
                    this.checkModifier(element, [ast.isVisibilityModifiers], accept);
                    break;
                case ast.Field:
                    this.checkModifier(element, [ast.isVisibilityModifiers, (elem) => elem === 'input', (elem) => elem === 'output', (elem) => elem === 'transient'], accept);
                    if (XsmpUtils.isRecursiveType(clazz, element.type?.ref)) {
                        accept('error', 'Recursive Field Type.', { node: element, property: 'type' });
                    }
                    break;
                case ast.Property:
                    this.checkModifier(element, [ast.isVisibilityModifiers, ast.isAccessKind], accept);
                    break;
            }
        }
        if (!clazz.modifiers.includes('abstract') &&
            clazz.elements.some(e => (ast.isOperation(e) || ast.isProperty(e)) && this.attrHelper.isAbstract(e), this)) {
            accept('warning', `The ${clazz.$type} shall be abstract.`, { node: clazz, keyword: clazz.$type === ast.Class ? 'class' : 'exception', data: diagnosticData(IssueCodes.MissingAbstract) });
        }
    }

    checkEventType(eventType: ast.EventType, accept: ValidationAcceptor): void {
        this.checkModifier(eventType, [ast.isVisibilityModifiers], accept);
        this.checkTypeReference(accept, eventType, eventType.eventArgs?.ref, 'eventArgs');
    }

    checkNativeType(nativeType: ast.NativeType, accept: ValidationAcceptor): void {
        this.checkModifier(nativeType, [ast.isVisibilityModifiers], accept);
        if (!this.docHelper.getNativeType(nativeType)) {
            accept('error', 'The javadoc \'@type\' tag shall be defined with the C++ type name.', { node: nativeType, property: 'name' });
        }
    }

    checkEventSink(eventSink: ast.EventSink, accept: ValidationAcceptor): void {
        this.checkTypeReference(accept, eventSink, eventSink.type?.ref, 'type');
    }

    checkEventSource(eventSource: ast.EventSource, accept: ValidationAcceptor): void {
        this.checkTypeReference(accept, eventSource, eventSource.type?.ref, 'type');
    }
    checkString(string: ast.StringType, accept: ValidationAcceptor): void {
        this.checkModifier(string, [ast.isVisibilityModifiers], accept);
        const length = this.checkExpression(PTK.Int64, string.length, accept);
        if (length === undefined) { accept('error', 'Missing String length.', { node: string, keyword: XsmpUtils.getKeywordForType(string) }); }
        else if (length as bigint < 0) { accept('error', 'The String length shall be a positive number.', { node: string, property: 'length' }); }
    }

    checkArrayType(array: ast.ArrayType, accept: ValidationAcceptor): void {
        this.checkModifier(array, [ast.isVisibilityModifiers], accept);
        const size = this.checkExpression(PTK.Int64, array.size, accept);
        if (size === undefined) {
            accept('error', 'Missing Array size.', { node: array, keyword: XsmpUtils.getKeywordForType(array) });
        }
        else if (size as bigint < 0) {
            accept('error', 'The Array size shall be a positive number.', { node: array, property: 'size' });
        }

        if (this.checkTypeReference(accept, array, array.itemType?.ref, 'itemType')) {
            const type = array.itemType.ref as ast.ValueType;

            if (XsmpUtils.isRecursiveType(array, type)) {
                accept('error', 'Recursive Array Type.', { node: array, property: 'itemType' });
            }

            if (!ast.isSimpleType(type) && this.attrHelper.isSimpleArray(array)) {
                accept('error', 'An array annotated with \'@SimpleArray\' requires a SimpleType item type.', { node: array, property: 'itemType', data: diagnosticData(IssueCodes.NonSimpleArray) });
            }
        }
    }

    checkAttributeType(attribute: ast.AttributeType, accept: ValidationAcceptor): void {
        this.checkModifier(attribute, [ast.isVisibilityModifiers], accept);
        if (this.checkTypeReference(accept, attribute, attribute.type?.ref, 'type')) {
            if (!attribute.default) {
                accept('warning', 'Default value is missing.', { node: attribute, property: 'name' });
            }
            else {
                this.checkExpression(attribute.type.ref, attribute.default, accept);
            }

            const usages = this.docHelper.getUsages(attribute);

            if (!usages)
                return;
            const visited = new Set<string>();
            for (const usage of usages) {
                const str = usage.toString();
                if (!validUsages.has(str)) {
                    accept('warning', 'Invalid usage.', { node: attribute, range: usage.range, data: diagnosticData(IssueCodes.InvalidUsage) });
                }
                if (visited.has(str)) {
                    accept('warning', 'Duplicated usage.', { node: attribute, range: usage.range, data: diagnosticData(IssueCodes.DuplicatedUsage) });
                }
                visited.add(str);
            }
        }
    }

    checkEntryPoint(entryPoint: ast.EntryPoint, accept: ValidationAcceptor): void {
        entryPoint.input.forEach((f, i) => {
            if (this.checkFieldReference(accept, entryPoint, f.ref, 'input', i) && !XsmpUtils.isInput(f.ref)) { accept('error', 'Field is not an Input.', { node: entryPoint, property: 'input', index: i }); }
        });
        entryPoint.output.forEach((f, i) => {
            if (this.checkFieldReference(accept, entryPoint, f.ref, 'output', i) && !XsmpUtils.isOutput(f.ref)) { accept('error', 'Field is not an Output.', { node: entryPoint, property: 'output', index: i }); }
        });
    }
    checkService(service: ast.Service, accept: ValidationAcceptor): void {
        if (service.name) {
            const duplicates = this.globalCache.get('services', () => this.computeServiceNames()).get(service.name);

            if (duplicates.length > 1 && !isBuiltinLibrary(AstUtils.getDocument(service).uri)) {
                accept('error', 'Duplicated Service name.', {
                    node: service,
                    property: 'name',
                    relatedInformation: duplicates.filter(d => d.node !== service).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
                });
            }
        }
    }

    checkCatalogue(catalogue: ast.Catalogue, accept: ValidationAcceptor): void {
        const date = this.docHelper.getDate(catalogue);
        if (date && isNaN(Date.parse(date.toString().trim()))) {
            accept('warning', 'Invalid date format (e.g: 1970-01-01T00:00:00Z).', { node: catalogue, range: date.range });
        }
        const duplicates = this.indexManager.allElements(ast.Catalogue).filter(c => c.name === catalogue.name).toArray();
        if (duplicates.length > 1 && !isBuiltinLibrary(AstUtils.getDocument(catalogue).uri)) {
            accept('error', 'Duplicated Catalogue name.', {
                node: catalogue,
                property: 'name',
                relatedInformation: duplicates.filter(d => d.node !== catalogue).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
            });
        }
        if (catalogue.$document && !isBuiltinLibrary(catalogue.$document.uri) && !this.projectManager.getProject(catalogue.$document)) {
            accept('warning', 'This Catalogue is not contained in a project.', { node: catalogue, keyword: 'catalogue' });
        }
    }

    checkProperty(property: ast.Property, accept: ValidationAcceptor): void {
        if (this.checkTypeReference(accept, property, property.type?.ref, 'type') &&
            this.checkFieldReference(accept, property, property.attachedField?.ref, 'attachedField') &&
            property.type.ref !== property.attachedField.ref.type?.ref) {
            accept('error', 'The Type of the AttachedField shall match the Type of the Property.', { node: property, property: 'attachedField' });
        }

        const getRaises = new Set<ast.Type | undefined>();
        for (const [index, exception] of property.getRaises.entries()) {
            if (this.checkTypeReference(accept, property, exception.ref, 'getRaises', index)) {
                if (getRaises.has(exception.ref)) {
                    accept('error', 'Duplicated exception.', {
                        node: property, property: 'getRaises', index, data: diagnosticData(IssueCodes.DuplicatedException)
                    });
                }
                else {
                    getRaises.add(exception.ref);
                }
            }
        }
        const setRaises = new Set<ast.Type | undefined>();
        for (const [index, exception] of property.setRaises.entries()) {
            if (this.checkTypeReference(accept, property, exception.ref, 'setRaises', index)) {
                if (setRaises.has(exception.ref)) {
                    accept('error', 'Duplicated exception.', {
                        node: property, property: 'setRaises', index, data: diagnosticData(IssueCodes.DuplicatedException)
                    });
                }
                else {
                    setRaises.add(exception.ref);
                }
            }
        }
        const isStatic = this.attrHelper.attribute(property, 'Attributes.Static');
        if (this.attrHelper.isAttributeTrue(isStatic)) {
            if (ast.isInterface(property.$container)) {
                accept('error', 'A Property of an Interface shall not be static.', { node: isStatic!, data: diagnosticData(IssueCodes.InvalidAttribute) });
            }

            const isVirtual = this.attrHelper.attribute(property, 'Attributes.Virtual');
            if (this.attrHelper.isAttributeTrue(isVirtual)) {
                accept('error', 'A Property shall not be both Static and Virtual.', { node: isVirtual!, data: diagnosticData(IssueCodes.InvalidAttribute) });
            }

            const isAbstract = this.attrHelper.attribute(property, 'Attributes.Abstract');
            if (this.attrHelper.isAttributeTrue(isAbstract)) {
                accept('error', 'A Property shall not be both Static and Abstract.', { node: isAbstract!, data: diagnosticData(IssueCodes.InvalidAttribute) });
            }

            if (property.attachedField?.ref && !this.attrHelper.isStatic(property.attachedField.ref)) {
                accept('error', 'A Property shall not be Static if the attached field is not Static.', { node: isStatic!, data: diagnosticData(IssueCodes.InvalidAttribute) });
            }
        }

        // An element shall not be both byPointer and ByReference
        const isByPointer = this.attrHelper.attribute(property, 'Attributes.ByPointer');
        if (this.attrHelper.isAttributeTrue(isByPointer) && this.attrHelper.isAttributeTrue(this.attrHelper.attribute(property, 'Attributes.ByReference'))) {
            accept('error', 'A Property shall not be both ByPointer and ByReference.', { node: isByPointer!, data: diagnosticData(IssueCodes.InvalidAttribute) });
        }
    }

    checkReference(reference: ast.Reference, accept: ValidationAcceptor): void {
        this.checkTypeReference(accept, reference, reference.interface?.ref, 'interface');
    }

    checkValueReference(valueReference: ast.ValueReference, accept: ValidationAcceptor): void {
        this.checkModifier(valueReference, [ast.isVisibilityModifiers], accept);
        this.checkTypeReference(accept, valueReference, valueReference.type?.ref, 'type');
    }

    checkOperation(operation: ast.Operation, accept: ValidationAcceptor): void {

        const raisedException = new Set<ast.Type | undefined>();
        for (const [index, exception] of operation.raisedException.entries()) {
            if (this.checkTypeReference(accept, operation, exception.ref, 'raisedException', index)) {
                if (raisedException.has(exception.ref)) { accept('error', 'Duplicated exception.', { node: operation, property: 'raisedException', index, data: diagnosticData(IssueCodes.DuplicatedException) }); }
                else { raisedException.add(exception.ref); }
            }
        }

        const isStatic = this.attrHelper.attribute(operation, 'Attributes.Static');
        if (this.attrHelper.isAttributeTrue(isStatic)) {
            if (ast.isInterface(operation.$container)) { accept('error', 'An Operation of an Interface shall not be static.', { node: isStatic!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }

            const isVirtual = this.attrHelper.attribute(operation, 'Attributes.Virtual');
            if (this.attrHelper.isAttributeTrue(isVirtual)) { accept('error', 'An Operation shall not be both Static and Virtual.', { node: isVirtual!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }

            const isAbstract = this.attrHelper.attribute(operation, 'Attributes.Abstract');
            if (this.attrHelper.isAttributeTrue(isAbstract)) { accept('error', 'An Operation shall not be both Static and Abstract.', { node: isAbstract!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }
        }

        const isConstructor = this.attrHelper.attribute(operation, 'Attributes.Constructor');
        if (this.attrHelper.isAttributeTrue(isConstructor)) {
            if (this.attrHelper.isAttributeTrue(isStatic)) { accept('error', 'A Constructor shall not be Static .', { node: isStatic!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }

            const isVirtual = this.attrHelper.attribute(operation, 'Attributes.Virtual');
            if (this.attrHelper.isAttributeTrue(isVirtual)) { accept('error', 'A Constructor shall not be Virtual.', { node: isVirtual!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }

            const isConst = this.attrHelper.attribute(operation, 'Attributes.Const');
            if (this.attrHelper.isAttributeTrue(isConst)) { accept('warning', 'Const attribute is ignored for a Constructor.', { node: isConst!, data: diagnosticData(IssueCodes.InvalidAttribute) }); }

            if (operation.returnParameter) { accept('error', 'A Constructors shall not have any return parameters.', { node: operation, property: 'returnParameter' }); }
        }

        const parameterNames = new Set<string>();
        if (operation.returnParameter?.name) { parameterNames.add(operation.returnParameter.name); }

        // Check that default value of parameters are provided
        let requireDefaultValue = false;
        for (const parameter of operation.parameter) {
            if (parameterNames.has(parameter.name ?? '')) { accept('error', 'Duplicated parameter name.', { node: parameter, property: 'name' }); }
            else { parameterNames.add(parameter.name ?? ''); }

            if (parameter.default !== undefined) { requireDefaultValue = true; }
            else if (requireDefaultValue) { accept('error', 'The Parameter requires a default vallue.', { node: parameter, property: 'default', data: diagnosticData(IssueCodes.MissingValue) }); }
        }

    }
    checkParameter(parameter: ast.Parameter, accept: ValidationAcceptor): void {
        if (this.checkTypeReference(accept, parameter, parameter.type?.ref, 'type')) { this.checkExpression(parameter.type.ref, parameter.default, accept); } //TODO isByPointer

        const isByPointer = this.attrHelper.attribute(parameter, 'Attributes.ByPointer');
        if (this.attrHelper.isAttributeTrue(isByPointer) && this.attrHelper.isAttributeTrue(this.attrHelper.attribute(parameter, 'Attributes.ByReference'))) {
            accept('error', 'A Parameter shall not be both ByPointer and ByReference.', { node: isByPointer!, data: diagnosticData(IssueCodes.InvalidAttribute) });
        }
    }

    checkReturnParameter(parameter: ast.ReturnParameter, accept: ValidationAcceptor): void {
        this.checkTypeReference(accept, parameter, parameter.type?.ref, 'type');

        const isByPointer = this.attrHelper.attribute(parameter, 'Attributes.ByPointer');
        if (this.attrHelper.isAttributeTrue(isByPointer) && this.attrHelper.isAttributeTrue(this.attrHelper.attribute(parameter, 'Attributes.ByReference'))) {
            accept('error', 'A Parameter shall not be both ByPointer and ByReference.', { node: isByPointer!, data: diagnosticData(IssueCodes.InvalidAttribute) });
        }
        this.checkAttributes(parameter, accept);
    }

    checkPrimitiveType(type: ast.PrimitiveType, accept: ValidationAcceptor): void {
        this.checkModifier(type, [ast.isVisibilityModifiers], accept);
        if (XsmpUtils.getPTK(type) === PTK.None) { accept('error', 'Unsupported Primitive Type.', { node: type, property: 'name' }); }
    }

    checkNamespace(namespace: ast.Namespace, accept: ValidationAcceptor): void {

        const duplicates = this.getDuplicatedName(namespace);
        if (duplicates.length > 1 && (duplicates.some(ast.isType) || duplicates.filter(e => e.type !== ast.Catalogue && AstUtils.getDocument(namespace).uri === e.documentUri).length > 1)) {

            accept('error', 'Duplicated name.', {
                node: namespace,
                property: 'name',
                relatedInformation: duplicates.filter(d => d.node !== namespace && d.type !== ast.Catalogue && AstUtils.getDocument(namespace).uri === d.documentUri).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
            });
        }

    }
}
