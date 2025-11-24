
//import "./xsmpcat-types"
//import "./xsmpsed-types"
import "./xsmp-elements"



interface Value {
}

interface FieldValue extends Value {
    value:Value
    field?: string
}
interface SimpleValue extends Value {
}

interface ArrayValue extends Value {
    elements:Value[]
}
interface StructureValue extends Value {
    elements:Value[]
}
interface Int8Value extends SimpleValue {
    value: bigint
}
interface Int16Value extends SimpleValue {
    value: bigint
}
interface Int32Value extends SimpleValue {
    value: bigint
}
interface Int64Value extends SimpleValue {
    value: bigint
}
interface UInt8Value extends SimpleValue {
    value: bigint
}
interface UInt16Value extends SimpleValue {
    value: bigint
}
interface UInt32Value extends SimpleValue {
    value: bigint
}
interface UInt64Value extends SimpleValue {
    value: bigint
}
interface EnumerationValue extends SimpleValue {
    value: bigint
}
interface Float32Value extends SimpleValue {
    value: string
}
interface Float64Value extends SimpleValue {
    value: string
}
interface Char8Value extends SimpleValue {
    value: string
}
interface String8Value extends SimpleValue {
    value: string
}
interface BoolValue extends SimpleValue {
    value: boolean
}
interface DateTimeValue extends SimpleValue {
    value: string
}
interface DurationValue extends SimpleValue {
    value: string
}