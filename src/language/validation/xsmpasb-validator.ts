import { AstUtils, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpasbServices } from '../xsmpasb-module.js';
import { checkNoParentTraversal, checkRelativePath, isAbsolutePath, isValidExpandedL2Identifier } from './l2-validator-utils.js';
import { checkName } from './name-validator-utils.js';
import type { Xsmpl2PathResolver } from '../references/xsmpl2-path-resolver.js';
import type { IdentifierPatternService, TemplateBindings } from '../references/identifier-pattern-service.js';
import { PTK } from '../utils/primitive-type-kind.js';
import * as Solver from '../utils/solver.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { XsmpcfgValidator } from './xsmpcfg-validator.js';
import { collectUsedTemplateParameterNames, warnUnusedTemplateParameters } from './template-parameter-validator-utils.js';

export function registerXsmpasbValidationChecks(services: XsmpasbServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmpasbValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Assembly: validator.checkAssembly,
        ModelInstance: validator.checkModelInstance,
        AssemblyInstance: validator.checkAssemblyInstance,
        SubInstance: validator.checkSubInstance,
        StringParameter: validator.checkStringParameter,
        Int32Parameter: validator.checkInt32Parameter,
        AssemblyComponentConfiguration: validator.checkAssemblyComponentConfiguration,
        GlobalEventHandler: validator.checkGlobalEventHandler,
        FieldValue: validator.checkAssemblyFieldValue,
        EventLink: validator.checkEventLink,
        FieldLink: validator.checkFieldLink,
        InterfaceLink: validator.checkInterfaceLink,
        OperationCall: validator.checkOperationCall,
        PropertyValue: validator.checkPropertyValue,
    };
    registry.register(checks, validator, 'fast');
}

