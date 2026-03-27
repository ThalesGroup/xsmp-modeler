grammar Xsmpsed

import 'xsmp-types'

entry Schedule returns Schedule:
    /**
     * `schedule [<parameter, ...>] <name> [epoch "..."] [mission "..."]`
     *
     * Declares an XSMP schedule document.
     * A schedule contains tasks, events and optional template parameters used to specialize task roots and templated paths.
     *
     * **Example**
     * ```xsmp
     * schedule <Root = "platform"> MissionPlan epoch "2025-01-01T00:00:00Z"
     * task Main on demo.Platform
     * {
     * }
     * ```
     */
    'schedule' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? name=ValidID

    (('epoch' epochTime=STRING) ('mission' missionStart=STRING)? | ('mission' missionStart=STRING) ('epoch' epochTime=STRING)?)?
    elements+=(Task|Event)*;


TemplateParameter returns TemplateParameter:
    StringParameter | Int32Parameter;

StringParameter returns StringParameter:
    name=ID (':' 
        /**
         * `string`
         *
         * Declares a string template parameter for the schedule.
         * String parameters are commonly used to specialize relative task roots or templated path segments.
         *
         * **Example**
         * ```xsmp
         * Root: string = "platform"
         * ```
         */
        'string' ('=' value=STRING)? | '=' value=STRING);

Int32Parameter returns Int32Parameter:
    name=ID (':' 
        /**
         * `int32`
         *
         * Declares an `int32` template parameter for the schedule.
         *
         * **Example**
         * ```xsmp
         * Cycles: int32 = 3
         * ```
         */
        'int32'  ('=' value=INT)? | '=' value=INT);


Task returns Task:
    /**
     * `task <name> [on <component-or-assembly>] { ... }`
     *
     * Declares a reusable schedule task.
     * Attach an execution context component or assembly when the task should be validated against a specific root context and when typed hover/navigation is desired on activity paths.
     *
     * **Example**
     * ```xsmp
     * task Bootstrap on demo.orbit.OrbitalPlatform
     * {
     *     trig run
     * }
     * ```
     */
    'task' name=Name ('on' context=[ComponentOrAssembly:QualifiedName])?
    '{'
    elements+=Activity*
    '}';

Activity returns Activity:
    ExecuteTask | EmitGlobalEvent | CallOperation | SetProperty | Transfer | Trigger;


CallOperation returns CallOperation:
    /**
     * `call <operation-path>(<parameter = value, ...>)`
     *
     * Calls one operation on the current task execution context or on a child component reached through a typed path.
     *
     * **Example**
     * ```xsmp
     * call avionics.apply(requestedMode = demo.foundation.Mode.Nominal)
     * ```
     */
    'call' operationPath=Path '(' (parameters+=ParameterValue (',' parameters+=ParameterValue)*)? ')';

SetProperty returns SetProperty:
    /**
     * `property <property-path> = <value>`
     *
     * Sets one writable property on the current task execution context or on a child component reached through a typed path.
     *
     * **Example**
     * ```xsmp
     * property mode = demo.foundation.Mode.Nominal
     * ```
     */
    'property' propertyPath=Path '=' value=SimpleValue;

Transfer returns Transfer:
    /**
     * `transfer <output-field> -> <input-field>`
     *
     * Copies data from one output field to one compatible input field.
     *
     * **Example**
     * ```xsmp
     * transfer bus.outValue -> router.incomingBus
     * ```
     */
    'transfer' outputFieldPath=Path '->' inputFieldPath=Path;

Trigger returns Trigger:
    /**
     * `trig <entrypoint-path>`
     *
     * Executes one entry point of the current task execution context or of a reachable child component.
     *
     * **Example**
     * ```xsmp
     * trig avionics.step
     * ```
     */
    'trig' entryPoint=Path;


ExecuteTask returns ExecuteTask:
    /**
     * `execute <task> [<argument, ...>] [at <root-path>]`
     *
     * Executes another task, optionally with template arguments and with a different execution root.
     *
     * **Example**
     * ```xsmp
     * execute PowerBalance at avionics
     * ```
     */
    'execute' task=[Task:QualifiedName] ('<' parameter+=TemplateArgument (',' parameter+=TemplateArgument)*'>')? ('at' root=Path)?;

TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] '=' value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] '=' value=INT;

