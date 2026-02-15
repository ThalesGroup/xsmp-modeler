
import type { AstNode, Stream } from 'langium';
import { WorkspaceCache, stream } from 'langium';
import * as astPartial from '../generated/ast-partial.js';
import * as ast from '../generated/ast.js';
import { type XsmpSharedServices } from '../xsmp-module.js';
import { fqn, getRealVisibility } from './xsmp-utils.js';
import * as Solver from './solver.js';
import { OperatorKind } from './operator-kind.js';
import { VisibilityKind } from './visibility-kind.js';
import { ViewKind } from './view_kind.js';
import { PTK } from './primitive-type-kind.js';

export type Attributes = 'Attributes.Static'
    | 'Attributes.Const' | 'Attributes.Mutable'
    | 'Attributes.ByPointer' | 'Attributes.ByReference'
    | 'Attributes.Abstract' | 'Attributes.Virtual'
    | 'Attributes.Constructor' | 'Attributes.Forcible'
    | 'Attributes.Failure' | 'Attributes.ConstGetter'
    | 'Attributes.NoConstructor' | 'Attributes.NoDestructor'
    | 'Attributes.SimpleArray' | 'Attributes.Operator' | 'Attributes.View' | string;

function kind(parameter: astPartial.Parameter | astPartial.ReturnParameter): ArgKind {
    if (astPartial.isReferenceType(parameter.type?.ref)) {
        if (astPartial.isParameter(parameter) && (parameter.direction === undefined || parameter.direction === 'in')) {
            return ArgKind.BY_REF;
        }
        return ArgKind.BY_PTR;
    }
    if ((astPartial.isNativeType(parameter.type?.ref) || astPartial.isValueType(parameter.type?.ref)) && astPartial.isParameter(parameter) && (parameter.direction === 'inout' || parameter.direction === 'out')) {
        return ArgKind.BY_PTR;
    }
    return ArgKind.BY_VALUE;
}

enum ArgKind {
    BY_VALUE, BY_PTR, BY_REF
}
export class AttributeHelper {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly cache: WorkspaceCache<{ key: string, node: AstNode }, any>;
    constructor(services: XsmpSharedServices) {
        this.cache = new WorkspaceCache(services);
    }
    attribute(element: astPartial.NamedElement | astPartial.ReturnParameter, id: Attributes): astPartial.Attribute | undefined {
        return this.cache.get({ key: id, node: element }, () => element.attributes.find(a => (a as astPartial.Attribute).type?.ref && fqn((a as ast.Attribute).type.ref) === id)) as astPartial.Attribute | undefined;
    }
    isAttributeTrue(attribute: astPartial.Attribute | undefined): boolean | undefined {
        if (!attribute) {
            return undefined;
        }
        if (attribute.value) {
            return Solver.getValue(attribute.value)?.boolValue()?.getValue();
        }
        if (astPartial.isAttributeType(attribute.type?.ref)) {
            return Solver.getValue(attribute.type.ref.default)?.boolValue()?.getValue();
        }
        return undefined;
    }

    attributeBoolValue(element: astPartial.NamedElement | astPartial.ReturnParameter, id: Attributes): boolean | undefined {
        return this.isAttributeTrue(this.attribute(element, id));
    }

