import * as ast from '../generated/ast-partial.js';
import { AstUtils, diagnosticData, type ValidationAcceptor } from 'langium';
import * as Duration from './duration.js';
import { escape, fqn, getPTK, isConstantVisibleFrom } from './xsmp-utils.js';
import { type FloatingPTK, type IntegralPTK, isFloatingType, isIntegralType, PTK } from './primitive-type-kind.js';

import { Location } from 'vscode-languageserver';
import * as IssueCodes from '../validation//xsmpcat-issue-codes.js';

abstract class Value<T> {

    abstract getValue(): boolean | bigint | number | string | ast.EnumerationLiteral

    abstract primitiveTypeKind(): PTK

    //Convertion functions
    boolValue(): BoolValue | undefined { return undefined; }
    enumerationLiteral(): EnumerationLiteralValue | undefined { return undefined; }
    integralValue(_type: IntegralPTK): IntegralValue | undefined { return undefined; }
    floatValue(_type: FloatingPTK): FloatValue | undefined { return undefined; }
    stringValue(): StringValue | undefined { return undefined; }
    charValue(): CharValue | undefined { return undefined; }

    // Unary operations
    not(): BoolValue | undefined { return undefined; }
    unaryComplement(): Value<T> | undefined { return undefined; }
    plus<U>(): Value<U> | undefined { return undefined; }
    negate<U>(): Value<U> | undefined { return undefined; }

    // Binary operations
    logicalOr(val: Value<T>): BoolValue | undefined {
        const left = this.boolValue()?.getValue(),
            right = val.boolValue()?.getValue();
        if (left !== undefined && right !== undefined) { return new BoolValue(left || right); }
        return undefined;
    }
    logicalAnd(val: Value<T>): BoolValue | undefined {
        const left = this.boolValue(),
            right = val.boolValue();
        if (left !== undefined && right !== undefined) { return new BoolValue(left.value && right.value); }
        return undefined;
    }
    or<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    and<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    xor<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    add<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    subtract<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    divide<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    multiply<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    remainder<U>(_val: Value<T>): Value<U> | undefined { return undefined; }
    shiftLeft<U>(_n: Value<T>): Value<U> | undefined { return undefined; }
    shiftRight<U>(_n: Value<T>): Value<U> | undefined { return undefined; }

    equal(_val: Value<T>): BoolValue | undefined { return undefined; }
    notEqual(_val: Value<T>): BoolValue | undefined { return undefined; }
    lessEqual(_val: Value<T>): BoolValue | undefined { return undefined; }
    greaterEqual(_val: Value<T>): BoolValue | undefined { return undefined; }
    less(_val: Value<T>): BoolValue | undefined { return undefined; }
    greater(_val: Value<T>): BoolValue | undefined { return undefined; }

}

export class BoolValue extends Value<BoolValue> {
    readonly value: boolean;
    constructor(value: boolean) {
        super();
        this.value = value;
    }
    override toString(): string { return this.value.toString(); }
    override not(): BoolValue { return new BoolValue(!this.value); }
    override getValue(): boolean { return this.value; }
    override primitiveTypeKind(): PTK { return PTK.Bool; }
    override boolValue(): this { return this; }
    override integralValue(type: IntegralPTK): IntegralValue { return new IntegralValue(BigInt(this.value), type); }
    override floatValue(type: FloatingPTK): FloatValue { return new FloatValue(Number(this.value), type); }
}
export class StringValue extends Value<StringValue> {
    readonly value: string;
    constructor(value: string) {
        super();
        this.value = value;
    }
    override toString(): string { return `"${escape(this.value.toString())}"`; }
    override getValue(): string { return this.value; }
    override primitiveTypeKind(): PTK { return PTK.String8; }
    override stringValue(): this | undefined { return this; }

