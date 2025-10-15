
import "./xsmpcat-types"

interface Assembly {
    parameters: TemplateParameter[]
    configurations: ComponentConfiguration[]
    model: ModelInstance
}

interface TemplateParameter {
    name: string
}

interface StringParameter extends TemplateParameter {
    value?: string
}
interface Int32Parameter extends TemplateParameter {
    value?: number
}


interface TemplateArgument {
    parameter:@TemplateParameter
}

interface StringArgument extends TemplateArgument {
    value: string
}
interface Int32Argument extends TemplateArgument {
    value: number
}



interface ComponentConfiguration {
    name: string
    type: string
}

interface ModelInstance {
    name: Name
    implementation: @Component
    elements: (SubInstance|Link|Invocation)[]
}

interface AssemblyInstance {
    name: Name
    assembly: @Assembly
    arguments: TemplateArgument[]
    elements: (SubInstance|Link|Invocation)[]
}

interface Name {
    segments:Segment[]
}
interface Segment {
}

interface Path {
    segments: Name[]
}
interface StringSegment extends Segment {
    name:string
}
interface CrossReferenceSegment extends Segment {
    ref:@TemplateParameter
}

interface SubInstance {
    container: @Container
    instance: ModelInstance|AssemblyInstance
}

interface Link {
    source: Path
    target: Path
}
interface EventLink extends Link {
}
interface FieldLink extends Link {
}
interface InterfaceLink extends Link {
    reference:@Reference
    backReference?:@Reference
}

interface Invocation {}

interface OperationCall extends Invocation {
    operation: @Operation
    parameters: ParameterValue[]
}

interface ParameterValue {
    parameter: @Parameter
    value: SimpleValue
}

interface SimpleValue {}
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
interface Float32Value extends SimpleValue {
    value: number
}
interface Float64Value extends SimpleValue {
    value: number
}
interface Char8Value extends SimpleValue {
    value: number
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