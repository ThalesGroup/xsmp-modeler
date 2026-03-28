import { type AstNode, type ValidationAcceptor, type ValidationChecks, AstUtils, diagnosticData } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';
import type { XsmpAddedSharedServices } from '../xsmp-module.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import type { XsmpcfgPathResolver } from '../references/xsmpcfg-path-resolver.js';
import type { AttributeHelper } from '../utils/attribute-helper.js';
import { checkName } from './name-validator-utils.js';
import { checkTemplatedPathSegments, createTemplateBindings } from './template-parameter-validator-utils.js';
import * as Solver from '../utils/solver.js';
import { PTK } from '../utils/primitive-type-kind.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import type { IdentifierPatternService, TemplateBindings } from '../references/identifier-pattern-service.js';
import type { ProjectManager } from '../workspace/project-manager.js';

export function registerXsmpcfgValidationChecks(services: XsmpcfgServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmpcfgValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Configuration: validator.checkConfiguration,
        ComponentConfiguration: validator.checkComponentConfiguration,
        ConfigurationUsage: validator.checkConfigurationUsage,
        FieldValue: validator.checkFieldValue,
        FloatValue: validator.checkFloatValue,
        IntValue: validator.checkIntValue,
    };
    registry.register(checks, validator, 'fast');
}

type XsmpcfgValidationServices = {
    shared: Pick<XsmpAddedSharedServices, 'AttributeHelper' | 'CfgPathResolver' | 'IdentifierPatternService' | 'PathService' | 'workspace'>;
};

