grammar Xsmpsed

import 'xsmp-types'

entry Schedule returns Schedule:
    'schedule' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? name=ValidID

    (('epoch' epochTime=STRING) ('mission' missionStart=STRING)? | ('mission' missionStart=STRING) ('epoch' epochTime=STRING)?)?
    elements+=(Task|Event)*;


TemplateParameter returns TemplateParameter:
    StringParameter | Int32Parameter;

StringParameter returns StringParameter:
    name=ID (':' 'string' ('=' value=STRING)? | '=' value=STRING);

Int32Parameter returns Int32Parameter:
    name=ID (':''int32'  ('=' value=INT)? | '=' value=INT);


Task returns Task:
    'task' name=Name
    '{'
    elements+=Activity*
    '}';

Activity returns Activity:
    ExecuteTask | EmitGlobalEvent | CallOperation | SetProperty | Transfer | Trigger;


CallOperation returns CallOperation:
    'call' operationPath=Path '(' (parameters+=ParameterValue (',' parameters+=ParameterValue)*)? ')';

SetProperty returns SetProperty:
    'property' propertyPath=Path '=' value=SimpleValue;

Transfer returns Transfer:
    'transfer' outputFieldPath=Path '->' inputFieldPath=Path;

Trigger returns Trigger:
    'trig' entryPoint=Path;


ExecuteTask returns ExecuteTask:
    'execute' task=[Task:QualifiedName] ('<' parameter+=TemplateArgument (',' parameter+=TemplateArgument)*'>')? ('at' root=Path)?;

TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] '=' value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] '=' value=INT;

EmitGlobalEvent returns EmitGlobalEvent:
    asynchronous?='async'? 'emit' eventName=STRING;

Event returns Event:
    MissionEvent | EpochEvent | SimulationEvent | ZuluEvent // | GlobalEventTriggeredEvent
;

MissionEvent returns MissionEvent:
    'event'
    task=[Task:QualifiedName] 'mission' missionTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

EpochEvent returns EpochEvent:
    'event'
    task=[Task:QualifiedName] 'epoch' epochTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;


SimulationEvent returns SimulationEvent:
    'event'
    task=[Task:QualifiedName] 'simulation' simulationTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

ZuluEvent returns ZuluEvent:
    'event'
    task=[Task:QualifiedName] 'zulu' zuluTime=STRING ('cycle' cycleTime=STRING ('repeat' repeatCount=INT)?)?;

Name returns string:
    ValidID;


QualifiedName returns string:
    ValidID ('.' ValidID)*;

Path returns string:
    '/'? Name (('.'|'/') Name)*;

ParameterValue returns ParameterValue:
    parameter=ValidID '=' value=SimpleValue;

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | EnumerationValue
    | UInt64Value | BoolValue | Float32Value | Float64Value | Char8Value | String8Value | DurationValue | DateTimeValue;

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

terminal ID: /([_a-zA-Z]\w*|{[_a-zA-Z]\w*}\w*)+/;


terminal FLOATING_LITERAL:FRACTIONALCONSTANT EXPONENTPART?| DIGITSEQUENCE EXPONENTPART;
terminal fragment FRACTIONALCONSTANT:DIGITSEQUENCE? '.' DIGITSEQUENCE | DIGITSEQUENCE '.';
terminal fragment DIGITSEQUENCE:/[0-9][0-9']*/;
terminal fragment EXPONENTPART:/[eE][+-]?[0-9][0-9']*/;

terminal INT returns bigint: /[+-]?(0|[1-9]\d*)/;


hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;



ValidID returns string:
    ID | 'string' | 'int32' | 'schedule'|'task'|'call'|'property'|'transfer'|'trig'|'execute'|'async'|'emit'|'mission'|'epoch'|'simulation'|'zulu'|'event';