EmitGlobalEvent returns EmitGlobalEvent:
    asynchronous?='async'?
    /**
     * `emit "<event-name>"`
     *
     * Emits a simulator-wide global event.
     * Prefix the activity with `async` when the emission should be modeled as asynchronous with respect to the current activity flow.
     *
     * **Example**
     * ```xsmp
     * async emit "PlatformReady"
     * ```
     */
    'emit' eventName=STRING;

TimeKind returns string:
    'mission' | 'epoch' | 'simulation' | 'zulu';

Event returns Event:
    MissionEvent | EpochEvent | SimulationEvent | ZuluEvent | GlobalEventTriggeredEvent
;

GlobalEventTriggeredEvent returns GlobalEventTriggeredEvent:
    /**
     * `event <task> on "<start>" [until "<stop>"] [using <time-kind>] [delay "..."] [cycle "..." [repeat <n>]]`
     *
     * Starts a task when a global event is emitted.
     * Use `until` to stop listening, `delay` to offset execution and `cycle` / `repeat` to create repeated activations.
     *
     * **Example**
     * ```xsmp
     * event Observe on "PlatformReady" using mission delay "PT5S" cycle "PT30S" repeat 3
     * ```
     */
    'event'
    task=[Task:QualifiedName] 'on' startEvent=STRING
    ('until' stopEvent=STRING)?
    ('using' timeKind=TimeKind)?
    ('delay' delay=STRING)?
    ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

MissionEvent returns MissionEvent:
    /**
     * `event <task> mission "<time>" [cycle "..." [repeat <n>]]`
     *
     * Schedules a task at one mission-relative time.
     *
     * **Example**
     * ```xsmp
     * event Bootstrap mission "PT10S"
     * ```
     */
    'event'
    task=[Task:QualifiedName] 'mission' missionTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

EpochEvent returns EpochEvent:
    /**
     * `event <task> epoch "<time>" [cycle "..." [repeat <n>]]`
     *
     * Schedules a task at one absolute epoch timestamp.
     *
     * **Example**
     * ```xsmp
     * event Bootstrap epoch "2025-01-01T00:00:10Z"
     * ```
     */
    'event'
    task=[Task:QualifiedName] 'epoch' epochTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;


SimulationEvent returns SimulationEvent:
    /**
     * `event <task> simulation "<time>" [cycle "..." [repeat <n>]]`
     *
     * Schedules a task at one simulation-relative time.
     *
     * **Example**
     * ```xsmp
     * event Worker simulation "PT45S"
     * ```
     */
    'event'
    task=[Task:QualifiedName] 'simulation' simulationTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

ZuluEvent returns ZuluEvent:
    /**
     * `event <task> zulu "<time>" [cycle "..." [repeat <n>]]`
     *
     * Schedules a task at one UTC timestamp.
     *
     * **Example**
     * ```xsmp
     * event Bootstrap zulu "2025-01-01T00:00:10Z"
     * ```
     */
    'event'
    task=[Task:QualifiedName] 'zulu' zuluTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

Name returns string:
    ValidID;


QualifiedName returns string:
    ValidID ('.' ValidID)*;

Path returns Path:
    {Path}
    (
        /**
         * `unsafe`
         *
         * Marks a schedule path as intentionally unchecked while keeping resolution, hover and navigation.
         *
         * **Example**
         * ```xsmp
         * call unsafe legacy.reset()
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
    reference=[NamedElement:Name];

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

ParameterValue returns ParameterValue:
    parameter=ValidID '=' value=SimpleValue;

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | EnumerationValue
    | UInt64Value | BoolValue | Float32Value | Float64Value | FloatValue | IntValue | Char8Value | String8Value | DurationValue | DateTimeValue;

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
BoolValue returns BoolValue:
    value?='true' | 'false';
EnumerationValue returns EnumerationValue:
    (value=INT'lit' | reference=[EnumerationLiteral:QualifiedName]);

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

terminal INT returns bigint: /[+-]?(0|[1-9]\d*)/;


hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;



ValidID returns string:
    ID | 'string' | 'int32' | 'schedule'|'task'|'call'|'property'|'transfer'|'trig'|'execute'|'async'|'emit'|'mission'|'epoch'|'simulation'|'zulu'|'event'|'on'|'until'|'using'|'delay';
