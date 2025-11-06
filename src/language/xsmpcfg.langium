grammar Xsmpcfg
import 'xsmpcfg-types'

entry Configuration returns Configuration:
    'configuration' name=ValidID
    elements+=(ConfigurationUsage|ComponentConfiguration)*;




ComponentConfiguration returns ComponentConfiguration:
    name=CfgPath 
    '{' 
    elements+=(ConfigurationUsage|ComponentConfiguration|FieldValue)*
    '}';

ConfigurationUsage returns ConfigurationUsage:
    'include' configuration=[Configuration:ValidID]
    ('at' path=CfgPath)?;


ValidID returns string:
    ID | 'configuration'|'using'|'at'|'i8'|'i16'|'i32'|'i64'|'u8'|'u16'|'u32'|'u64'|'f32'|'f64';

Value returns Value:
    SimpleValue | ArrayValue | StructureValue;

FieldValue returns FieldValue:
    field=CfgPath '=' value=Value;

OptFieldValue returns FieldValue:
    (field=CfgPath '=')? value=Value;

ArrayValue returns ArrayValue:
    '[' (elements+=Value (','elements+=Value)*)? ']';

StructureValue returns StructureValue:
    '{' (elements+=OptFieldValue (','elements+=OptFieldValue)*)? '}';

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | UInt64Value 
    | EnumerationValue | BoolValue | Float32Value | Float64Value | Char8Value | String8Value | DurationValue |DateTimeValue;

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
    value=INT'lit';

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

DurationValue returns DurationValue:
    value=DURATION_STRING;

DateTimeValue returns DateTimeValue:
    value=DATETIME_STRING;


CfgPath returns string:
    ('/'? ValidID (('.'|'/') ValidID | '[' INT ']')* | '/');

hidden terminal WS: /\s+/;
terminal DATETIME_STRING: /"[^"]*"dt/;
terminal DURATION_STRING: /"[^"]*"d/;
terminal STRING: /"[^"]*"/;
terminal CHAR: /'[^']*'/;

terminal ID: /[_a-zA-Z]\w*/;

terminal FLOATING_LITERAL:FRACTIONALCONSTANT EXPONENTPART?| DIGITSEQUENCE EXPONENTPART;
terminal fragment FRACTIONALCONSTANT:DIGITSEQUENCE? '.' DIGITSEQUENCE | DIGITSEQUENCE '.';
terminal fragment DIGITSEQUENCE:/[0-9][0-9']*/;
terminal fragment EXPONENTPART:/[eE][+-]?[0-9][0-9']*/;

terminal INT returns number: /[+-]?(0|[1-9]\d*)/;



hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

