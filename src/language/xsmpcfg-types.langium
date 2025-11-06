
//import "./xsmpcat-types"
//import "./xsmpsed-types"

interface Configuration {
    name: string
    elements: (ConfigurationUsage|ComponentConfiguration)[]
}



interface ComponentConfiguration {
    name: string
    elements: (ConfigurationUsage|ComponentConfiguration|Value)[]
}

interface ConfigurationUsage {
    path?: string
    configuration: @Configuration
}




interface Value {
}

interface FieldValue extends Value {
    field?: string
    value:Value
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
    value: number
}
interface Int16Value extends SimpleValue {
    value: number
}
interface Int32Value extends SimpleValue {
    value: number
}
interface Int64Value extends SimpleValue {
    value: number
}
interface UInt8Value extends SimpleValue {
    value: number
}
interface UInt16Value extends SimpleValue {
    value: number
}
interface UInt32Value extends SimpleValue {
    value: number
}
interface UInt64Value extends SimpleValue {
    value: number
}
interface EnumerationValue extends SimpleValue {
    value: number
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