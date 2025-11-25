grammar Xsmpsed

import 'xsmp-types'

entry Schedule returns Schedule:
    'schedule' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? name=Name
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
    'execute' task=[Task:QualifiedName] ('<' parameters+=TemplateArgument (',' parameters+=TemplateArgument)*'>')? ('at' root=Path)?;

TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] '=' value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] '=' value=INT;

EmitGlobalEvent returns EmitGlobalEvent:
    asynchronous?='async'? 'emit' eventName=STRING;

Event returns Event:
    MissionEvent | EpochEvent | SimulationEvent | ZuluEvent /* | GlobalEventTriggeredEvent*/;

MissionEvent returns MissionEvent:
    'mission' 'event' name=ValidID ':'
    task=[Task:QualifiedName] '=' missionTime=STRING;

EpochEvent returns EpochEvent:
    'epoch' 'event' name=ValidID ':'
    task=[Task:QualifiedName] '=' epochTime=STRING;


SimulationEvent returns SimulationEvent:
    'simulation' 'event' name=ValidID ':'
    task=[Task:QualifiedName] '=' simulationTime=STRING;

ZuluEvent returns ZuluEvent:
    'zulu' 'event' name=ValidID ':'
    task=[Task:QualifiedName] '=' zuluTime=STRING;

Name returns string:
    ValidID;


QualifiedName returns string:
    ValidID ('.' ValidID)*;

Path returns string:
    '/'? Name (('.'|'/') Name)*;

ParameterValue returns ParameterValue:
    parameter=ValidID '=' value=SimpleValue;

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | UInt64Value | BoolValue | Float32Value | Float64Value | Char8Value | String8Value;

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

Float32Value returns Float32Value:
    value=FLOATING_LITERAL'f32';

Float64Value returns Float64Value:
    value=FLOATING_LITERAL'f64';

Char8Value returns Char8Value:
    value=CHAR;

String8Value returns String8Value:
    value=STRING;
//TODO handle duration and datetime values

hidden terminal WS: /\s+/;
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