    override integralValue(type: IntegralPTK): IntegralValue | undefined {
        if (type === PTK.DateTime) {
            const fractionalRegex = /[.,]\d+/;
            // ignore the fractional part when parsing with Date because Date can only handle ms
            const instant = Date.parse(this.value.replace(fractionalRegex, ''));
            if (isNaN(instant)) {
                return undefined;
            }
            let ns = BigInt(instant) * BigInt(1_000_000);
            //extract manually the fractional part and convert it to ns
            const match = fractionalRegex.exec(this.value);
            if (match) {
                //skip the starting '.', pad end with 0 up to 9 characters and limit to 9 characters in case of the initial input was longer
                ns += BigInt(match[0].slice(1).padEnd(9, '0').slice(0, 9));
            }
            return new IntegralValue(ns, type);
        }
        else if (type === PTK.Duration) {
            try {
                return new IntegralValue(Duration.parse(this.value), type);
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }

}
export class CharValue extends Value<CharValue> {
    readonly value: string;
    constructor(value: string) {
        super();
        this.value = value;
    }
    override toString(): string { return `'${escape(this.value.toString())}'`; }
    override getValue(): string { return this.value; }
    override primitiveTypeKind(): PTK { return PTK.Char8; }
    override charValue(): this | undefined { return this; }
}

export class EnumerationLiteralValue extends Value<EnumerationLiteralValue> {
    readonly value: ast.EnumerationLiteral;
    constructor(value: ast.EnumerationLiteral) {
        super();
        this.value = value;
    }
    override toString(): string { return this.value.name??''; }
    override getValue(): ast.EnumerationLiteral { return this.value; }
    override enumerationLiteral(): this { return this; }
    override primitiveTypeKind(): PTK { return PTK.Enum; }

}
const INT64_MAX = BigInt('0x7FFFFFFFFFFFFFFF');
const UINT32_MAX = BigInt(0xFFFF_FFFF);
const INT32_MAX = BigInt(0x7FFF_FFFF);
export class IntegralValue extends Value<IntegralValue> {
    readonly value: bigint;
    readonly type: IntegralPTK;

    public static of(expr: ast.IntegerLiteral, accept?: ValidationAcceptor): IntegralValue | undefined {
        let text = expr.text?.replaceAll("'", '') ?? '';
        let isUnsigned = false;
        let isLong = false;

        if (text.endsWith('u') || text.endsWith('U')) {
            isUnsigned = true;
            text = text.slice(0, -1);
        }
        if (text.endsWith('l') || text.endsWith('L')) {
            isLong = true;
            text = text.slice(0, -1);
        }
        if (text.endsWith('u') || text.endsWith('U')) {
            isUnsigned = true;
            text = text.slice(0, -1);
        }
        const value = BigInt(text);

        let type: IntegralPTK;
        if (value > INT64_MAX) {
            type = PTK.UInt64;
        }
        else if (value > UINT32_MAX) {
            type = isUnsigned ? PTK.UInt64 : PTK.Int64;
        }
        else if (value > INT32_MAX) {
            type = isUnsigned ? (isLong ? PTK.UInt64 : PTK.UInt32) : (isLong ? PTK.Int64 : PTK.UInt32);
        }
        else {
            type = isUnsigned ? (isLong ? PTK.UInt64 : PTK.UInt32) : (isLong ? PTK.Int64 : PTK.Int32);
        }

        const result = new IntegralValue(value, type);
        if (result.value !== value) {
            if (accept) {
                accept('error', `Conversion overflow for type ${PTK[type]}.`, { node: expr });
            }
            return undefined;
        }
        return result;
    }

    constructor(value: bigint, type: IntegralPTK) {
        super();
        switch (type) {
            case PTK.Int8: this.value = BigInt.asIntN(8, value); break;
            case PTK.Int16: this.value = BigInt.asIntN(16, value); break;
            case PTK.Int32: this.value = BigInt.asIntN(32, value); break;
            case PTK.Duration:
            case PTK.DateTime:
            case PTK.Int64: this.value = BigInt.asIntN(64, value); break;
            case PTK.UInt8: this.value = BigInt.asUintN(8, value); break;
            case PTK.UInt16: this.value = BigInt.asUintN(16, value); break;
            case PTK.UInt32: this.value = BigInt.asUintN(32, value); break;
            case PTK.UInt64: this.value = BigInt.asUintN(64, value); break;
        }

        this.type = type;

    }
    override toString(): string { return this.value.toString(); }
    override getValue(): bigint { return this.value; }
    override primitiveTypeKind(): IntegralPTK { return this.type; }
    override boolValue(): BoolValue { return new BoolValue(this.value !== BigInt(0)); }
    override integralValue(type: IntegralPTK): IntegralValue | undefined {
        if (this.type === type) {
            return this;
        }
        const result = new IntegralValue(this.value, type);
        if (result.value !== this.value) {
            return undefined;
        }
        return result;
    }
    override floatValue(type: FloatingPTK): FloatValue { return new FloatValue(Number(this.value), type); }
    override charValue(): CharValue | undefined { return new CharValue(String.fromCharCode(Number(this.value))); }

    override unaryComplement(): IntegralValue { return new IntegralValue(~this.value, this.type); }
    override plus(): this { return this; }
    override negate(): IntegralValue { return new IntegralValue(-this.value, this.type); }
    promote(type: IntegralPTK): IntegralPTK {

        switch (this.type) { // Promote correctly Int8
            case PTK.Int8:
            case PTK.Int16:
            case PTK.UInt8:
            case PTK.UInt16:
                return type === PTK.Int8 || type === PTK.Int16 || type === PTK.UInt8 || type === PTK.UInt16 ? PTK.Int32 : type;
            case PTK.Int32:
                return type;
            case PTK.UInt32:
                return type === PTK.Int32 ? this.type : type;
            case PTK.Duration:
            case PTK.DateTime:
            case PTK.Int64:
                return type === PTK.UInt64 ? type : this.type;
            case PTK.UInt64:
                return PTK.UInt64;
        }
    }
    override or(val: IntegralValue): IntegralValue { return new IntegralValue(this.value | val.value, this.promote(val.type)); }
    override and(val: IntegralValue): IntegralValue { return new IntegralValue(this.value & val.value, this.promote(val.type)); }
    override xor(val: IntegralValue): IntegralValue { return new IntegralValue(this.value ^ val.value, this.promote(val.type)); }
    override add(val: IntegralValue): IntegralValue { return new IntegralValue(this.value + val.value, this.promote(val.type)); }
    override subtract(val: IntegralValue): IntegralValue { return new IntegralValue(this.value - val.value, this.promote(val.type)); }
    override divide(val: IntegralValue): IntegralValue { return new IntegralValue(this.value / val.value, this.promote(val.type)); }
    override multiply(val: IntegralValue): IntegralValue { return new IntegralValue(this.value * val.value, this.promote(val.type)); }
    override remainder(val: IntegralValue): IntegralValue { return new IntegralValue(this.value % val.value, this.promote(val.type)); }
    override shiftLeft(n: IntegralValue): IntegralValue { return new IntegralValue(this.value << n.value, this.type); }
    override shiftRight(n: IntegralValue): IntegralValue { return new IntegralValue(this.value >> n.value, this.type); }
}

export class FloatValue extends Value<FloatValue> {
    readonly value: number;
    readonly type: FloatingPTK;
    constructor(value: number, type: FloatingPTK) {
        super();
        switch (type) {
            case PTK.Float32: this.value = Math.fround(value); break;
            case PTK.Float64: this.value = value; break;
        }
        this.type = type;
    }
    public static of(expr: ast.FloatingLiteral, _accept?: ValidationAcceptor): FloatValue {
        const text = expr.text?.replaceAll("'", '') ?? '';
        if (text.endsWith('f') || text.endsWith('F')) {
            return new FloatValue(parseFloat(text.slice(0, -1)), PTK.Float32);
        }
        return new FloatValue(parseFloat(text), PTK.Float64);
    }
    override toString(): string { return this.value.toString(); }

    override getValue(): number { return this.value; }
    override primitiveTypeKind(): FloatingPTK { return this.type; }
    override boolValue(): BoolValue { return new BoolValue(this.value !== 0.); }
    override integralValue(type: IntegralPTK): IntegralValue | undefined {
        try {
            return new IntegralValue(BigInt(this.value), type);
        } catch {
            return undefined;
        }
    }
    override floatValue(type: FloatingPTK): FloatValue {
        if (this.type === type) {
            return this;
        }

        return new FloatValue(this.value, type);
    }
    override plus(): this { return this; }
    override negate(): FloatValue { return new FloatValue(-this.value, this.type); }
    override add(val: FloatValue): FloatValue { return new FloatValue(this.value + val.value, val.type === PTK.Float64 || this.type === PTK.Float64 ? PTK.Float64 : PTK.Float32); }
    override subtract(val: FloatValue): FloatValue { return new FloatValue(this.value - val.value, val.type === PTK.Float64 || this.type === PTK.Float64 ? PTK.Float64 : PTK.Float32); }
    override divide(val: FloatValue): FloatValue { return new FloatValue(this.value / val.value, val.type === PTK.Float64 || this.type === PTK.Float64 ? PTK.Float64 : PTK.Float32); }
    override multiply(val: FloatValue): FloatValue { return new FloatValue(this.value * val.value, val.type === PTK.Float64 || this.type === PTK.Float64 ? PTK.Float64 : PTK.Float32); }
}
type BuiltInConstants = 'PI' | 'E';
const builtInConstants: string[] = [
    'PI', 'E'
];
type BuiltInFloat64Functions =
    'cos' | 'sin' | 'tan' | 'acos' | 'asin' | 'atan' | 'cosh' | 'sinh' | 'tanh' | 'exp' | 'log' | 'log10' | 'expm1' | 'log1p' | 'sqrt' | 'ceil' | 'floor' | 'abs';

const builtInFloat64Functions: string[] = [
    'cos', 'sin', 'tan', 'acos', 'asin', 'atan', 'cosh', 'sinh', 'tanh',
    'exp', 'log', 'log10', 'expm1', 'log1p', 'sqrt', 'ceil', 'floor', 'abs'
];

const builtInFloat32Functions: string[] = [
    'cosf', 'sinf', 'tanf', 'acosf', 'asinf', 'atanf', 'coshf', 'sinhf', 'tanhf',
    'expf', 'logf', 'log10f', 'expm1f', 'log1pf', 'sqrtf', 'ceilf', 'floorf', 'absf'];

function convertBuiltinFunction<T>(func: ast.BuiltInFunction, accept?: ValidationAcceptor): Value<T> | undefined {
    if (func.name?.endsWith('f')) {
        if (!builtInFloat32Functions.includes(func.name)) {
            if (accept)
                accept('error', `Unknown built-in function '${func.name}'.`, { node: func, property: 'name' });
            return undefined;
        }
        const value = getValueAs(func.argument, PTK.Float32, accept)?.floatValue(PTK.Float32);
        return value ? new FloatValue(Math[func.name.substring(0, -1) as BuiltInFloat64Functions](value.getValue()), PTK.Float32) : undefined;
    }
    if (func.name && !builtInFloat64Functions.includes(func.name)) {
        if (accept)
            accept('error', `Unknown built-in function '${func.name}'.`, { node: func, property: 'name' });
        return undefined;
    }
    const value = getValueAs(func.argument, PTK.Float64, accept)?.floatValue(PTK.Float64);
    return value ? new FloatValue(Math[func.name as BuiltInFloat64Functions](value.getValue()), PTK.Float64) : undefined;

}
export function getValue<T>(expression: ast.Expression | undefined, accept?: ValidationAcceptor): Value<T> | undefined {
    if (expression) {
        switch (expression.$type) {
            case ast.IntegerLiteral: return IntegralValue.of(expression as ast.IntegerLiteral, accept);
            case ast.FloatingLiteral: return FloatValue.of(expression as ast.FloatingLiteral, accept);
            case ast.BooleanLiteral: return new BoolValue((expression as ast.BooleanLiteral).isTrue);
            case ast.StringLiteral: return new StringValue((expression as ast.StringLiteral).value.join(''));
            case ast.CharacterLiteral: return new CharValue((expression as ast.CharacterLiteral).value ?? '');
            case ast.UnaryOperation: return unaryOperation(expression as ast.UnaryOperation, accept);
            case ast.BinaryOperation: return binaryOperation(expression as ast.BinaryOperation, accept);
            case ast.ParenthesizedExpression: return getValue((expression as ast.ParenthesizedExpression).expr, accept);
            case ast.BuiltInConstant: {
                const cst = expression as ast.BuiltInConstant;
                if (cst.name && !builtInConstants.includes(cst.name)) {
                    if (accept)
                        accept('error', `Unknown built-in constant '${cst.name}'.`, { node: cst, property: 'name' });
                    return undefined;
                }
                return new FloatValue(Math[cst.name as BuiltInConstants], PTK.Float64);
            }
            case ast.BuiltInFunction:
                if (!(expression as ast.BuiltInFunction).argument && accept) {
                    accept('error', 'Missing argument.', { node: expression, property: 'argument' });
                }
                return convertBuiltinFunction(expression as ast.BuiltInFunction, accept);
            case ast.NamedElementReference:
                {
                    const ref = expression as ast.NamedElementReference;
                    if (ast.isEnumerationLiteral(ref.value?.ref)) {
                        return new EnumerationLiteralValue(ref.value.ref);
                    }
                    else if (ast.isConstant(ref.value?.ref)) {
                        const cst = ref.value.ref;
                        if (accept && !isConstantVisibleFrom(expression, cst)) {
                            accept('error', 'The Constant is not visible.', { node: expression });
                        }
                        if (cst.type?.ref) {
                            //do not forward accept
                            return getValueAs(cst.value, cst.type.ref);
                        }
                    }
                    else if (accept) {
                        accept('error', 'Invalid element.', { node: expression });
                        return undefined;
                    }
                }
        }
    }
    return undefined;
}
function getTypeName(type: ast.Type | PTK): string {
    if (ast.isType(type)) { return fqn(type); }
    return PTK[type];
}

function doGetValueAs<T>(expression: ast.Expression, value: Value<T>, type: ast.Type | PTK, accept?: ValidationAcceptor): Value<T> | undefined {
    const kind = ast.isType(type) ? getPTK(type) : type;
    if (isIntegralType(kind)) {
        const integralValue = value.integralValue(kind);
        if (integralValue && accept && ast.isInteger(type)) {
            const min = getValue(type.minimum)?.integralValue(kind)?.getValue();
            if (min !== undefined && integralValue.getValue() < min) {
                accept('error', `Integral value shall be greater than or equal to ${min}.`, {
                    node: expression,
                    relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.minimum!.$cstNode!.range), message: min.toString() }],
                });
            }

            const max = getValue(type.maximum)?.integralValue(kind)?.getValue();
            if (max !== undefined && integralValue.getValue() > max) {
                accept('error', `Integral value shall be less than or equal to ${max}.`, {
                    node: expression,
                    relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.maximum!.$cstNode!.range), message: max.toString() }],
                });
            }
        }
        return integralValue;
    }
    else if (isFloatingType(kind)) {
        const floatValue = value.floatValue(kind);
        if (floatValue && accept && ast.isFloat(type)) {
            const min = getValue(type.minimum)?.floatValue(kind)?.getValue();
            if (min !== undefined) {
                if (floatValue.getValue() < min || floatValue.getValue() === min && (type.range === '<..' || type.range === '<.<')) {
                    if (type.range === '<..' || type.range === '<.<') {
                        accept('error', `Float value shall be greater than ${min}.`, {
                            node: expression,
                            relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.minimum!.$cstNode!.range), message: min.toString() }],
                        });
                    }
                    else {
                        accept('error', `Float value shall be greater than or equal to ${min}.`, {
                            node: expression,
                            relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.minimum!.$cstNode!.range), message: min.toString() }],
                        });
                    }
                }
            }

            const max = getValue(type.maximum)?.floatValue(kind)?.getValue();
            if (max !== undefined) {
                if (floatValue.getValue() > max || floatValue.getValue() === max && (type.range === '<..' || type.range === '<.<')) {
                    if (type.range === '..<' || type.range === '<.<') {
                        accept('error', `Float value shall be less than ${max}.`, {
                            node: expression,
                            relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.maximum!.$cstNode!.range), message: max.toString() }],
                        });
                    }
                    else {
                        accept('error', `Float value shall be less than or equal to ${max}.`, {
                            node: expression,
                            relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.maximum!.$cstNode!.range), message: max.toString() }],
                        });
                    }
                }
            }
        }

        return floatValue;
    }
    else if (ast.isEnumeration(type)) {
        if (value instanceof EnumerationLiteralValue) {
            if (accept && value.getValue().$container !== type) {
                accept('error', `Enumeration literal ${value.getValue().name} is not of type ${type.name}.`, { node: expression });
            }
            return value;
        }
        else if (value instanceof IntegralValue) {
            const literal = type.literal.find(l => getValueAs(l.value, PTK.Int32)?.getValue() === value.getValue());
            if (literal) {
                if (accept) {
                    accept('warning', 'An enumeration literal is expected.', {
                        node: expression,
                        relatedInformation: [{ location: Location.create(AstUtils.getDocument(literal).uri.toString(), literal.$cstNode!.range), message: fqn(literal) }],
                        data: diagnosticData(IssueCodes.EnumLiteralExpected)
                    });
                }
                return new EnumerationLiteralValue(literal);
            }
        }
    }
    else if (kind === PTK.Bool) { return value.boolValue(); }
    else if (kind === PTK.String8) {
        const stringValue = value.stringValue();
        if (stringValue && accept && ast.isStringType(type)) {
            const length = getValue(type.length)?.integralValue(PTK.Int64)?.getValue();
            if (length !== undefined && stringValue.getValue().length > length) {
                accept('error', 'The string length exceeds the allowed length for its type.', {
                    node: expression,
                    relatedInformation: [{ location: Location.create(AstUtils.getDocument(type).uri.toString(), type.$cstNode!.range), message: length.toString() }],
                });
            }
        }
        return stringValue;
    }
    else if (kind === PTK.Char8) {
        const charValue = value.charValue();
        if (charValue && accept) {
            if (charValue.getValue().length !== 1) {
                accept('error', 'A \'Char8\' shall contain exactly one character.', { node: expression });
            }
        }
        return charValue;
    }

    return undefined;
}

