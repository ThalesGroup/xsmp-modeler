
//import "./xsmpcat-types"
//import "./xsmpsed-types"
interface NamedElement {
    name: string
    attributes: Metadata[]
}

interface Document extends NamedElement {
}


interface Metadata {
}


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
    value?: bigint
    reference?:@EnumerationLiteral
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


type RangeKind = RangeKind_Exclusive | RangeKind_MinInclusive | RangeKind_MaxInclusive | RangeKind_Inclusive;
type RangeKind_Exclusive = '<.<';
type RangeKind_MinInclusive = '..<';
type RangeKind_MaxInclusive = '<..';
type RangeKind_Inclusive = '...';

type ParameterDirectionKind = ParameterDirectionKind_in | ParameterDirectionKind_out | ParameterDirectionKind_inout;
type ParameterDirectionKind_in = 'in';
type ParameterDirectionKind_out = 'out';
type ParameterDirectionKind_inout = 'inout';

type WithBody = Structure | ReferenceType | Namespace;
type Invokable = Operation | Property;
type Publicable = Invokable | Field;


interface Catalogue extends Document {
    elements:Namespace[]
}



interface Attribute extends Metadata {
    ^type: @Type
    value?: Expression
}

interface Type extends VisibilityElement {
}

interface VisibilityElement extends NamedElement {
    modifiers: string[]
}


interface Namespace extends NamedElement {
    elements:(Namespace|Type)[]
}

interface Structure extends ValueType {
    elements:(Constant|Field|Property|Operation|Association)[]
}

interface ValueType extends LanguageType {
}

interface LanguageType extends Type {
}

interface Class extends Structure {
    base?: @Type
}


interface Exception extends Class {
}

type ReferenceType = Component | Interface;

interface Interface extends LanguageType {
    base: @Type[]
    elements:(Constant|Property|Operation)[]
}

interface Model extends Component {
}

interface Component extends LanguageType {
    ^interface: @Type[]
    base?: @Type
    elements:(Constant|Field|Property|Operation|Association|Container|Reference|EntryPoint|EventSink|EventSource)[]
}

interface Service extends Component {
}

interface ArrayType extends ValueType {
    itemType: @Type
    size: Expression
}

interface ValueReference extends LanguageType {
    ^type: @Type
}

interface Integer extends SimpleType {
    primitiveType?: @Type
    minimum?: Expression
    maximum?: Expression
}

interface SimpleType extends ValueType {
}

interface Float extends SimpleType {
    primitiveType?: @Type
    minimum?: Expression
    maximum?: Expression
    range?: RangeKind
}

interface EventType extends Type {
    eventArgs?: @Type
}

interface StringType extends SimpleType {
    length: Expression
}

interface PrimitiveType extends SimpleType {
}

interface NativeType extends LanguageType {
}

interface AttributeType extends Type {
    ^type: @Type
    default?: Expression
}

interface Enumeration extends SimpleType {
    literal: EnumerationLiteral[]
}

interface EnumerationLiteral extends NamedElement {
    value: Expression
}

interface Field extends VisibilityElement, Resolvable {
    ^type: @Type
    default?: Expression
}

interface Resolvable extends NamedElement {
}

interface Constant extends VisibilityElement {
    ^type: @Type
    value: Expression
}

interface Property extends VisibilityElement, Resolvable {
    ^type: @Type
    attachedField?: @Field
    getRaises: @Type[]
    setRaises: @Type[]
}

interface Operation extends VisibilityElement, Resolvable {
    returnParameter?: ReturnParameter
    parameter: Parameter[]
    raisedException: @Type[]
}

interface ReturnParameter {
    name?: string
    attributes: Attribute[]
    ^type: @Type
}

interface Parameter extends NamedElement {
    ^type: @Type
    default?: Expression
    direction?: ParameterDirectionKind
}

interface Association extends VisibilityElement {
    ^type: @Type
    //default?: Expression
}

interface Container extends NamedElementWithMultiplicity, Resolvable {
    ^type: @Type
    defaultComponent?: @Type
}

interface NamedElementWithMultiplicity extends NamedElement {
    multiplicity?: Multiplicity
    optional?: boolean
}

interface Multiplicity {
    lower?: Expression
    upper?: Expression
    aux?: boolean
}

interface Reference extends NamedElementWithMultiplicity, Resolvable {
    ^interface: @Type
}

interface EntryPoint extends NamedElement, Resolvable {
    input: @Field[]
    output: @Field[]
}

interface EventSink extends NamedElement, Resolvable {
    ^type: @Type
}

interface EventSource extends NamedElement, Resolvable {
    ^type: @Type
}


interface Expression {
}
interface BinaryOperation extends Expression {
    leftOperand: Expression
    rightOperand: Expression
    feature: OpBinary
}