export class XsmpasbValidator extends XsmpcfgValidator {
    protected readonly l2PathResolver: Xsmpl2PathResolver;
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpasbServices) {
        super(services);
        this.l2PathResolver = services.shared.L2PathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
    }

    checkAssembly(assembly: ast.Assembly, accept: ValidationAcceptor): void {
        checkName(accept, assembly, assembly.name, 'name');

        const seen = new Set<string>();
        for (const parameter of assembly.parameters) {
            if (parameter.name) {
                if (seen.has(parameter.name)) {
                    accept('error', 'Duplicated template argument name.', { node: parameter, property: 'name' });
                } else {
                    seen.add(parameter.name);
                }
            }
        }

        warnUnusedTemplateParameters(
            assembly.parameters,
            collectUsedTemplateParameterNames(assembly, this.identifierPatternService),
            accept
        );

        this.checkReferenceUpperBounds(assembly, accept);
    }

    checkModelInstance(model: ast.ModelInstance, accept: ValidationAcceptor): void {
        if (!this.identifierPatternService.hasTemplate(model.name)) {
            checkName(accept, model, model.name, 'name');
        }
        this.checkTemplatedInstanceName(model.name, model, accept);

        const seen = new Set<string>();
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            const instance = subInstance.instance;
            if (!instance) {
                continue;
            }
            const instanceName = instance.name;
            if (!instanceName) {
                continue;
            }
            if (seen.has(instanceName)) {
                accept('error', 'Child Model Instance and Assembly Instance names shall be unique at the same hierarchy level.', {
                    node: instance,
                    property: 'name'
                });
            } else {
                seen.add(instanceName);
            }
        }

        this.checkContainerUpperBounds(model, accept);
    }

    checkAssemblyInstance(instance: ast.AssemblyInstance, accept: ValidationAcceptor): void {
        if (!this.identifierPatternService.hasTemplate(instance.name)) {
            checkName(accept, instance, instance.name, 'name');
        }
        this.checkTemplatedInstanceName(instance.name, instance, accept);
    }

    checkSubInstance(subInstance: ast.SubInstance, accept: ValidationAcceptor): void {
        if (!subInstance.container || subInstance.container.unsafe) {
            return;
        }
        const container = this.l2PathResolver.getLocalNamedReferenceTarget(subInstance.container);
        if (!ast.isContainer(container)) {
            accept('error', 'The selected container shall resolve to a Container of the current Component.', {
                node: subInstance,
                property: 'container'
            });
            return;
        }
        const expectedType = container.type?.ref;
        const instanceType = subInstance.instance ? this.getSubInstanceComponent(subInstance.instance) : undefined;
        if (ast.isReferenceType(expectedType) && instanceType && !XsmpUtils.isBaseOfReferenceType(expectedType, instanceType)) {
            accept('error', 'The type of the sub-instance shall be compatible with the selected Container.', {
                node: subInstance,
                property: 'container'
            });
        }
    }

    checkStringParameter(parameter: ast.StringParameter, accept: ValidationAcceptor): void {
        checkName(accept, parameter, parameter.name, 'name');
        if (AstUtils.getContainerOfType(parameter, ast.isAssembly) && parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkInt32Parameter(parameter: ast.Int32Parameter, accept: ValidationAcceptor): void {
        checkName(accept, parameter, parameter.name, 'name');
        if (AstUtils.getContainerOfType(parameter, ast.isAssembly) && parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkAssemblyComponentConfiguration(configuration: ast.AssemblyComponentConfiguration, accept: ValidationAcceptor): void {
        if (!configuration.name || configuration.name.unsafe) {
            return;
        }
        if (!this.checkAssemblyPathTemplateParameters(configuration.name, accept)) {
            return;
        }
        checkNoParentTraversal(accept, configuration, configuration.name, 'name');
        checkRelativePath(accept, configuration, configuration.name, 'name', 'InstancePath');
        const resolution = this.l2PathResolver.getAssemblyComponentPathResolution(configuration.name);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
        if (resolution.active && !resolution.invalidMessage && !resolution.finalComponent) {
            accept('error', 'The configured instance shall resolve to a typed Component.', { node: configuration, property: 'name' });
        }
    }

    checkGlobalEventHandler(handler: ast.GlobalEventHandler, accept: ValidationAcceptor): void {
        if (!handler.entryPoint || handler.entryPoint.unsafe) {
            return;
        }
        const entryPoint = this.l2PathResolver.getLocalNamedReferenceTarget(handler.entryPoint);
        if (!ast.isEntryPoint(entryPoint)) {
            accept('error', 'The selected entry point shall resolve to an EntryPoint of the current Component.', {
                node: handler,
                property: 'entryPoint'
            });
        }
    }

    checkAssemblyFieldValue(fieldValue: ast.FieldValue, accept: ValidationAcceptor): void {
        if (!fieldValue.field || ast.isStructureValue(fieldValue.$container) || fieldValue.field.unsafe) {
            return;
        }
        if (!this.checkAssemblyPathTemplateParameters(fieldValue.field, accept)) {
            return;
        }
        checkNoParentTraversal(accept, fieldValue, fieldValue.field, 'field');
        if (isAbsolutePath(fieldValue.field)) {
            accept('error', 'Field paths in an Assembly shall be relative to the current component instance.', {
                node: fieldValue,
                property: 'field'
            });
        }
        const resolution = this.l2PathResolver.getAssemblyFieldPathResolution(fieldValue.field);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
        if (resolution.active && !resolution.invalidMessage && resolution.finalType && fieldValue.value) {
            this.checkAssemblyValueAgainstType(fieldValue.value, resolution.finalType, accept);
        }
    }

    checkEventLink(link: ast.EventLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
    }

    checkFieldLink(link: ast.FieldLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
    }

    checkInterfaceLink(link: ast.InterfaceLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
        if (link.reference) {
            this.checkInterfaceReference(link.reference, 'reference', 'Owner', 'Client', accept);
        }
        if (link.backReference) {
            this.checkInterfaceReference(link.backReference, 'backReference', 'Client', 'Owner', accept);
        }
    }

    checkOperationCall(call: ast.OperationCall, accept: ValidationAcceptor): void {
        const operationRef = call.operation;
        if (operationRef && !operationRef.unsafe) {
            const operation = this.l2PathResolver.getLocalNamedReferenceTarget(operationRef);
            if (!ast.isOperation(operation)) {
                accept('error', 'The selected operation shall resolve to an Operation of the current Component.', {
                    node: call,
                    property: 'operation'
                });
                return;
            }
            this.checkOperationParameters(call, operation, accept);
        }

        const seen = new Set<string>();
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            if (seen.has(parameter.parameter)) {
                accept('error', 'Duplicated parameter name.', { node: call, property: 'parameters', index });
            } else {
                seen.add(parameter.parameter);
            }
        }
    }

    checkPropertyValue(property: ast.PropertyValue, accept: ValidationAcceptor): void {
        const propertyRef = property.property;
        if (!propertyRef || propertyRef.unsafe) {
            return;
        }
        const target = this.l2PathResolver.getLocalNamedReferenceTarget(propertyRef);
        if (!ast.isProperty(target)) {
            accept('error', 'The selected property shall resolve to a Property of the current Component.', {
                node: property,
                property: 'property'
            });
            return;
        }
        if (XsmpUtils.getAccessKind(target) === 'readOnly') {
            accept('error', 'A PropertyValue shall target a writable Property.', {
                node: property,
                property: 'property'
            });
        }
        if (target.type?.ref && property.value) {
            this.checkAssemblyValueAgainstType(property.value, target.type.ref, accept);
        }
    }

    private checkOperationParameters(call: ast.OperationCall, operation: ast.Operation, accept: ValidationAcceptor): void {
        const parameters = new Map(operation.parameter.filter((parameter): parameter is ast.Parameter & { name: string } => !!parameter.name).map(parameter => [parameter.name, parameter]));
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            const target = parameters.get(parameter.parameter);
            if (!target) {
                accept('error', `The parameter '${parameter.parameter}' shall resolve to a Parameter of operation ${operation.name}.`, {
                    node: call,
                    property: 'parameters',
                    index
                });
                continue;
            }
            if (target.type?.ref && parameter.value) {
                this.checkAssemblyValueAgainstType(parameter.value, target.type.ref, accept);
            }
        }
    }

    private checkLinkPaths(link: ast.Link, accept: ValidationAcceptor): void {
        this.checkLinkPath(link, link.ownerPath, 'ownerPath', 'The Owner Path shall refer to the current Model Instance or one of its children.', accept);
        this.checkLinkPath(link, link.clientPath, 'clientPath', 'The Client Path shall refer to the current Model Instance or one of its children.', accept);
    }

    private checkContainerUpperBounds(model: ast.ModelInstance, accept: ValidationAcceptor): void {
        const counts = new Map<ast.Container, number>();
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            if (!subInstance.container || subInstance.container.unsafe) {
                continue;
            }
            const container = this.l2PathResolver.getLocalNamedReferenceTarget(subInstance.container);
            if (!ast.isContainer(container)) {
                continue;
            }
            const count = (counts.get(container) ?? 0) + 1;
            counts.set(container, count);
            const upper = XsmpUtils.getUpper(container);
            if (upper !== undefined && upper >= BigInt(0) && BigInt(count) > upper) {
                accept('error', `The Container '${container.name ?? '<unknown>'}' shall not contain more than ${upper} sub-instance(s).`, {
                    node: subInstance,
                    property: 'container'
                });
            }
        }
    }

    private checkReferenceUpperBounds(assembly: ast.Assembly, accept: ValidationAcceptor): void {
        const rootBindings = this.createTemplateBindings(assembly.parameters);
        const rootOccurrence = this.createAssemblyOccurrence(assembly, assembly.model, rootBindings, '/', new Set([assembly]));
        if (!rootOccurrence) {
            return;
        }

        const currentDocument = AstUtils.getDocument(assembly);
        const usages = new Map<string, ReferenceUsageBucket>();
        this.visitAssemblyOccurrences(rootOccurrence, rootOccurrence, occurrence => {
            for (const link of occurrence.model.elements.filter(ast.isInterfaceLink)) {
                this.collectReferenceUsage(link, 'reference', link.ownerPath, link.reference, occurrence, rootOccurrence, usages);
                this.collectReferenceUsage(link, 'backReference', link.clientPath, link.backReference, occurrence, rootOccurrence, usages);
            }
        });
        for (const usage of usages.values()) {
            if (usage.upper < BigInt(0) || BigInt(usage.usages.length) <= usage.upper) {
                continue;
            }
            for (const item of usage.usages.filter(candidate => AstUtils.getDocument(candidate.link) === currentDocument)) {
                accept('error', `The Reference '${usage.referenceName}' of instance '${usage.instancePath}' shall not be connected more than ${usage.upper} time(s).`, {
                    node: item.link,
                    property: item.property
                });
            }
        }
    }

    private checkInterfaceReference(
        reference: ast.LocalNamedReference,
        property: 'reference' | 'backReference',
        sourceSide: 'Owner' | 'Client',
        targetSide: 'Owner' | 'Client',
        accept: ValidationAcceptor,
    ): void {
        if (reference.unsafe) {
            return;
        }
        const link = AstUtils.getContainerOfType(reference, ast.isInterfaceLink);
        if (!link) {
            return;
        }
        const target = this.l2PathResolver.getLocalNamedReferenceTarget(reference);
        if (!ast.isReference(target)) {
            accept('error', `The selected reference shall resolve to a Reference of the ${sourceSide} Component.`, {
                node: link,
                property
            });
            return;
        }
        const expectedType = ast.isReferenceType(target.interface?.ref) ? target.interface.ref : undefined;
        const oppositeContext = this.l2PathResolver.getInterfaceLinkEndpointContext(link, property === 'reference' ? 'client' : 'owner');
        if (expectedType && oppositeContext.component && !XsmpUtils.isBaseOfReferenceType(expectedType, oppositeContext.component)) {
            accept('error', `The selected reference shall be compatible with the ${targetSide} Component.`, {
                node: link,
                property
            });
        }
    }

    private getSubInstanceComponent(instance: ast.ModelInstance | ast.AssemblyInstance): ast.Component | undefined {
        if (ast.isModelInstance(instance)) {
            return ast.isComponent(instance.implementation?.ref) ? instance.implementation.ref : undefined;
        }
        const assembly = ast.isAssembly(instance.assembly?.ref) ? instance.assembly.ref : undefined;
        return assembly && ast.isComponent(assembly.model?.implementation?.ref) ? assembly.model.implementation.ref : undefined;
    }

    private collectReferenceUsage(
        link: ast.InterfaceLink,
        property: 'reference' | 'backReference',
        path: ast.Path | undefined,
        reference: ast.LocalNamedReference | undefined,
        occurrence: AssemblyOccurrence,
        rootOccurrence: AssemblyOccurrence,
        usages: Map<string, ReferenceUsageBucket>,
    ): void {
        if (!path || !reference || reference.unsafe || path.unsafe) {
            return;
        }
        const targetOccurrence = this.resolveOccurrencePath(path, occurrence, rootOccurrence);
        if (!targetOccurrence?.component) {
            return;
        }
        const targetReference = this.resolveReferenceForComponent(reference, targetOccurrence.component);
        if (!targetReference) {
            return;
        }
        const upper = XsmpUtils.getUpper(targetReference);
        if (upper === undefined || upper < BigInt(0)) {
            return;
        }
        const key = `${targetOccurrence.absolutePath}::${targetReference.name ?? '<unknown>'}`;
        const usage = usages.get(key) ?? {
            upper,
            referenceName: targetReference.name ?? '<unknown>',
            instancePath: this.displayOccurrencePath(targetOccurrence),
            usages: [],
        };
        usage.usages.push({ link, property });
        usages.set(key, usage);
    }

    private checkLinkPath(
        link: ast.Link,
        path: ast.Path | undefined,
        property: 'ownerPath' | 'clientPath',
        absoluteMessage: string,
        accept: ValidationAcceptor,
    ): void {
        if (!path) {
            return;
        }
        if (path.unsafe) {
            return;
        }
        if (!this.checkAssemblyPathTemplateParameters(path, accept)) {
            return;
        }
        checkNoParentTraversal(accept, link, path, property);
        const resolution = this.l2PathResolver.getAssemblyLinkPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
        if (isAbsolutePath(path)) {
            accept('error', absoluteMessage, { node: link, property });
        }
    }

    protected checkAssemblyValueAgainstType(value: ast.Value, type: ast.Type, accept: ValidationAcceptor): void {
        if (ast.isArrayType(type)) {
            this.checkAssemblyArrayValue(value, type, accept);
            return;
        }
        if (ast.isStructure(type)) {
            this.checkAssemblyStructureValue(value, type, accept);
            return;
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool:
                this.expectValueKind(value, ast.isBoolValue(value), type, accept);
                return;
            case PTK.Char8:
                this.expectValueKind(value, ast.isChar8Value(value), type, accept);
                return;
            case PTK.DateTime:
                this.expectValueKind(value, ast.isDateTimeValue(value), type, accept);
                return;
            case PTK.Duration:
                this.expectValueKind(value, ast.isDurationValue(value), type, accept);
                return;
            case PTK.Enum:
                this.expectValueKind(value, ast.isEnumerationValue(value), type, accept);
                return;
            case PTK.Float32:
                this.expectValueKind(value, ast.isFloat32Value(value), type, accept);
                if (ast.isFloat32Value(value)) {
                    this.checkFloatingValueRange(value, type, PTK.Float32, accept);
                }
                return;
            case PTK.Float64:
                this.expectValueKind(value, ast.isFloat64Value(value), type, accept);
                if (ast.isFloat64Value(value)) {
                    this.checkFloatingValueRange(value, type, PTK.Float64, accept);
                }
                return;
            case PTK.Int8:
                this.expectValueKind(value, ast.isInt8Value(value), type, accept);
                if (ast.isInt8Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.Int8, accept);
                }
                return;
            case PTK.Int16:
                this.expectValueKind(value, ast.isInt16Value(value), type, accept);
                if (ast.isInt16Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.Int16, accept);
                }
                return;
            case PTK.Int32:
                this.expectValueKind(value, ast.isInt32Value(value), type, accept);
                if (ast.isInt32Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.Int32, accept);
                }
                return;
            case PTK.Int64:
                this.expectValueKind(value, ast.isInt64Value(value), type, accept);
                if (ast.isInt64Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.Int64, accept);
                }
                return;
            case PTK.String8:
                this.expectValueKind(value, ast.isString8Value(value), type, accept);
                return;
            case PTK.UInt8:
                this.expectValueKind(value, ast.isUInt8Value(value), type, accept);
                if (ast.isUInt8Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.UInt8, accept);
                }
                return;
            case PTK.UInt16:
                this.expectValueKind(value, ast.isUInt16Value(value), type, accept);
                if (ast.isUInt16Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.UInt16, accept);
                }
                return;
            case PTK.UInt32:
                this.expectValueKind(value, ast.isUInt32Value(value), type, accept);
                if (ast.isUInt32Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.UInt32, accept);
                }
                return;
            case PTK.UInt64:
                this.expectValueKind(value, ast.isUInt64Value(value), type, accept);
                if (ast.isUInt64Value(value)) {
                    this.checkIntegralValueRange(value, type, PTK.UInt64, accept);
                }
                return;
            default:
                return;
        }
    }

    protected checkAssemblyArrayValue(value: ast.Value, type: ast.ArrayType, accept: ValidationAcceptor): void {
        if (!ast.isArrayValue(value)) {
            this.expectValueKind(value, false, type, accept);
            return;
        }

        const maxSize = Solver.getValue(type.size)?.integralValue(PTK.Int64)?.getValue();
        if (maxSize !== undefined && BigInt(value.elements.length) > maxSize) {
            accept('error', `The array value shall not contain more than ${maxSize} item(s).`, { node: value });
        }

        if (!type.itemType?.ref) {
            return;
        }

        const size = maxSize !== undefined ? Math.min(value.elements.length, Number(maxSize)) : value.elements.length;
        for (let index = 0; index < size; index++) {
            this.checkAssemblyValueAgainstType(value.elements[index], type.itemType.ref, accept);
        }
    }

    protected checkAssemblyStructureValue(value: ast.Value, type: ast.Structure, accept: ValidationAcceptor): void {
        if (!ast.isStructureValue(value)) {
            this.expectValueKind(value, false, type, accept);
            return;
        }

        const fields = this.pathResolver.getFieldCandidatesForType(type);
        const usedFields = new Set<string>();
        let positionalIndex = 0;

        const nextPositionalField = (): ast.Field | undefined => {
            while (positionalIndex < fields.length) {
                const field = fields[positionalIndex++];
                if (field.name && !usedFields.has(field.name)) {
                    return field;
                }
            }
            return undefined;
        };

        for (const element of value.elements) {
            if (ast.isFieldValue(element) && element.field) {
                const field = this.resolveStructureFieldByPath(type, element.field);
                if (!field) {
                    if (!element.field.unsafe) {
                        accept('error', `The structure field path '${this.pathService.stringifyPath(element.field)}' does not exist on type ${XsmpUtils.fqn(type)}.`, { node: element, property: 'field' });
                    }
                    continue;
                }
                if (field.name) {
                    usedFields.add(field.name);
                }
                if (!element.field.unsafe && field.type?.ref && element.value) {
                    this.checkAssemblyValueAgainstType(element.value, field.type.ref, accept);
                }
                continue;
            }

            const field = nextPositionalField();
            if (!field) {
                accept('error', `The structure value shall not contain more values than the fields of ${XsmpUtils.fqn(type)}.`, { node: element });
                continue;
            }
            if (field.name) {
                usedFields.add(field.name);
            }
            if (field.type?.ref) {
                this.checkAssemblyValueAgainstType(element, field.type.ref, accept);
            }
        }
    }

    protected resolveStructureFieldByPath(type: ast.Structure, path: ast.Path): ast.Field | undefined {
        if (path.absolute) {
            return undefined;
        }

        const segments: Array<ast.PathElement | ast.PathSegment> = [];
        if (path.head) {
            segments.push(path.head);
        }
        segments.push(...path.elements);
        if (segments.length === 0) {
            return undefined;
        }

        const first = segments[0];
        if (ast.isPathIndex(first) || ast.isPathParentSegment(first) || ast.isPathSelfSegment(first) || (ast.isPathMember(first) && first.separator === '/')) {
            return undefined;
        }

        const firstSegment = ast.isPathMember(first) ? first.segment : first;
        if (!ast.isPathNamedSegment(firstSegment)) {
            return undefined;
        }

        let field = this.resolveNamedStructureField(type, firstSegment);
        if (!field) {
            return undefined;
        }

        let currentType = field.type?.ref;
        for (let index = 1; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                if (!currentType || !ast.isArrayType(currentType)) {
                    return undefined;
                }
                currentType = currentType.itemType?.ref;
                continue;
            }
            if (!ast.isPathMember(segment) || segment.separator !== '.' || ast.isPathParentSegment(segment.segment) || ast.isPathSelfSegment(segment.segment)) {
                return undefined;
            }
            if (!ast.isStructure(currentType) || !ast.isPathNamedSegment(segment.segment)) {
                return undefined;
            }
            field = this.resolveNamedStructureField(currentType, segment.segment);
            if (!field) {
                return undefined;
            }
            currentType = field.type?.ref;
        }

        return field;
    }

    protected resolveNamedStructureField(type: ast.Structure, segment: ast.PathNamedSegment): ast.Field | undefined {
        const candidates = this.pathResolver.getFieldCandidatesForType(type);
        if (ast.isConcretePathNamedSegment(segment)) {
            const linked = segment.reference?.ref;
            if (linked && candidates.includes(linked as ast.Field)) {
                return linked as ast.Field;
            }
            const refText = segment.reference?.$refText;
            return refText ? candidates.find(candidate => candidate.name === refText) : undefined;
        }
        const matches = this.identifierPatternService.matchCandidates(segment, candidates, candidate => candidate.name ?? '', undefined).matches;
        return matches.length === 1 ? matches[0] : undefined;
    }

    protected checkTemplatedInstanceName(
        name: string | undefined,
        node: ast.ModelInstance | ast.AssemblyInstance,
        accept: ValidationAcceptor,
    ): void {
        const pattern = this.identifierPatternService.parseTextPattern(name);
        if (!pattern || !this.identifierPatternService.hasTemplate(pattern)) {
            return;
        }
        const assembly = AstUtils.getContainerOfType(node, ast.isAssembly);
        const parameters = new Map((assembly?.parameters ?? []).map(parameter => [parameter.name, parameter]));
        for (const part of pattern.parts) {
            if (part.kind !== 'template' || !part.parameterName) {
                continue;
            }
            if (!parameters.has(part.parameterName)) {
                accept('error', `The placeholder '{${part.parameterName}}' shall resolve to a Template Argument of the enclosing Assembly.`, {
                    node,
                    property: 'name'
                });
            }
        }

        const bindings = this.getAssemblyTemplateBindings(assembly);
        const concreteName = this.identifierPatternService.substitute(pattern, bindings);
        if (concreteName !== undefined && !isValidExpandedL2Identifier(concreteName)) {
            accept('error', `The expanded name '${concreteName}' is not valid for SMP Level 2.`, {
                node,
                property: 'name'
            });
        }
    }

    protected checkAssemblyPathTemplateParameters(path: ast.Path, accept: ValidationAcceptor): boolean {
        const assembly = AstUtils.getContainerOfType(path, ast.isAssembly);
        const available = new Set((assembly?.parameters ?? []).map(parameter => parameter.name));
        const bindings = this.getAssemblyTemplateBindings(assembly);
        let valid = true;
        for (const segment of this.pathService.getPathSegments(path)) {
            const namedSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (!ast.isPathNamedSegment(namedSegment)) {
                continue;
            }
            for (const templateName of this.identifierPatternService.getSegmentTemplateNames(namedSegment)) {
                if (!available.has(templateName)) {
                    valid = false;
                    accept('error', `The placeholder '{${templateName}}' shall resolve to a Template Argument of the enclosing Assembly.`, {
                        node: namedSegment
                    });
                }
            }
            const pattern = this.identifierPatternService.getSegmentPattern(namedSegment);
            const concreteText = this.identifierPatternService.substitute(pattern, bindings);
            if (this.identifierPatternService.hasTemplate(pattern) && concreteText !== undefined && !isValidExpandedL2Identifier(concreteText)) {
                valid = false;
                accept('error', `The expanded path segment '${concreteText}' is not valid for SMP Level 2.`, {
                    node: namedSegment
                });
            }
        }
        return valid;
    }

    protected getAssemblyTemplateBindings(assembly: ast.Assembly | undefined): Map<string, string> {
        const bindings = new Map<string, string>();
        for (const parameter of assembly?.parameters ?? []) {
            if (!parameter.name) {
                continue;
            }
            if (ast.isStringParameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, parameter.value.startsWith('"') && parameter.value.endsWith('"')
                    ? parameter.value.slice(1, -1)
                    : parameter.value);
            } else if (ast.isInt32Parameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, parameter.value.toString());
            }
        }
        return bindings;
    }

    private createAssemblyOccurrence(
        assembly: ast.Assembly,
        model: ast.ModelInstance | undefined,
        bindings: TemplateBindings | undefined,
        absolutePath: string,
        stack: Set<ast.Assembly>,
    ): AssemblyOccurrence | undefined {
        if (!model) {
            return undefined;
        }
        const component = ast.isComponent(model.implementation?.ref) ? model.implementation.ref : undefined;
        const children: AssemblyOccurrenceChild[] = [];
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            const instance = subInstance.instance;
            if (!instance) {
                continue;
            }
            const concreteName = this.resolveConcreteInstanceName(instance.name, bindings);
            if (!concreteName) {
                continue;
            }
            const childPath = this.joinOccurrencePath(absolutePath, concreteName);
            if (ast.isModelInstance(instance)) {
                const childOccurrence = this.createAssemblyOccurrence(assembly, instance, bindings, childPath, stack);
                if (childOccurrence) {
                    children.push({ name: concreteName, occurrence: childOccurrence });
                }
                continue;
            }
            if (ast.isAssemblyInstance(instance)) {
                const childAssembly = ast.isAssembly(instance.assembly?.ref) ? instance.assembly.ref : undefined;
                const childBindings = childAssembly ? this.createTemplateBindings(childAssembly.parameters, instance.arguments) : undefined;
                const childOccurrence = childAssembly
                    ? (stack.has(childAssembly)
                        ? this.createAssemblyOccurrence(childAssembly, childAssembly.model, childBindings, childPath, stack)
                        : this.createAssemblyOccurrence(childAssembly, childAssembly.model, childBindings, childPath, new Set([...stack, childAssembly])))
                    : undefined;
                if (childOccurrence) {
                    children.push({ name: concreteName, occurrence: childOccurrence });
                }
            }
        }
        return { assembly, model, component, bindings, absolutePath, children };
    }

    private visitAssemblyOccurrences(
        occurrence: AssemblyOccurrence,
        rootOccurrence: AssemblyOccurrence,
        visit: (occurrence: AssemblyOccurrence, rootOccurrence: AssemblyOccurrence) => void,
    ): void {
        visit(occurrence, rootOccurrence);
        for (const child of occurrence.children) {
            this.visitAssemblyOccurrences(child.occurrence, rootOccurrence, visit);
        }
    }

    private resolveOccurrencePath(
        path: ast.Path,
        occurrence: AssemblyOccurrence,
        rootOccurrence: AssemblyOccurrence,
    ): AssemblyOccurrence | undefined {
        let current = path.absolute ? rootOccurrence : occurrence;
        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return path.absolute ? current : undefined;
        }
        for (const segment of segments) {
            if (ast.isPathIndex(segment)) {
                return undefined;
            }
            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment) || !ast.isPathNamedSegment(actualSegment)) {
                return undefined;
            }
            const matches = current.children.filter(child =>
                this.identifierPatternService.matches(this.identifierPatternService.getSegmentPattern(actualSegment), child.name, current.bindings)
            );
            if (matches.length !== 1) {
                return undefined;
            }
            current = matches[0].occurrence;
        }
        return current;
    }

    private resolveReferenceForComponent(reference: ast.LocalNamedReference, component: ast.Component): ast.Reference | undefined {
        const referenceName = this.pathService.getLocalNamedReferenceText(reference);
        if (!referenceName) {
            return undefined;
        }
        return this.l2PathResolver.getComponentMembersByKind(component, ['reference'])
            .find((candidate): candidate is ast.Reference => ast.isReference(candidate) && candidate.name === referenceName);
    }

    private createTemplateBindings(
        parameters: readonly ast.TemplateParameter[],
        argumentsList: readonly ast.TemplateArgument[] = [],
    ): TemplateBindings | undefined {
        const bindings = new Map<string, string>();
        for (const parameter of parameters) {
            if (!parameter.name) {
                continue;
            }
            if (ast.isStringParameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, this.stripStringQuotes(parameter.value));
            } else if (ast.isInt32Parameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, parameter.value.toString());
            }
        }
        for (const argument of argumentsList) {
            const parameterName = argument.parameter?.ref?.name;
            if (!parameterName) {
                continue;
            }
            if (ast.isStringArgument(argument) && argument.value !== undefined) {
                bindings.set(parameterName, this.stripStringQuotes(argument.value));
            } else if (ast.isInt32Argument(argument) && argument.value !== undefined) {
                bindings.set(parameterName, argument.value.toString());
            }
        }
        return bindings.size > 0 ? bindings : undefined;
    }

    private resolveConcreteInstanceName(name: string | undefined, bindings: TemplateBindings | undefined): string | undefined {
        return this.identifierPatternService.substitute(name, bindings) ?? name;
    }

    private joinOccurrencePath(parentPath: string, childName: string): string {
        return parentPath === '/' ? `/${childName}` : `${parentPath}/${childName}`;
    }

    private displayOccurrencePath(occurrence: AssemblyOccurrence): string {
        return occurrence.absolutePath === '/' ? '/' : occurrence.absolutePath;
    }

    private stripStringQuotes(text: string): string {
        return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    }
}

interface AssemblyOccurrenceChild {
    name: string;
    occurrence: AssemblyOccurrence;
}

interface AssemblyOccurrence {
    assembly: ast.Assembly;
    model: ast.ModelInstance;
    component?: ast.Component;
    bindings?: TemplateBindings;
    absolutePath: string;
    children: AssemblyOccurrenceChild[];
}

interface ReferenceUsageBucket {
    upper: bigint;
    referenceName: string;
    instancePath: string;
    usages: Array<{
        link: ast.InterfaceLink;
        property: 'reference' | 'backReference';
    }>;
}
