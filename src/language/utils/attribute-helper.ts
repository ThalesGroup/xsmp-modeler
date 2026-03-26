
import type { AstNode, Stream } from 'langium';
import { WorkspaceCache, stream } from 'langium';
import * as ast from '../generated/ast-partial.js';
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

function kind(parameter: ast.Parameter | ast.ReturnParameter): ArgKind {
    if (ast.isReferenceType(parameter.type?.ref)) {
        if (ast.isParameter(parameter) && (parameter.direction === undefined || parameter.direction === 'in')) {
            return ArgKind.BY_REF;
        }
        return ArgKind.BY_PTR;
    }
    if ((ast.isNativeType(parameter.type?.ref) || ast.isValueType(parameter.type?.ref)) && ast.isParameter(parameter) && (parameter.direction === 'inout' || parameter.direction === 'out')) {
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
    attribute(element: ast.NamedElement | ast.ReturnParameter, id: Attributes): ast.Attribute | undefined {
        return this.cache.get({ key: id, node: element }, () =>
            element.attributes.find((attribute): attribute is ast.Attribute =>
                ast.isAttribute(attribute) && !!attribute.type?.ref && fqn(attribute.type.ref) === id
            )
        ) as ast.Attribute | undefined;
    }
    isAttributeTrue(attribute: ast.Attribute | undefined): boolean | undefined {
        if (!attribute) {
            return undefined;
        }
        if (attribute.value) {
            return Solver.getValue(attribute.value)?.boolValue()?.getValue();
        }
        if (ast.isAttributeType(attribute.type?.ref)) {
            return Solver.getValue(attribute.type.ref.default)?.boolValue()?.getValue();
        }
        return undefined;
    }

    attributeBoolValue(element: ast.NamedElement | ast.ReturnParameter, id: Attributes): boolean | undefined {
        return this.isAttributeTrue(this.attribute(element, id));
    }

    isConstructor(element: ast.NamedElement | ast.ReturnParameter): boolean {
        return this.cache.get({ key: 'isConstructor', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Constructor') ?? false
        ) as boolean;
    }
    operatorKind(op: ast.Operation): OperatorKind {
        return this.cache.get({ key: 'isConstructor', node: op }, () => {
            const attr = this.attribute(op, 'Attributes.Operator');
            if (!attr?.value || !ast.isAttributeType(attr.type?.ref) || !attr.type.ref.type?.ref) {
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
    isFailure(element: ast.Field): boolean {
        return this.cache.get({ key: 'isFailure', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Failure') ?? false
        ) as boolean;
    }
    isForcible(element: ast.Field): boolean {
        return this.cache.get({ key: 'isForcible', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Forcible') ?? false
        ) as boolean;
    }
    isStatic(element: ast.Operation | ast.Property | ast.Field | ast.Association): boolean {
        return this.cache.get({ key: 'isStatic', node: element }, () =>
            !this.isConstructor(element) && (this.attributeBoolValue(element, 'Attributes.Static') ?? false)
        ) as boolean;
    }
    isAbstract(element: ast.Operation | ast.Property): boolean {
        return this.cache.get({ key: 'isAbstract', node: element }, () =>
            !this.isStatic(element) && (ast.isInterface(element.$container) || (this.attributeBoolValue(element, 'Attributes.Abstract') ?? false))
        ) as boolean;
    }
    isVirtual(element: ast.Operation | ast.Property): boolean {
        return this.cache.get({ key: 'isVirtual', node: element }, () =>
            !this.isConstructor(element) && (this.isAbstract(element) || (this.attributeBoolValue(element, 'Attributes.Virtual') ?? (ast.isReferenceType(element.$container) && !this.isStatic(element))))
        ) as boolean;
    }

    isMutable(element: ast.Field | ast.Association): boolean {
        return this.cache.get({ key: 'isMutable', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.Mutable') ?? false
        ) as boolean;
    }
    isConst(element: ast.Parameter | ast.ReturnParameter | ast.Association | ast.Operation | ast.Property): boolean {
        return this.cache.get({ key: 'isConst', node: element }, () => {
            if (this.isConstructor(element)) {
                return false;
            }
            return this.attributeBoolValue(element, 'Attributes.Const') ?? (ast.isParameter(element) && (!element.direction || element.direction === 'in') && !ast.isValueType(element.type?.ref));
        }) as boolean;
    }
    isConstGetter(element: ast.Property): boolean {
        return this.cache.get({ key: 'isConstGetter', node: element }, () => this.attributeBoolValue(element, 'Attributes.ConstGetter') ?? false) as boolean;
    }

    isByPointer(element: ast.Parameter | ast.ReturnParameter | ast.Association | ast.Property): boolean {
        return this.cache.get({ key: 'isByPointer', node: element }, () => {
            const value = this.attributeBoolValue(element, 'Attributes.ByPointer');
            switch (element.$type) {
                case ast.Association: return value ?? ast.isReferenceType(element.type?.ref);
                case ast.Property: return value ?? (ast.isReferenceType(element.type?.ref) && !this.isByReference(element));
                case ast.Parameter:
                case ast.ReturnParameter:
                    return value ?? (kind(element) === ArgKind.BY_PTR && !(this.attributeBoolValue(element, 'Attributes.ByReference') ?? false));
            }
        }) as boolean;

    }
    isByReference(element: ast.Parameter | ast.ReturnParameter | ast.Property): boolean {
        return this.cache.get({ key: 'isByReference', node: element }, () => {
            const value = this.attributeBoolValue(element, 'Attributes.ByReference');
            switch (element.$type) {
                case ast.Property: return value ?? false;
                case ast.Parameter:
                case ast.ReturnParameter:
                    return value ?? (kind(element) === ArgKind.BY_REF && !(this.attributeBoolValue(element, 'Attributes.ByPointer') ?? false));
            }
        }) as boolean;
    }

    isSimpleArray(element: ast.ArrayType): boolean {
        return this.cache.get({ key: 'isSimpleArray', node: element }, () =>
            this.attributeBoolValue(element, 'Attributes.SimpleArray') ?? false
        ) as boolean;
    }
    getViewKind(node: ast.Property | ast.Field | ast.Operation | ast.EntryPoint): ViewKind | undefined {
        return this.cache.get({ key: 'getViewKind', node: node }, () =>
            this.computeViewKind(node)
        ) as ViewKind | undefined;
    }
    private computeViewKind(node: ast.NamedElement): ViewKind | undefined {
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
    getSignature(element: ast.NamedElement): string | undefined {
        if (ast.Operation === element.$type) {
            return `${element.name}(${(element as ast.Operation).parameter.map(p => this.getParameterSignature(p), this).join(', ')})`;
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
    getParameterSignature(p: ast.Parameter): string {
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
    getAllFields(element: ast.Structure): Stream<ast.Field> {
        // Return non static and public fields from element's base if any and current element
        const result = stream(element.elements).filter(ast.isField).filter(f => !this.isStatic(f) && getRealVisibility(f) === VisibilityKind.public);
        if (ast.isClass(element) && ast.isStructure(element.base)) {
            return this.getAllFields(element.base).concat(result);
        }
        return result;
    }

}
