grammar Xsmpasb

import 'xsmp-types'

entry Assembly returns Assembly:
    /**
     * `assembly [<parameter, ...>] <name>`
     *
     * Declares an XSMP assembly document.
     * An assembly defines one root model instance, optional template parameters and optional component configurations that override state or behavior inside the assembly tree.
     *
     * **Example**
     * ```xsmp
     * assembly <Lane = "Ops"> OrbitalSegment
     * Root: demo.orbit.Platform
     * {
     * }
     * ```
     */
    'assembly' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? name=ValidID
    configurations+=ComponentConfiguration*
    model=ModelInstance
    configurations+=ComponentConfiguration*;

ComponentConfiguration returns AssemblyComponentConfiguration:
    /**
     * `configure <instance-path> { ... }`
     *
     * Declares a configuration block for one model or service instance inside the assembly hierarchy.
     * The path is relative to the containing assembly or sub-assembly instance and may use template placeholders.
     *
     * **Example**
     * ```xsmp
     * configure avionics
     * {
     *     modeState = demo.foundation.Mode.Nominal
     * }
     * ```
     */
    'configure' name=Path 
    '{' 
    elements+=(GlobalEventHandler|Invocation|FieldValue)*
    '}';

GlobalEventHandler returns GlobalEventHandler:
    /**
     * `subscribe <entrypoint> -> "<global-event>"`
     *
     * Subscribes one entry point of the configured or current model instance to a simulator-wide global event.
     *
     * **Example**
     * ```xsmp
     * subscribe step -> "PlatformReady"
     * ```
     */
    'subscribe' entryPoint=LocalNamedReference '->' globalEventName=STRING;

TemplateParameter returns TemplateParameter:
    StringParameter | Int32Parameter;

StringParameter returns StringParameter:
    name=ID (':' 
        /**
         * `string`
         *
         * Declares a string template parameter for the assembly.
         * String parameters are typically used inside templated instance names or typed paths.
         *
         * **Example**
         * ```xsmp
         * Lane: string = "Ops"
         * ```
         */
        'string' ('=' value=STRING)? | '=' value=STRING);

Int32Parameter returns Int32Parameter:
    name=ID (':' 
        /**
         * `int32`
         *
         * Declares an `int32` template parameter for the assembly.
         *
         * **Example**
         * ```xsmp
         * Index: int32 = 1
         * ```
         */
        'int32'  ('=' value=INT)? | '=' value=INT);


TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] '=' value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] '=' value=INT;


ModelInstance returns ModelInstance:
    name=InstanceName ':' (implementation=[Component:QualifiedName] | strImplementation=STRING)
    ('{'
        elements+=(GlobalEventHandler|SubInstance|Link|Invocation|FieldValue)*
    '}')?;

AssemblyInstance returns AssemblyInstance:
    name=InstanceName ':' assembly=[Assembly:ValidID] ('<' (arguments+=TemplateArgument (',' arguments+=TemplateArgument)*)?'>')?
    ('using' 'config' configuration=[Configuration:ValidID])?
    ('using' 'link' linkBase=[LinkBase:ValidID])?
    ('{'
        elements+=(ComponentConfiguration)*
    '}')?;

SubInstance returns SubInstance:
    container=LocalNamedReference '+=' instance=(ModelInstance|AssemblyInstance);

LocalNamedReference returns LocalNamedReference:
    (unsafe?='unsafe')? reference=[NamedElement:ValidID];

InstanceName returns string:
    (ID | TEMPLATE_ID)+;

Path returns Path:
    {Path}
    (
        /**
         * `unsafe`
         *
         * Marks an assembly path as intentionally unchecked while keeping template resolution and navigation.
         *
         * **Example**
         * ```xsmp
         * field link unsafe outValue -> unsafe child.inValue
         * ```
         */
        unsafe?='unsafe'
    )?
    (absolute?='/' (head=PathSegment elements+=PathElement*)?
    | head=PathSegment elements+=PathElement*);

PathElement returns PathElement:
    PathMember | PathIndex;

PathMember returns PathMember:
    separator=PathSeparator segment=PathSegment;

PathIndex returns PathIndex:
    '[' index=INT ']';

PathSegment returns PathSegment:
    ConcretePathNamedSegment | PatternPathNamedSegment | PathParentSegment | PathSelfSegment;

ConcretePathNamedSegment returns ConcretePathNamedSegment:
    reference=[NamedElement:ValidID];

PatternPathNamedSegment returns PatternPathNamedSegment:
    pattern=TemplateIdentifierPattern;

TemplateIdentifierPattern returns IdentifierPattern:
    {IdentifierPattern}
    parts+=IdentifierTextPart*
    parts+=IdentifierTemplatePart
    parts+=IdentifierPatternPart*;

IdentifierPatternPart returns IdentifierPatternPart:
    IdentifierTextPart | IdentifierTemplatePart;

IdentifierTextPart returns IdentifierTextPart:
    text=ID;

IdentifierTemplatePart returns IdentifierTemplatePart:
    text=TEMPLATE_ID;

PathParentSegment returns PathParentSegment:
    {PathParentSegment} '..';

PathSelfSegment returns PathSelfSegment:
    {PathSelfSegment} '.';

PathSeparator returns string:
    '.' | '/';