export function getValueAs<T>(expression: ast.Expression | undefined, type: ast.Type | PTK, accept?: ValidationAcceptor): Value<T> | undefined {
    if (!expression) {
        return;
    }
    const value = getValue(expression, accept);
    if (value === undefined) {
        return undefined;
    }

    const result = doGetValueAs(expression, value, type, accept);
    if (!result && accept) {
        accept('error', `${getTypeName(value.primitiveTypeKind())} cannot be converted to ${getTypeName(type)}.`, { node: expression });
    }

    return result;
}

function binaryOperationFunction<T, U>(left: Value<T>, right: Value<T>, feature: ast.OpBinary): Value<U> | undefined {

    switch (feature) {
        case '||': return left.logicalOr(right);
        case '&&': return left.logicalAnd(right);
        case '|': return left.or(right);
        case '&': return left.and(right);
        case '^': return left.xor(right);
        case '==': return left.equal(right);
        case '!=': return left.notEqual(right);
        case '<=': return left.lessEqual(right);
        case '>=': return left.greaterEqual(right);
        case '<': return left.less(right);
        case '>': return left.greater(right);
        case '+': return left.add(right);
        case '-': return left.subtract(right);
        case '/': return left.divide(right);
        case '*': return left.multiply(right);
        case '%': return left.remainder(right);
        case '<<': return left.shiftLeft(right);
        case '>>': return left.shiftRight(right);
    }

}

