grammar Xsmpasb
import 'xsmpasb-types'

entry Assembly returns Assembly:
    'assembly' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? name=Name
    configurations+=ComponentConfiguration*
    model=ModelInstance
    configurations+=ComponentConfiguration*;

ComponentConfiguration returns AssemblyComponentConfiguration:
    'configure' name=Path 
    '{' 
    elements+=(GlobalEventHandler|Invocation|FieldValue)*
    '}';

GlobalEventHandler returns GlobalEventHandler:
    'subscribe' entryPointName=ValidID '->' globalEventName=STRING;

TemplateParameter returns TemplateParameter:
    StringParameter | Int32Parameter;

StringParameter returns StringParameter:
    name=ID (':' 'string' ('=' value=STRING)? | '=' value=STRING);

Int32Parameter returns Int32Parameter:
    name=ID (':''int32'  ('=' value=INT)? | '=' value=INT);


TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] '=' value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] '=' value=INT;


ModelInstance returns ModelInstance:
    name=Name ':' implementation=[Component:UuidOrTypeName]
    ('{'
        elements+=(GlobalEventHandler|SubInstance|Link|Invocation|FieldValue)*
    '}')?;

AssemblyInstance returns AssemblyInstance:
    name=Name ':' assembly=[Assembly:STRING] ('<' arguments+=TemplateArgument (',' arguments+=TemplateArgument)*'>')?
    ('using' 'config' configuration=[Configuration:STRING])?
    ('using' 'link' linkBase=[LinkBase:STRING])?
    ('{'
        elements+=(ComponentConfiguration)*
    '}')?;

SubInstance returns SubInstance:
    container=ValidID '+=' instance=(ModelInstance|AssemblyInstance);

Name returns string:
    ValidID;

Path returns string: '/'? ValidID (('.'|'/') ValidID | '[' INT ']')*;


Link returns Link:
    EventLink | FieldLink | InterfaceLink;

EventLink returns EventLink:
    'event' 'link' ownerPath=Path '->' clientPath=Path;
FieldLink returns FieldLink:
    'field' 'link' ownerPath=Path '->' clientPath=Path;

InterfaceLink returns InterfaceLink:
    'interface' 'link' ownerPath=Path (':'backReference=ValidID)? '->' clientPath=Path ':' reference=ValidID;


Invocation returns Invocation:
    OperationCall | PropertyValue;

OperationCall returns OperationCall:
    'call' operation=ValidID '(' (parameters+=ParameterValue (',' parameters+=ParameterValue)*)? ')';


ParameterValue returns ParameterValue:
    parameter=ValidID '=' value=SimpleValue;

PropertyValue returns PropertyValue:
    'property' property=ValidID '=' value=SimpleValue;


Value returns Value:
    SimpleValue | ArrayValue | StructureValue;

FieldValue returns FieldValue:
    'field' field=Path (':'|'=') value=Value;

ArrayValue returns ArrayValue:
    '[' (elements+=Value (','elements+=Value)*)? ']';

StructureValue returns StructureValue:
    '{' (elements+=FieldValue (','elements+=FieldValue)*)? '}';

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

terminal UUID: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
terminal ID: /([_a-zA-Z]\w*|{[_a-zA-Z]\w*}\w*)+/;


terminal FLOATING_LITERAL:FRACTIONALCONSTANT EXPONENTPART?| DIGITSEQUENCE EXPONENTPART;
terminal fragment FRACTIONALCONSTANT:DIGITSEQUENCE? '.' DIGITSEQUENCE | DIGITSEQUENCE '.';
terminal fragment DIGITSEQUENCE:/[0-9][0-9']*/;
terminal fragment EXPONENTPART:/[eE][+-]?[0-9][0-9']*/;

terminal INT returns number: /-?(0|[1-9]\d*)/;


hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;



UuidOrTypeName returns string:
    UUID | ValidID ('.' ValidID)*;

ValidID returns string:
    ID | 'string' | 'int32' | 'assembly';
