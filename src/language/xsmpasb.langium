grammar Xsmpasb
import 'xsmpasb-types'

entry Assembly returns Assembly:
    'assembly' ('<' parameters+=TemplateParameter (',' parameters+=TemplateParameter)*'>')? model=ModelInstance;


TemplateParameter returns TemplateParameter:
    StringParameter | Int32Parameter;

StringParameter returns StringParameter:
    name=ID (':' 'string' ('=' value=STRING)? | '=' value=STRING);

Int32Parameter returns Int32Parameter:
    name=ID (':''int32'  ('=' value=INT)? | '=' value=INT);


TemplateArgument returns TemplateArgument:
    StringArgument | Int32Argument;

StringArgument returns StringArgument:
    parameter=[TemplateParameter:ValidID] value=STRING;

Int32Argument returns Int32Argument:
    parameter=[TemplateParameter:ValidID] value=INT;


ModelInstance returns ModelInstance:
    name=Name ':' implementation=[Component:UuidOrTypeName]
    ('{'
        elements+=(SubInstance|Link|Invocation)*
    '}')?;

AssemblyInstance returns AssemblyInstance:
    name=Name ':' assembly=[Assembly:STRING] ('<' arguments+=TemplateArgument (',' arguments+=TemplateArgument)*'>')?
    ('{'
        elements+=(SubInstance|Link|Invocation)*
    '}')?;

SubInstance returns SubInstance:
    container=[Container:ValidID] '+=' instance=(ModelInstance|AssemblyInstance);

Name returns Name:
    segments+=Segment+;

Segment returns Segment:
    StringSegment | CrossReferenceSegment;

StringSegment returns StringSegment:
    name=ValidID;

CrossReferenceSegment returns CrossReferenceSegment:
    '{' ref=[TemplateParameter:ID] '}';

Path returns Path:
    segments+=Name (('.'|'/') segments+=Name)*;

Link returns Link:
    EventLink | FieldLink | InterfaceLink;

EventLink returns EventLink:
    'event' 'link' source=Path '->' target=Path ';';
FieldLink returns FieldLink:
    'field' 'link' source=Path '->' target=Path ';';

InterfaceLink returns InterfaceLink:
    'interface' 'link' source=Path ':' reference=[Reference:ValidID] '->' target=Path (':' backReference=[Reference:ValidID] )? ';';


Invocation returns Invocation:
    OperationCall;
OperationCall returns OperationCall:
    'call' operation=[Operation:ValidID] '(' /*(arguments+=Argument (',' arguments+=Argument)*)?*/ ')' ';'?;

hidden terminal WS: /\s+/;
terminal STRING: /"[^"]*"|'[^']*'/;

terminal UUID: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
terminal ID: /[_a-zA-Z]\w*/;

terminal INT returns number: /-?(0|[1-9]\d*)/;


hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;



UuidOrTypeName returns string:
    UUID | ValidID ('.' ValidID)*;

ValidID returns string:
    ID | 'string' | 'int32' | 'assembly';
