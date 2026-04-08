grammar Xsmpcfg

import 'xsmp-types'

entry Configuration returns Configuration:
    /**
     * `configuration <name>`
     *
     * Declares a reusable XSMP configuration document.
     * A configuration groups field values, nested component configurations and includes that can be applied to matching component instances.
     *
     * **Example**
     * ```xsmp
     * configuration Nominal
     * /platform: demo.Platform
     * {
     *     mode = demo.foundation.Mode.Nominal
     * }
     * ```
     */
    'configuration' name=ValidID
    elements+=(ConfigurationUsage|ComponentConfiguration)*;




ComponentConfiguration returns ComponentConfiguration:
    name=Path (
        ':' context=[ComponentOrAssembly:QualifiedName]
    )?
    '{' 
    elements+=(ConfigurationUsage|ComponentConfiguration|FieldValue)*
    '}';

ConfigurationUsage returns ConfigurationUsage:
    /**
     * `include <configuration> [at <path>]`
     *
     * Includes another configuration document, optionally below a child component path.
     * Use `at` to reuse a common configuration on a nested instance instead of at the current level.
     *
     * **Example**
     * ```xsmp
     * include PowerNominal at power
     * ```
     */
    'include' configuration=[Configuration:ValidID]
    ('at' path=Path)?;
ValidID returns string:
    ID | 'configuration'|'using'|'at'|'i8'|'i16'|'i32'|'i64'|'u8'|'u16'|'u32'|'u64'|'f32'|'f64';

QualifiedName returns string:
    ValidID ('.' ValidID)*;

Value returns Value:
    SimpleValue | ArrayValue | StructureValue;

FieldValue returns FieldValue:
    field=Path '=' value=Value;

CfgStructureValueElement returns Value:
    CfgStructureFieldValue | Value;

CfgStructureFieldValue returns CfgStructureFieldValue:
    field=CfgConcretePathNamedSegment '=' value=Value;

CfgConcretePathNamedSegment returns ConcretePathNamedSegment:
    (
        /**
         * `unsafe`
         *
         * Marks one designated structure field assignment as intentionally unchecked.
         *
         * **Example**
         * ```xsmp
         * unsafe legacyField = 2
         * ```
         */
        unsafe?='unsafe'
    )? reference=[NamedElement:ValidID];

ArrayValue returns ArrayValue:
    '[' (startIndex=INT ':')? (elements+=Value (','elements+=Value)*)? ']';

StructureValue returns StructureValue:
    '{' (elements+=CfgStructureValueElement (','elements+=CfgStructureValueElement)*)? '}';

SimpleValue returns SimpleValue:
    Int8Value | Int16Value | Int32Value | Int64Value | UInt8Value | UInt16Value | UInt32Value | UInt64Value 
    | EnumerationValue | BoolValue | Float32Value | Float64Value | FloatValue | IntValue | Char8Value | String8Value | DurationValue |DateTimeValue;

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

Path returns Path:
    {Path}
    (
        /**
         * `unsafe`
         *
         * Marks a configuration path as intentionally unchecked while keeping resolution, hover and navigation.
         *
         * **Example**
         * ```xsmp
         * include Legacy at unsafe child
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