    isConstructor(element: astPartial.NamedElement | astPartial.ReturnParameter): boolean {
        return this.cache.get({ key: 'isConstructor', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Constructor') ?? false
        ) as boolean;
    }
    operatorKind(op: astPartial.Operation): OperatorKind {
        return this.cache.get({ key: 'isConstructor', node: op }, () => {
            const attr = this.attribute(op, 'Attributes.Operator');
            if (!attr?.value || !astPartial.isAttributeType(attr.type?.ref) || !attr.type.ref.type?.ref) {
                return OperatorKind.NONE;
            }

            const value = Solver.getValueAs(attr.value, attr.type.ref.type.ref)?.enumerationLiteral()?.getValue();
            switch (value?.name) {
                case 'Positive': return OperatorKind.POSITIVE;
                case 'Negative': return OperatorKind.NEGATIVE;
                case 'Assign': return OperatorKind.ASSIGN;
                case 'Add': return OperatorKind.ADD;
                case 'Subtract': return OperatorKind.SUBTRACT;
                case 'Multiply': return OperatorKind.MULTIPLY;
                case 'Divide': return OperatorKind.DIVIDE;
                case 'Remainder': return OperatorKind.REMAINDER;
                case 'Greater': return OperatorKind.GREATER;
                case 'Less': return OperatorKind.LESS;
                case 'Equal': return OperatorKind.EQUAL;
                case 'NotGreater': return OperatorKind.NOT_GREATER;
                case 'NotLess': return OperatorKind.NOT_LESS;
                case 'NotEqual': return OperatorKind.NOT_EQUAL;
                case 'Indexer': return OperatorKind.INDEXER;
                case 'Sum': return OperatorKind.SUM;
                case 'Difference': return OperatorKind.DIFFERENCE;
                case 'Product': return OperatorKind.PRODUCT;
                case 'Quotient': return OperatorKind.QUOTIENT;
                case 'Module': return OperatorKind.MODULE;
                case 'None':
                default:
                    return OperatorKind.NONE;
            }
        });
    }
    isFailure(element: astPartial.Field): boolean {
        return this.cache.get({ key: 'isFailure', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Failure') ?? false
        ) as boolean;
    }
    isForcible(element: astPartial.Field): boolean {
        return this.cache.get({ key: 'isForcible', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Forcible') ?? false
        ) as boolean;
    }
    isStatic(element: astPartial.Operation | astPartial.Property | astPartial.Field | astPartial.Association): boolean {
        return this.cache.get({ key: 'isStatic', node: element }, () =>
            !this.isConstructor(element) && (this.attributeBoolValue(element, 'Attributes.Static') ?? false)
        ) as boolean;
    }
    isAbstract(element: astPartial.Operation | astPartial.Property): boolean {
        return this.cache.get({ key: 'isAbstract', node: element }, () =>
            !this.isStatic(element) && (astPartial.isInterface(element.$container) || (this.attributeBoolValue(element, 'Attributes.Abstract') ?? false))
        ) as boolean;
    }
    isVirtual(element: astPartial.Operation | astPartial.Property): boolean {
        return this.cache.get({ key: 'isVirtual', node: element }, () =>
            !this.isConstructor(element) && (this.isAbstract(element) || (this.attributeBoolValue(element, 'Attributes.Virtual') ?? (astPartial.isReferenceType(element.$container) && !this.isStatic(element))))
        ) as boolean;
    }

    isMutable(element: astPartial.Field | astPartial.Association): boolean {
        return this.cache.get({ key: 'isMutable', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Mutable') ?? false
        ) as boolean;
    }
    isConst(element: astPartial.Parameter | astPartial.ReturnParameter | astPartial.Association | astPartial.Operation | astPartial.Property): boolean {
        return this.cache.get({ key: 'isConst', node: element }, () => {
            if (this.isConstructor(element)) {
                return false;
            }
            return this.attributeBoolValue(element, 'Attributes.Const') ?? (astPartial.isParameter(element) && (!element.direction || element.direction === 'in') && !astPartial.isValueType(element.type?.ref));
        }) as boolean;
    }
    isConstGetter(element: astPartial.Property): boolean {
        return this.cache.get({ key: 'isConstGetter', node: element }, () => this.attributeBoolValue(element, 'Attributes.ConstGetter') ?? false) as boolean;
    }

    isByPointer(element: astPartial.Parameter | astPartial.ReturnParameter | astPartial.Association | astPartial.Property): boolean {
        return this.cache.get({ key: 'isByPointer', node: element }, () => {
            const value = this.attributeBoolValue(element, 'Attributes.ByPointer');
            switch (element.$type) {
                case astPartial.Association: return value ?? astPartial.isReferenceType(element.type?.ref);
                case astPartial.Property: return value ?? (astPartial.isReferenceType(element.type?.ref) && !this.isByReference(element));
                case astPartial.Parameter:
                case astPartial.ReturnParameter:
                    return value ?? (kind(element) === ArgKind.BY_PTR && !(this.attributeBoolValue(element, 'Attributes.ByReference') ?? false));
            }
        }) as boolean;

    }
    isByReference(element: astPartial.Parameter | astPartial.ReturnParameter | astPartial.Property): boolean {
        return this.cache.get({ key: 'isByReference', node: element }, () => {
            const value = this.attributeBoolValue(element, 'Attributes.ByReference');
            switch (element.$type) {
                case astPartial.Property: return value ?? false;
                case astPartial.Parameter:
                case astPartial.ReturnParameter:
                    return value ?? (kind(element) === ArgKind.BY_REF && !(this.attributeBoolValue(element, 'Attributes.ByPointer') ?? false));
            }
        }) as boolean;
    }

    isSimpleArray(element: astPartial.ArrayType): boolean {
        return this.cache.get({ key: 'isSimpleArray', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.SimpleArray') ?? false
        ) as boolean;
    }
    getViewKind(node: astPartial.Property | astPartial.Field | astPartial.Operation | astPartial.EntryPoint): ViewKind | undefined {
        return this.cache.get({ key: 'getViewKind', node: node }, () =>
            this.computeViewKind(node)
        ) as ViewKind | undefined;
    }
    private computeViewKind(node: astPartial.NamedElement): ViewKind | undefined {
        const expr = Solver.getValue(this.attribute(node, 'Attributes.View')?.value);
        if (!expr) {
            return undefined;
        }
        const literal = expr.enumerationLiteral()?.getValue();
        if (literal !== undefined) {
            switch (literal.name) {
                case 'VK_None': return ViewKind.VK_None;
                case 'VK_Debug': return ViewKind.VK_Debug;
                case 'VK_Expert': return ViewKind.VK_Expert;
                case 'VK_All': return ViewKind.VK_All;
                default: return undefined;
            }
        }
        const integral = expr.integralValue(PTK.Int32)?.getValue();
        if (integral !== undefined) {
            switch (integral) {
                case BigInt(0): return ViewKind.VK_None;
                case BigInt(1): return ViewKind.VK_Debug;
                case BigInt(2): return ViewKind.VK_Expert;
                case BigInt(3): return ViewKind.VK_All;
                default: return undefined;
            }
        }
        return undefined;
    }

    /**
     * Compute the signature of an element
     *
     * @param op
     *          the input Operation
     * @return the signature
     */
    getSignature(element: astPartial.NamedElement): string | undefined {
        if (astPartial.Operation === element.$type) {
            return `${element.name}(${(element as astPartial.Operation).parameter.map(p => this.getParameterSignature(p), this).join(', ')})`;
        }
        return element.name;
    }
    /**
     * Get the signature of a parameter
     *
     * @param p
     *          the input Parameter
     * @return the signature of the parameter
     */
    getParameterSignature(p: astPartial.Parameter): string {
        let signature = '';
        if (this.isConst(p)) {
            signature += 'const ';
        }
        signature += p.type?.ref ? fqn(p.type.ref) : p.type?.$refText;
        if (this.isByPointer(p)) {
            signature += '*';
        }
        if (this.isByReference(p)) {
            signature += '&';
        }
        return signature;
    }
    getAllFields(element: astPartial.Structure | ast.Structure): Stream<ast.Field> {
        // Return non static and public fields from element's base if any and current element
        const result = stream(element.elements).filter(ast.isField).filter(f => !this.isStatic(f) && getRealVisibility(f) === VisibilityKind.public);
        if (ast.isClass(element) && ast.isStructure(element.base)) {
            return this.getAllFields(element.base).concat(result);
        }
        return result;
    }

}