type OpBinary = OpOr | OpAnd | OpBitwiseOr | OpBitwiseXor | OpBitwiseAnd | OpEquality | OpCompare | OpBitwise | OpAdd | OpMulti;
type OpOr = '||';
type OpAnd = '&&';
type OpBitwiseOr = '|';
type OpBitwiseAnd = '&';
type OpBitwiseXor = "^"
type OpEquality = '==' | '!=';
type OpCompare = '>=' | '<=' | '>' | '<';
type OpBitwise = '<<' | '>>';
type OpAdd = '+' | '-';
type OpMulti = '*' | '/' | '%';

interface UnaryOperation extends Expression {
    operand: Expression
    feature: OpUnary
}

type OpUnary = "!" | "-" | "+" | "~";


type ConstantOrEnumerationLiteral = Constant|EnumerationLiteral
interface NamedElementReference extends Expression {
    value: @ConstantOrEnumerationLiteral
}

interface ParenthesizedExpression extends Expression {
    expr?: Expression
}

interface DesignatedInitializer extends Expression {
    field: @Field
    expr: Expression
}

interface CollectionLiteral extends Expression {
    elements: Expression[]
}

interface IntegerLiteral extends Expression {
    text: string
}

interface FloatingLiteral extends Expression {
    text: string
}

interface StringLiteral extends Expression {
    value: string[]
}

interface CharacterLiteral extends Expression {
    value: string
}

interface BuiltInConstant extends Expression {
    name: string
}


interface BuiltInFunction extends Expression {
    name: string
    argument?: Expression
}

interface BooleanLiteral extends Expression {
    isTrue: boolean
}

interface KeywordExpression extends Expression {
    name: string
}



interface Assembly extends Document {
    parameters: TemplateParameter[]
    configurations: AssemblyComponentConfiguration[]
    model: ModelInstance
}

interface TemplateParameter {
    name: string
}

interface StringParameter extends TemplateParameter {
    value?: string
}
interface Int32Parameter extends TemplateParameter {
    value?: bigint
}


interface TemplateArgument {
    parameter:@TemplateParameter
}

interface StringArgument extends TemplateArgument {
    value: string
}
interface Int32Argument extends TemplateArgument {
    value: bigint
}



interface AssemblyComponentConfiguration {
    name: Path
    elements: (GlobalEventHandler|Invocation|FieldValue)[]
}

interface GlobalEventHandler {
    entryPointName: Name
    globalEventName: string
}

interface ModelInstance extends NamedElement {
    implementation?: @Component
    strImplementation?:string
    elements: (GlobalEventHandler|SubInstance|Link|Invocation|FieldValue)[]
}

interface AssemblyInstance extends NamedElement {
    assembly: @Assembly
    arguments: TemplateArgument[]
    configuration?:@Configuration
    linkBase?:@LinkBase
    elements: (AssemblyComponentConfiguration)[]
}

type Name = string;

type Path = string;

interface SubInstance {
    container: Name
    instance: ModelInstance|AssemblyInstance
}


interface Invocation {
}

interface OperationCall extends Invocation {
    operation: Name
    parameters: ParameterValue[]
}
interface PropertyValue extends Invocation {
    property: Name
    value: SimpleValue
}


interface Configuration extends Document {
    elements: (ConfigurationUsage|ComponentConfiguration)[]
}



interface ComponentConfiguration {
    name: string
    elements: (ConfigurationUsage|ComponentConfiguration|Value)[]
    component?: @Component
}

interface ConfigurationUsage {
    path?: string
    configuration: @Configuration
}



interface LinkBase extends Document {
    elements: ComponentLinkBase[]
}



interface ComponentLinkBase {
    name: string
    elements: (ComponentLinkBase|Link)[]
}

interface Link {
    ownerPath: string
    clientPath: string
}
interface EventLink extends Link {
}
interface FieldLink extends Link {
}
interface InterfaceLink extends Link {
    reference:string
    backReference?:string
}



interface Schedule extends Document {
    parameters: TemplateParameter[]
    elements:(Task|Event)[]
    epochTime?:string
    missionStart?:string
}

interface Task extends NamedElement {
    elements: Activity[]
}


interface Event {
    task: @Task
    cycleTime: string="PT0S"
    repeatCount?: bigint
}

interface GlobalEventTriggeredEvent extends Event {
    delay?:bigint
    startEvent:string
    stopEvent?:string
    //timeKind
}

interface MissionEvent extends Event {
    missionTime:string
}
interface EpochEvent extends Event {
    epochTime:string
}
interface SimulationEvent extends Event {
    simulationTime:string
}

interface ZuluEvent extends Event {
    zuluTime:string
}

interface Activity {
}


interface ExecuteTask extends Activity {
    task:@Task
    parameter: TemplateArgument[]
    root?:string
}

interface EmitGlobalEvent extends Activity {
    eventName:string
    asynchronous:boolean = false
}
interface ParameterValue {
    parameter: string
    value: SimpleValue
}
interface CallOperation extends Activity {
    operationPath:string
    parameters: ParameterValue[]
}

interface SetProperty extends Activity {
    propertyPath:string
    value: SimpleValue
}

interface Transfer extends Activity {
    outputFieldPath:string
    inputFieldPath: string
}
interface Trigger extends Activity {
    entryPoint:string
}