Link returns Link:
    EventLink | FieldLink | InterfaceLink;

EventLink returns EventLink:
    /**
     * `event link <owner> -> <client>`
     *
     * Connects one event source to one compatible event sink in the assembly tree.
     *
     * **Example**
     * ```xsmp
     * event link outbound -> child.inbound
     * ```
     */
    'event' 'link' ownerPath=Path '->' clientPath=Path;
FieldLink returns FieldLink:
    /**
     * `field link <owner> -> <client>`
     *
     * Connects one output field to one compatible input field.
     *
     * **Example**
     * ```xsmp
     * field link outValue -> child.inValue
     * ```
     */
    'field' 'link' ownerPath=Path '->' clientPath=Path;


InterfaceLink returns InterfaceLink:
    /**
     * `interface link <sourcePath> -> <client> [:<backReference>]`
     *
     * Connects a reference of one component instance to another compatible component instance.
     * The last segment of `sourcePath` selects the published reference, while any preceding segments navigate to the owner instance.
     * Use `backReference` to create an additional reverse connection when the target publishes one.
     *
     * **Example**
     * ```xsmp
     * interface link logger -> child
     * interface link nested.logger -> child:backLogger
     * ```
     */
    'interface' 'link' sourcePath=Path '->' clientPath=Path (':'backReference=LocalNamedReference)?;

Invocation returns Invocation:
    OperationCall | PropertyValue;

OperationCall returns OperationCall:
    /**
     * `call <operation>(<parameter = value, ...>)`
     *
     * Invokes one published operation of the current configured or current model instance.
     *
     * **Example**
     * ```xsmp
     * call apply(requestedMode = demo.foundation.Mode.Nominal)
     * ```
     */
    'call' operation=LocalNamedReference '(' (parameters+=ParameterValue (',' parameters+=ParameterValue)*)? ')';


ParameterValue returns ParameterValue:
    parameter=ValidID '=' value=SimpleValue;

PropertyValue returns PropertyValue:
    /**
     * `property <property> = <value>`
     *
     * Sets one writable property of the current configured or current model instance.
     *
     * **Example**
     * ```xsmp
     * property mode = demo.foundation.Mode.Nominal
     * ```
     */
    'property' property=LocalNamedReference '=' value=SimpleValue;


Value returns Value:
    SimpleValue | ArrayValue | StructureValue;

FieldValue returns FieldValue:
    field=Path '=' value=Value;

OptFieldValue returns FieldValue:
    (field=Path '=')?value=Value;

ArrayValue returns ArrayValue:
    '[' (elements+=Value (','elements+=Value)*)? ']';

StructureValue returns StructureValue:
    '{' (elements+=OptFieldValue (','elements+=OptFieldValue)*)? '}';

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | UInt64Value | BoolValue 
    | Float32Value | Float64Value | FloatValue | IntValue | Char8Value | String8Value | EnumerationValue | DurationValue | DateTimeValue;

Int8Value returns Int8Value:
    value=INT'i8';
Int16Value returns Int16Value:
    value=INT'i16';
Int32Value returns Int32Value:
    value=INT'i32';
Int64Value returns Int64Value:
    value=INT'i64';
UInt8Value returns UInt8Value:
    value=INT'u8';
UInt16Value returns UInt16Value:
    value=INT'u16';
UInt32Value returns UInt32Value:
    value=INT'u32';
UInt64Value returns UInt64Value:
    value=INT'u64';
EnumerationValue returns EnumerationValue:
    (value=INT'lit' | reference=[EnumerationLiteral:QualifiedName]);
BoolValue returns BoolValue:
    value?='true' | 'false';

Float32Value returns Float32Value:
    value=FLOATING_LITERAL'f32';

Float64Value returns Float64Value:
    value=FLOATING_LITERAL'f64';

FloatValue returns FloatValue:
    value=FLOATING_LITERAL;

IntValue returns IntValue:
    value=INT;

Char8Value returns Char8Value:
    value=CHAR;

String8Value returns String8Value:
    value=STRING;

DurationValue returns DurationValue:
    value=DURATION_STRING;

DateTimeValue returns DateTimeValue:
    value=DATETIME_STRING;


hidden terminal WS: /\s+/;
terminal DATETIME_STRING: /"[^"]*"dt/;
terminal DURATION_STRING: /"[^"]*"d/;
terminal STRING: /"[^"]*"/;
terminal CHAR: /'[^']*'/;
terminal TEMPLATE_ID: /\{[_a-zA-Z]\w*\}/;
terminal ID: /[_a-zA-Z]\w*/;


terminal FLOATING_LITERAL:FRACTIONALCONSTANT EXPONENTPART?| DIGITSEQUENCE EXPONENTPART;
terminal fragment FRACTIONALCONSTANT:DIGITSEQUENCE? '.' DIGITSEQUENCE | DIGITSEQUENCE '.';
terminal fragment DIGITSEQUENCE:/[0-9][0-9']*/;
terminal fragment EXPONENTPART:/[eE][+-]?[0-9][0-9']*/;

terminal INT returns bigint: /-?(0|[1-9]\d*)/;


hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;



QualifiedName returns string:
    ValidID ('.' ValidID)+;

ValidID returns string:
    ID | 'string' | 'int32' | 'assembly';
