import type { Metadata, NamedElement } from './elements.js';
import type { Xlink } from './xlink.js';

export type VisibilityKind = 'public' | 'private' | 'protected';

export type AccessKind = 'readWrite' | 'readOnly' | 'writeOnly';

export type ParameterDirectionKind = 'in' | 'out' | 'inout' | 'return';

export interface VisibilityElement extends NamedElement {
    '@Visibility'?: VisibilityKind;
}

export interface Type extends VisibilityElement {
    '@xsi:type': string;
    '@Uuid': string;
}

export interface LanguageType extends Type { }

export interface ValueType extends LanguageType { }

export interface ValueReference extends LanguageType {
    Type: Xlink
}

export interface PlatformMapping {
    '@Name': string;
    '@Type': string;
    '@Namespace'?: string;
    '@Location'?: string;
}

export interface NativeType extends LanguageType {
    Platform?: PlatformMapping[];
}

export interface SimpleType extends ValueType { }

export interface PrimitiveType extends SimpleType { }

export interface EnumerationLiteral extends NamedElement {
    '@Value': bigint;
}

export interface Enumeration extends SimpleType {
    Literal: EnumerationLiteral[];
}

export interface Integer extends SimpleType {
    PrimitiveType?: Xlink;
    '@Minimum'?: bigint;
    '@Maximum'?: bigint;
    '@Unit'?: string;
}

export interface Float extends SimpleType {
    PrimitiveType?: Xlink;
    '@Minimum'?: number;
    '@Maximum'?: number;
    '@MinInclusive'?: boolean;
    '@MaxInclusive'?: boolean;
    '@Unit'?: string;
}

export interface String extends SimpleType {
    '@Length': bigint;
}

export interface Array extends ValueType {
    ItemType: Xlink;
    '@Size': bigint;
}

export interface Structure extends ValueType {
    Constant?: Constant[];
    Field?: Field[];
}

export interface Exception extends Class { }

export interface Class extends Structure {
    Base?: Xlink;
    Property?: Property[];
    Operation?: Operation[];
    Association?: Association[];
    '@Abstract'?: boolean;
}

export interface Constant extends VisibilityElement {
    Type: Xlink;
    Value?: SimpleValue;
}

export interface Field extends VisibilityElement {
    Type: Xlink
    Default?: Value;
    '@State'?: boolean;
    '@Input'?: boolean;
    '@Output'?: boolean;
}

export interface Property extends VisibilityElement {
    Type: Xlink;
    AttachedField?: Xlink;
    GetRaises?: Xlink[];
    SetRaises?: Xlink[];
    '@Access'?: AccessKind;
    '@Category'?: string;
}

export interface Association extends VisibilityElement {
    Type: Xlink;
}

export interface Operation extends VisibilityElement {
    Parameter?: Parameter[];
    RaisedException?: Xlink[];
}

export interface Parameter extends NamedElement {
    Type: Xlink;
    Default?: Value;
    '@Direction'?: ParameterDirectionKind;
}

export interface Value {
    '@Field'?: string;
    '@xsi:type': string;
}

export interface SimpleValue extends Value { }

export interface SimpleArrayValue extends Value { }

export interface ArrayValue extends Value {
    ItemValue?: Value[];
}

export interface StructureValue extends Value {

    FieldValue?: Value[];
}

export interface BoolValue extends SimpleValue {
    '@Value': boolean;
}

export interface Char8Value extends SimpleValue {
    '@Value': string;
}

export interface DateTimeValue extends SimpleValue {
    '@Value': string;
}

export interface DurationValue extends SimpleValue {
    '@Value': string;
}

export interface EnumerationValue extends SimpleValue {
    '@Value': bigint;
    '@Literal'?: string;
}

export interface Float32Value extends SimpleValue {
    '@Value': number;
}

export interface Float64Value extends SimpleValue {
    '@Value': number;
}

export interface Int16Value extends SimpleValue {
    '@Value': bigint;
}

export interface Int32Value extends SimpleValue {
    '@Value': bigint;
}

export interface Int64Value extends SimpleValue {
    '@Value': bigint;
}

export interface Int8Value extends SimpleValue {
    '@Value': bigint;
}

export interface String8Value extends SimpleValue {
    '@Value': string;
}

export interface UInt16Value extends SimpleValue {
    '@Value': bigint;
}

export interface UInt32Value extends SimpleValue {
    '@Value': bigint;
}

export interface UInt64Value extends SimpleValue {
    '@Value': bigint;
}

export interface UInt8Value extends SimpleValue {
    '@Value': bigint;
}

export interface BoolArrayValue extends SimpleArrayValue {
    ItemValue?: BoolValue[];
}

export interface Char8ArrayValue extends SimpleArrayValue {
    ItemValue?: Char8Value[];
}

export interface DateTimeArrayValue extends SimpleArrayValue {
    ItemValue?: DateTimeValue[];
}

export interface DurationArrayValue extends SimpleArrayValue {
    ItemValue?: DurationValue[];
}

export interface EnumerationArrayValue extends SimpleArrayValue {
    ItemValue?: EnumerationValue[];
}

export interface Float32ArrayValue extends SimpleArrayValue {
    ItemValue?: Float32Value[];
}

export interface Float64ArrayValue extends SimpleArrayValue {
    ItemValue?: Float64Value[];
}

export interface Int16ArrayValue extends SimpleArrayValue {
    ItemValue?: Int16Value[];
}

export interface Int32ArrayValue extends SimpleArrayValue {
    ItemValue?: Int32Value[];
}

export interface Int64ArrayValue extends SimpleArrayValue {
    ItemValue?: Int64Value[];
}

export interface Int8ArrayValue extends SimpleArrayValue {
    ItemValue?: Int8Value[];
}

export interface String8ArrayValue extends SimpleArrayValue {
    ItemValue?: String8Value[];
}

export interface UInt16ArrayValue extends SimpleArrayValue {
    ItemValue?: UInt16Value[];
}

export interface UInt32ArrayValue extends SimpleArrayValue {
    ItemValue?: UInt32Value[];
}

export interface UInt64ArrayValue extends SimpleArrayValue {
    ItemValue?: UInt64Value[];
}

export interface UInt8ArrayValue extends SimpleArrayValue {
    ItemValue?: UInt8Value[];
}

export interface AttributeType extends Type {
    Type: Xlink;
    Default?: Value;
    Usage?: string[];
    '@AllowMultiple'?: boolean;
}

export interface Attribute extends Metadata {
    Type: Xlink;
    Value: Value;
}