export class XsmpcfgValidator {
    protected readonly attrHelper: AttributeHelper;
    protected readonly pathResolver: XsmpcfgPathResolver;
    protected readonly pathService: XsmpPathService;
    protected readonly identifierPatternService: IdentifierPatternService;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpcfgValidationServices | XsmpcfgServices) {
        this.attrHelper = services.shared.AttributeHelper;
        this.pathResolver = services.shared.CfgPathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
        this.pathService = services.shared.PathService;
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    checkConfiguration(configuration: ast.Configuration, accept: ValidationAcceptor): void {
        checkName(accept, configuration, configuration.name, ast.Configuration.name);
    }

    checkComponentConfiguration(configuration: ast.ComponentConfiguration, accept: ValidationAcceptor): void {
        const path = configuration.name;
        if (!path) {
            return;
        }
        if (path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        const resolution = this.pathResolver.getComponentPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    checkConfigurationUsage(usage: ast.ConfigurationUsage, accept: ValidationAcceptor): void {
        const path = usage.path;
        if (!path || path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        const resolution = this.pathResolver.getComponentPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    checkFieldValue(fieldValue: ast.FieldValue, accept: ValidationAcceptor): void {
        if (!ast.isPath(fieldValue.field)) {
            return;
        }
        if (fieldValue.field.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(fieldValue.field, accept)) {
            return;
        }
        const resolution = this.pathResolver.getFieldPathResolution(fieldValue.field);
        if (!resolution.active) {
            return;
        }
        if (resolution.invalidMessage) {
            this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
            return;
        }
        if (resolution.finalType && fieldValue.value) {
            this.checkValueAgainstType(fieldValue.value, resolution.finalType, accept);
        }
    }

    checkIntValue(value: ast.IntValue, accept: ValidationAcceptor): void {
        this.checkUnsuffixedNumericValue(value, 'integer', accept);
    }

    checkFloatValue(value: ast.FloatValue, accept: ValidationAcceptor): void {
        this.checkUnsuffixedNumericValue(value, 'floating-point', accept);
    }

    protected acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }

    protected checkPathTemplateParameters(path: ast.Path, accept: ValidationAcceptor): boolean {
        const templateContext = this.getPathTemplateContext(path);
        const available = new Set(templateContext?.parameters.map(parameter => parameter.name));
        return checkTemplatedPathSegments(
            path,
            available,
            templateContext?.bindings ?? new Map(),
            this.identifierPatternService,
            this.pathService,
            accept,
            templateName => `The placeholder '{${templateName}}' shall resolve to a Template Argument of the enclosing Assembly context.`,
        );
    }

    protected getPathTemplateContext(path: ast.Path): {
        parameters: readonly ast.TemplateParameter[];
        bindings?: TemplateBindings;
    } | undefined {
        const configuration = AstUtils.getContainerOfType(path.$container, ast.isComponentConfiguration);
        if (!configuration) {
            return undefined;
        }

        if (path.$container === configuration) {
            const explicitAssembly = ast.isAssembly(configuration.context?.ref) ? configuration.context.ref : undefined;
            if (explicitAssembly) {
                return {
                    parameters: explicitAssembly.parameters,
                    bindings: createTemplateBindings(explicitAssembly.parameters),
                };
            }
            const parent = ast.isComponentConfiguration(configuration.$container) ? configuration.$container : undefined;
            return parent ? this.getAssemblyTemplateContext(this.pathResolver.getConfigurationComponentContext(parent).assemblyContext) : undefined;
        }

        return this.getAssemblyTemplateContext(this.pathResolver.getConfigurationComponentContext(configuration).assemblyContext);
    }

    protected getAssemblyTemplateContext(context: {
        assembly?: ast.Assembly;
        instance?: ast.ModelInstance | ast.AssemblyInstance;
        bindings?: TemplateBindings;
    } | undefined): {
        parameters: readonly ast.TemplateParameter[];
        bindings?: TemplateBindings;
    } | undefined {
        if (!context) {
            return undefined;
        }
        if (context.assembly) {
            return {
                parameters: context.assembly.parameters,
                bindings: context.bindings,
            };
        }
        const instanceAssembly = ast.isAssemblyInstance(context.instance) && ast.isAssembly(context.instance.assembly?.ref)
            ? context.instance.assembly.ref
            : undefined;
        return instanceAssembly
            ? {
                parameters: instanceAssembly.parameters,
                bindings: context.bindings,
            }
            : undefined;
    }

    protected checkValueAgainstType(value: ast.Value, type: ast.Type, accept: ValidationAcceptor): void {
        if (ast.isArrayType(type)) {
            this.checkArrayValue(value, type, accept);
            return;
        }
        if (ast.isStructure(type)) {
            this.checkStructureValue(value, type, accept);
            return;
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool: {
                this.expectValueKind(value, ast.isBoolValue(value), type, accept);
                return;
            }
            case PTK.Char8: {
                this.expectValueKind(value, ast.isChar8Value(value), type, accept);
                return;
            }
            case PTK.DateTime: {
                this.expectValueKind(value, ast.isDateTimeValue(value), type, accept);
                return;
            }
            case PTK.Duration: {
                this.expectValueKind(value, ast.isDurationValue(value), type, accept);
                return;
            }
            case PTK.Enum: {
                this.expectValueKind(value, ast.isEnumerationValue(value), type, accept);
                return;
            }
            case PTK.Float32: {
                const matches = ast.isFloat32Value(value) || ast.isFloatValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkFloatingValueRange(value, type, PTK.Float32, accept);
                }
                return;
            }
            case PTK.Float64: {
                const matches = ast.isFloat64Value(value) || ast.isFloatValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkFloatingValueRange(value, type, PTK.Float64, accept);
                }
                return;
            }
            case PTK.Int8: {
                const matches = ast.isInt8Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.Int8, accept);
                }
                return;
            }
            case PTK.Int16: {
                const matches = ast.isInt16Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.Int16, accept);
                }
                return;
            }
            case PTK.Int32: {
                const matches = ast.isInt32Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.Int32, accept);
                }
                return;
            }
            case PTK.Int64: {
                const matches = ast.isInt64Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.Int64, accept);
                }
                return;
            }
            case PTK.String8: {
                this.expectValueKind(value, ast.isString8Value(value), type, accept);
                return;
            }
            case PTK.UInt8: {
                const matches = ast.isUInt8Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.UInt8, accept);
                }
                return;
            }
            case PTK.UInt16: {
                const matches = ast.isUInt16Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.UInt16, accept);
                }
                return;
            }
            case PTK.UInt32: {
                const matches = ast.isUInt32Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.UInt32, accept);
                }
                return;
            }
            case PTK.UInt64: {
                const matches = ast.isUInt64Value(value) || ast.isIntValue(value);
                this.expectValueKind(value, matches, type, accept);
                if (matches) {
                    this.checkIntegralValueRange(value, type, PTK.UInt64, accept);
                }
                return;
            }
            case PTK.None:
            default:
                return;
        }
    }

    protected checkArrayValue(value: ast.Value, type: ast.ArrayType, accept: ValidationAcceptor): void {
        if (!ast.isArrayValue(value)) {
            this.expectValueKind(value, false, type, accept);
            return;
        }

        this.checkArrayStartIndex(value, type, accept);

        const maxSize = Solver.getValue(type.size)?.integralValue(PTK.Int64)?.getValue();
        const startIndex = value.startIndex === undefined ? BigInt(0) : BigInt(value.startIndex);
        const occupiedSize = BigInt(value.elements.length) + startIndex;
        if (maxSize !== undefined && occupiedSize > maxSize) {
            const message = startIndex === BigInt(0)
                ? `The array value shall not contain more than ${maxSize} item(s).`
                : `The array value shall not exceed ${maxSize} item(s) when StartIndex is applied.`;
            accept('error', message, { node: value, data: diagnosticData('xsmpcfg.array.size') });
        }

        if (!type.itemType?.ref) {
            return;
        }

        let size = value.elements.length;
        if (maxSize !== undefined) {
            size = Math.min(size, Number(maxSize));
        }
        for (let index = 0; index < size; index++) {
            this.checkValueAgainstType(value.elements[index], type.itemType.ref, accept);
        }
    }

    protected checkArrayStartIndex(value: ast.ArrayValue, type: ast.ArrayType, accept: ValidationAcceptor): void {
        if (value.startIndex === undefined) {
            return;
        }
        if (this.getSmpStandard(value) !== 'ECSS_SMP_2025') {
            accept('error', 'StartIndex is only available in ECSS_SMP_2025.', {
                node: value,
                property: ast.ArrayValue.startIndex
            });
        }
        if (!this.attrHelper.isSimpleArray(type)) {
            accept('error', 'StartIndex is only allowed for SimpleArray values.', {
                node: value,
                property: ast.ArrayValue.startIndex
            });
        }
    }

    protected checkStructureValue(value: ast.Value, type: ast.Structure, accept: ValidationAcceptor): void {
        if (!ast.isStructureValue(value)) {
            this.expectValueKind(value, false, type, accept);
            return;
        }

        const fields = this.pathResolver.getFieldCandidatesForType(type);
        const fieldsByName = new Map(fields.filter((field): field is ast.Field & { name: string } => !!field.name).map(field => [field.name, field] as const));
        const usedFields = new Set<string>();
        const nextPositionalField = this.createNextUnusedFieldSelector(fields, usedFields);

        for (const element of value.elements) {
            if (ast.isCfgStructureFieldValue(element)) {
                const field = element.field ? fieldsByName.get(element.field) : undefined;
                if (!field) {
                    if (!element.unsafe) {
                        accept('error', `The structure field '${element.field}' does not exist on type ${XsmpUtils.fqn(type)}.`, { node: element });
                    }
                    continue;
                }
                if (field.name && usedFields.has(field.name)) {
                    if (!element.unsafe) {
                        accept('error', `The structure field '${field.name}' shall not be initialized more than once.`, { node: element });
                    }
                    continue;
                }
                if (field.name) {
                    usedFields.add(field.name);
                }
                if (!element.unsafe && field.type?.ref && element.value) {
                    this.checkValueAgainstType(element.value, field.type.ref, accept);
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
                this.checkValueAgainstType(element, field.type.ref, accept);
            }
        }
    }

    protected expectValueKind(value: ast.Value, matches: boolean, type: ast.Type, accept: ValidationAcceptor): void {
        if (!matches) {
            accept('error', `The value shall be compatible with type ${XsmpUtils.fqn(type)}.`, { node: value, data: diagnosticData('xsmpcfg.value.type') });
        }
    }

    protected checkIntegralValueRange(value: ast.Value, type: ast.Type, kind: PTK.Int8 | PTK.Int16 | PTK.Int32 | PTK.Int64 | PTK.UInt8 | PTK.UInt16 | PTK.UInt32 | PTK.UInt64, accept: ValidationAcceptor): void {
        const rawValue = this.getIntegralLiteralValue(value);
        if (rawValue === undefined) {
            return;
        }

        const converted = new Solver.IntegralValue(rawValue, kind);
        if (converted.getValue() !== rawValue) {
            accept('error', `Conversion overflow for type ${PTK[kind]}.`, { node: value });
            return;
        }

        if (!ast.isInteger(type)) {
            return;
        }

        const min = Solver.getValue(type.minimum)?.integralValue(kind)?.getValue();
        if (min !== undefined && rawValue < min) {
            accept('error', `Integral value shall be greater than or equal to ${min}.`, { node: value });
        }

        const max = Solver.getValue(type.maximum)?.integralValue(kind)?.getValue();
        if (max !== undefined && rawValue > max) {
            accept('error', `Integral value shall be less than or equal to ${max}.`, { node: value });
        }
    }

    protected checkFloatingValueRange(value: ast.Value, type: ast.Type, kind: PTK.Float32 | PTK.Float64, accept: ValidationAcceptor): void {
        const rawValue = this.getFloatingLiteralValue(value);
        if (rawValue === undefined) {
            return;
        }

        if (!Number.isFinite(rawValue)) {
            accept('error', `Conversion overflow for type ${PTK[kind]}.`, { node: value });
            return;
        }

        if (kind === PTK.Float32 && !Number.isFinite(new Solver.FloatValue(rawValue, kind).getValue())) {
            accept('error', `Conversion overflow for type ${PTK[kind]}.`, { node: value });
            return;
        }

        if (!ast.isFloat(type)) {
            return;
        }

        const min = Solver.getValue(type.minimum)?.floatValue(kind)?.getValue();
        if (min !== undefined) {
            const minExclusive = type.range === '<..' || type.range === '<.<';
            if (rawValue < min || (rawValue === min && minExclusive)) {
                accept('error', minExclusive
                    ? `Float value shall be greater than ${min}.`
                    : `Float value shall be greater than or equal to ${min}.`, { node: value });
            }
        }

        const max = Solver.getValue(type.maximum)?.floatValue(kind)?.getValue();
        if (max !== undefined) {
            const maxExclusive = type.range === '..<' || type.range === '<.<';
            if (rawValue > max || (rawValue === max && maxExclusive)) {
                accept('error', maxExclusive
                    ? `Float value shall be less than ${max}.`
                    : `Float value shall be less than or equal to ${max}.`, { node: value });
            }
        }
    }

    protected getIntegralLiteralValue(value: ast.Value): bigint | undefined {
        if (ast.isIntValue(value) || ast.isInt8Value(value) || ast.isInt16Value(value) || ast.isInt32Value(value) || ast.isInt64Value(value)
            || ast.isUInt8Value(value) || ast.isUInt16Value(value) || ast.isUInt32Value(value) || ast.isUInt64Value(value)) {
            return value.value !== undefined ? BigInt(value.value) : undefined;
        }
        return undefined;
    }

    protected getFloatingLiteralValue(value: ast.Value): number | undefined {
        if (ast.isFloatValue(value) || ast.isFloat32Value(value) || ast.isFloat64Value(value)) {
            return Number.parseFloat(String(value.value));
        }
        return undefined;
    }

    protected getSmpStandard(node: AstNode): string {
        return this.projectManager.getProject(AstUtils.getDocument(node))?.standard ?? 'ECSS_SMP_2020';
    }

    protected checkUnsuffixedNumericValue(value: ast.Value, kind: 'integer' | 'floating-point', accept: ValidationAcceptor): void {
        if (this.getExpectedTypeForValue(value)) {
            return;
        }
        accept('error', `An unsuffixed ${kind} value shall only be used when the target type can be deduced from a resolved safe path.`, { node: value });
    }

    protected getExpectedTypeForValue(value: ast.Value): ast.Type | undefined {
        const container = value.$container;
        if (!container) {
            return undefined;
        }
        if (ast.isFieldValue(container) && container.value === value) {
            return this.getExpectedTypeForFieldValue(container);
        }
        if (ast.isCfgStructureFieldValue(container) && container.value === value) {
            if (container.unsafe) {
                return undefined;
            }
            const structureType = ast.isStructureValue(container.$container)
                ? this.getExpectedTypeForValue(container.$container)
                : undefined;
            return ast.isStructure(structureType) && container.field
                ? this.getNamedStructureFieldType(structureType, container.field)
                : undefined;
        }
        if (ast.isArrayValue(container)) {
            const arrayType = this.getExpectedTypeForValue(container);
            return ast.isArrayType(arrayType) ? arrayType.itemType?.ref : undefined;
        }
        if (ast.isStructureValue(container)) {
            const structureType = this.getExpectedTypeForValue(container);
            if (!ast.isStructure(structureType)) {
                return undefined;
            }
            return this.getPositionalStructureFieldType(container, value, structureType);
        }
        return undefined;
    }

    protected getExpectedTypeForFieldValue(fieldValue: ast.FieldValue): ast.Type | undefined {
        if (!ast.isPath(fieldValue.field) || fieldValue.field.unsafe) {
            return undefined;
        }
        const resolution = this.pathResolver.getFieldPathResolution(fieldValue.field);
        if (!resolution.active || resolution.invalidMessage) {
            return undefined;
        }
        return resolution.finalType;
    }

    protected getNamedStructureFieldType(type: ast.Structure, fieldName: string): ast.Type | undefined {
        return this.pathResolver.getFieldCandidatesForType(type).find(field => field.name === fieldName)?.type?.ref;
    }

    protected getPositionalStructureFieldType(structureValue: ast.StructureValue, target: ast.Value, type: ast.Structure): ast.Type | undefined {
        const fields = this.pathResolver.getFieldCandidatesForType(type);
        const fieldsByName = new Map(fields.filter((field): field is ast.Field & { name: string } => !!field.name).map(field => [field.name, field] as const));
        const usedFields = new Set<string>();
        const nextPositionalField = this.createNextUnusedFieldSelector(fields, usedFields);

        for (const element of structureValue.elements) {
            if (ast.isCfgStructureFieldValue(element)) {
                const field = element.field ? fieldsByName.get(element.field) : undefined;
                if (field?.name && !usedFields.has(field.name)) {
                    usedFields.add(field.name);
                }
                continue;
            }

            const field = nextPositionalField();
            if (!field) {
                return undefined;
            }
            if (element === target) {
                return field.type?.ref;
            }
            if (field.name) {
                usedFields.add(field.name);
            }
        }

        return undefined;
    }

    protected createNextUnusedFieldSelector(fields: readonly ast.Field[], usedFields: ReadonlySet<string>): () => ast.Field | undefined {
        let positionalIndex = 0;
        return (): ast.Field | undefined => {
            while (positionalIndex < fields.length) {
                const field = fields[positionalIndex++];
                if (field.name && !usedFields.has(field.name)) {
                    return field;
                }
            }
            return undefined;
        };
    }
}