function binaryOperation<T>(expression: ast.BinaryOperation, accept?: ValidationAcceptor): Value<T> | undefined {

    const left = getValue(expression.leftOperand, accept),
        right = getValue(expression.rightOperand, accept);
    if (!left || !right || !expression.feature) {
        return undefined;
    }

    let result: Value<T> | undefined;
    try {
        if (left instanceof BoolValue) {
            if (right instanceof BoolValue) {
                result = binaryOperationFunction(left, right, expression.feature);
            }
            else if (right instanceof IntegralValue) {
                result = binaryOperationFunction(left.integralValue(right.primitiveTypeKind()), right, expression.feature);
            }
            else if (right instanceof FloatValue) {
                result = binaryOperationFunction(left.floatValue(right.primitiveTypeKind()), right, expression.feature);
            }
        }
        else if (left instanceof IntegralValue) {
            if (right instanceof BoolValue) {
                result = binaryOperationFunction(left, right.integralValue(left.primitiveTypeKind()), expression.feature);
            }
            else if (right instanceof IntegralValue) {
                result = binaryOperationFunction(left, right, expression.feature);
            }
            else if (right instanceof FloatValue) {
                result = binaryOperationFunction(left.floatValue(right.primitiveTypeKind()), right, expression.feature);
            }
        }
        else if (left instanceof FloatValue) {
            if (right instanceof BoolValue) {
                result = binaryOperationFunction(left, right.floatValue(left.primitiveTypeKind()), expression.feature);
            }
            else if (right instanceof IntegralValue) {
                result = binaryOperationFunction(left, right.floatValue(left.primitiveTypeKind()), expression.feature);
            }
            else if (right instanceof FloatValue) {
                result = binaryOperationFunction(left, right, expression.feature);
            }
        }
        if (accept && result === undefined) {
            accept('error', `Binary operator '${expression.feature}' is not supported for operands of type '${PTK[left.primitiveTypeKind()]}' and '${PTK[right.primitiveTypeKind()]}'.`,
                { node: expression });
        }
    }
    catch (error) {
        if (accept) {
            accept('error', `${error}`, { node: expression });
        }
    }

    return result;
}

function unaryOperationFunction<T, U>(operand: Value<T>, feature: ast.OpUnary): Value<U> | undefined {

    switch (feature) {
        case '+': return operand.plus();
        case '-': return operand.negate();
        case '~': return operand.unaryComplement();
        case '!': return operand.not();
    }
}
function unaryOperation<T>(expression: ast.UnaryOperation, accept?: ValidationAcceptor): Value<T> | undefined {
    const operand = getValue(expression.operand, accept);
    if (!operand || !expression.feature) {
        return undefined;
    }

    const result = unaryOperationFunction(operand, expression.feature);

    if (accept && result === undefined) {
        accept('error', `Unary operator '${expression.feature}' is not supported for operand of type '${PTK[operand.primitiveTypeKind()]}'.`, { node: expression });
    }
    return result;
}
