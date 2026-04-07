grammar Xsmpcat

import 'xsmp-types'

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z]\w*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
terminal STRING: /"(?:\\(?:[abfnrtv\\\"\'\?]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})|[^"\n])*"/;
terminal CHAR:   /'(?:\\(?:[abfnrtv\\\"\'\?]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})|[^'\n])*'/;
terminal FLOATING_LITERAL:FRACTIONALCONSTANT EXPONENTPART? FLOATINGSUFFIX? | DIGITSEQUENCE EXPONENTPART FLOATINGSUFFIX?;
terminal fragment FRACTIONALCONSTANT:DIGITSEQUENCE? '.' DIGITSEQUENCE | DIGITSEQUENCE '.';
terminal fragment DIGITSEQUENCE:/[0-9][0-9']*/;
terminal fragment EXPONENTPART:/[eE][+-]?[0-9][0-9']*/;
terminal fragment FLOATINGSUFFIX:/[fF]/;
terminal INTEGER_LITERAL:/(?:0[xX][0-9a-fA-F][0-9a-fA-F']*|0[bB][01]['01]*)(?:[uU][lL]?|[lL][uU]?)?|(?:[1-9][0-9']*|0[0-7']*)(?:ns|us|ms|s|mn|h|d|[uU][lL]?|[lL][uU]?)?/;

ValidID returns string:
    ID | 'extends' | 'implements' | 'in' | 'out' | 'inout' | 'class' | 'struct' | 'exception' | 'model' |
    'service' | 'interface' | 'string' | 'native' | 'primitive' | 'attribute' | 'integer' | 'catalogue' |
    'entrypoint' | 'field' | 'container' | 'reference' | 'eventsink' | 'eventsource' | 'property' | 'association' |
    'constant' | 'input' | 'output' | 'transient' | 'event' | 'def' | 'abstract' | 'get' | 'set' | 'readWrite' |
    'readOnly' | 'writeOnly' | 'array' | 'enum' | 'namespace' | 'throws';

entry Catalogue returns Catalogue:
    attributes+=Attribute*
    /**
     * `catalogue <name>`
     *
     * Declares a catalogue document.
     * A catalogue is the root container for XSMP type definitions and usually starts with one or more namespaces.
     *
     * **Example**
     * ```xsmp
     * catalogue foundation_catalogue
     * ```
     */
    'catalogue' name=ValidID
    elements+=Namespace*;

Namespace returns Namespace:
    attributes+=Attribute*
    /**
     * `namespace <name> [::<nested-name>]* { ... }`
     *
     * Groups related types under a qualified name.
     * Namespaces may be nested and help keep large catalogues readable and collision-free.
     *
     * **Example**
     * ```xsmp
     * namespace demo::foundation
     * {
     *     public enum Mode { Standby = 0, Nominal = 1 }
     * }
     * ```
     */
    'namespace' name=ValidID
    (
    '::' elements+=NestedNamespace
    |
    '{'
        elements+=(Namespace|Type)*
    '}'
    );
NestedNamespace returns Namespace:
    attributes+=Attribute*
     name=ValidID
    (
    '::' elements+=NestedNamespace
    |
    '{'
        elements+=(Namespace|Type)*
    '}'
    );


Type returns Type:
    Structure | Class | Exception | Interface | Model | Service | ArrayType | ValueReference | Integer | Float | EventType | StringType | PrimitiveType | NativeType | AttributeType | Enumeration;

VisibilityModifiers returns string:
    /** The element is visible only within its containing classifier. */
    'private' |
    /** The element is visible within its containing classifier and derived classifiers thereof. */
    'protected' |
    /** The element is globally visible. */
    'public';

FieldFlags returns string:
    /** Input flag of the field. */
    'input' |
    /** Output flag of the field. */
    'output' |
    /** Transient flag of the field (opposite of state). */
    'transient';

FieldModifiers returns string:
    VisibilityModifiers | FieldFlags;

ClassModifiers returns string:
    VisibilityModifiers |
    /** The type is abstract. Abstract types cannot be instantiated, but they can be subtyped. */
    'abstract';

AccessKind returns string:
    /** Specifies a property, which has both a getter and a setter. */
    'readWrite' |
    /** Specifies a property, which only has a getter. */
     'readOnly' |
    /** Specifies a property, which only has a setter. */
     'writeOnly';

PropertyModifiers returns string:
    AccessKind | VisibilityModifiers;

Structure returns Structure:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] struct <name> { ... }`
     *
     * Defines a structured value type composed of fields.
     * Use a structure when several values belong together and need to be passed, stored or configured as one typed object.
     *
     * **Example**
     * ```xsmp
     * public struct ThermalLoop
     * {
     *     field Smp.Float64 temperature
     *     field Smp.Float64 pressure
     * }
     * ```
     */
    'struct' name=ValidID
    '{'
        elements+=(Constant|Field)*
    '}';

Class returns Class:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * `[visibility] [abstract] class <name> [extends <base>] { ... }`
     *
     * Defines a reusable implementation-oriented type with inheritance.
     * Classes extend structures with properties, operations and associations and are useful for shared implementation patterns.
     *
     * **Example**
     * ```xsmp
     * public abstract class BaseAlarm
     * {
     *     field Smp.String8 message
     *     def void acknowledge()
     * }
     * ```
     */
    'class' name=ValidID (/** A single base class to extends from */'extends' base=[Class:QualifiedName])?
    '{'
        elements+=(Constant|Field|Property|Operation|Association)*
    '}';

Exception returns Exception:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * `[visibility] [abstract] exception <name> [extends <base>] { ... }`
     *
     * Defines an exception type that operations or properties may raise.
     * Use exception fields to carry diagnostic data that callers can inspect.
     *
     * **Example**
     * ```xsmp
     * public exception InvalidMode
     * {
     *     field Smp.String8 reason
     * }
     * ```
     */
    'exception' name=ValidID (/** A single base exception to extends from */'extends' base=[Class:QualifiedName])?
    '{'
        elements+=(Constant|Field|Property|Operation|Association)*
    '}';

Interface returns Interface:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] interface <name> [extends <base>, ...] { ... }`
     *
     * Defines a contract published or consumed by components.
     * Interfaces are the preferred way to model stable interaction points between otherwise independent components.
     *
     * **Example**
     * ```xsmp
     * public interface ICommandable
     * {
     *     property Mode mode
     *     def void apply(in Mode requestedMode)
     * }
     * ```
     */
    'interface' name=ValidID (/** Interface(s) to inherit from */'extends' base+=[Interface:QualifiedName] (',' base+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Property|Operation)*
    '}';

Model returns Model:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * `[visibility] [abstract] model <name> [extends <base>] [implements <interface>, ...] { ... }`
     *
     * Defines a simulation model.
     * Models can expose state, behavior, entry points, event endpoints, child containers and references to other components.
     *
     * **Example**
     * ```xsmp
     * public model AvionicsUnit implements demo.foundation.ICommandable
     * {
     *     field demo.foundation.Mode modeState
     *     public property demo.foundation.Mode mode -> modeState
     *     entrypoint step
     * }
     * ```
     */
    'model' name=ValidID (/** A single base model to extends from */'extends' base=[Component:QualifiedName] )?
        (/** Interface(s) to inherit from */'implements' interface+=[Interface:QualifiedName] (',' interface+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Field|Property|Operation|Association|Container|Reference|Realization|EntryPoint|EventSink|EventSource)*
    '}';


Service returns Service:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * `[visibility] [abstract] service <name> [extends <base>] [implements <interface>, ...] { ... }`
     *
     * Defines a simulation service.
     * Services share the same component mechanisms as models but typically represent environment capabilities or infrastructure provided to models.
     *
     * **Example**
     * ```xsmp
     * public service EventManager implements Smp.IService
     * {
     * }
     * ```
     */
    'service' name=ValidID (/** A single base service to extends from */'extends' base=[Component:QualifiedName] )?
        (/** Interface(s) to inherit from */'implements' interface+=[Interface:QualifiedName] (',' interface+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Field|Property|Operation|Association|Container|Reference|Realization|EntryPoint|EventSink|EventSource)*
    '}';

ArrayType returns ArrayType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] array <name> = <item-type>[<size>]`
     *
     * Defines a fixed-size array type.
     * Arrays are value types, so they are useful for vectors, samples, lookup tables and other bounded collections.
     *
     * **Example**
     * ```xsmp
     * public array FloatSamples = Smp.Float32[16]
     * ```
     */
    'array' name=ValidID '=' itemType=[ValueType:QualifiedName] '[' size=Expression? ']';

ValueReference returns ValueReference:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] using <name> = <value-type>*`
     *
     * Defines a reference type to a value type.
     * Use it when a model API needs to point to a value object rather than contain it directly.
     *
     * **Example**
     * ```xsmp
     * public using VoltageRef = demo.foundation.Voltage*
     * ```
     */
    'using' name=ValidID '=' type=[ValueType:QualifiedName] '*';

Integer returns Integer:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] integer <name> [extends <primitive>] [in <min> ... <max>]`
     *
     * Defines a constrained integer type.
     * Use `extends` to choose the storage primitive and `in` to express the accepted value range.
     *
     * **Example**
     * ```xsmp
     * public integer Percentage extends Smp.UInt8 in 0 ... 100
     * ```
     */
    'integer' name=ValidID (/** The Integral type to inherit from */'extends' primitiveType=[PrimitiveType:QualifiedName] )?
    (/** The integer range */'in' (minimum=Expression | '*' )'...' (maximum=Expression | '*' ))?;

Float returns Float:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] float <name> [extends <primitive>] [in <min> <range-kind> <max>]`
     *
     * Defines a constrained floating-point type.
     * Use the range kind to choose whether the bounds are inclusive or exclusive.
     *
     * **Example**
     * ```xsmp
     * public float TemperatureC extends Smp.Float32 in -120.0 ... 180.0
     * ```
     */
    'float' name=ValidID (/** The Floating type to inherit from */'extends' primitiveType=[PrimitiveType:QualifiedName] )?
    (/** The integer range */'in' (minimum=Expression | '*' ) range=RangeKind (maximum=Expression | '*' ))?;

RangeKind returns RangeKind:
    /** The minimum and maximum bounds are inclusive. */
    '...' |
    /** The minimum bound is inclusive and the maximum bound is exclusive. */
    '..<' |
    /** The minimum bound is exclusive and the maximum bound is inclusive. */
    '<..' |
    /** The minimum and maximum bounds are exclusive. */
     '<.<';


EventType returns EventType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] event <name> [extends <simple-type>]`
     *
     * Defines an event type.
     * Extend a simple type when each emitted event carries one payload value of that type.
     *
     * **Example**
     * ```xsmp
     * public event ModeEvent extends demo.foundation.Mode
     * ```
     */
    'event' name=ValidID (/** The event argument type */ 'extends' eventArgs=[SimpleType:QualifiedName])?;

StringType returns StringType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] string <name>[<length>]`
     *
     * Defines a fixed-length string type based on `Char8`.
     * Use string types when the model needs bounded textual data with explicit maximum storage.
     *
     * **Example**
     * ```xsmp
     * public string Label[32]
     * ```
     */
    'string' name=ValidID '[' length=Expression? ']';

PrimitiveType returns PrimitiveType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] primitive <name>`
     *
     * Declares one primitive type entry.
     * Primitive types exist mainly to bootstrap the XSMP type system and are typically not authored in user catalogues.
     *
     * **Example**
     * ```xsmp
     * primitive Float64
     * ```
     */
    'primitive' name=ValidID;

NativeType returns NativeType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] native <name>`
     *
     * Declares a native type placeholder used to bind XSMP models to platform-specific or external types.
     *
     * **Example**
     * ```xsmp
     * public native FILE_HANDLE
     * ```
     */
    'native' name=ValidID;

AttributeType returns AttributeType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] attribute <type> <name> [= <default-value>]`
     *
     * Declares a user-defined attribute type.
     * Attribute types let you attach structured metadata to XSMP elements in a controlled and typed way.
     *
     * **Example**
     * ```xsmp
     * public attribute Smp.String8 category = "telemetry"
     * ```
     */
    'attribute' type=[ValueType:QualifiedName] name=ValidID ('=' default=Expression )?;

Enumeration returns Enumeration:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] enum <name> { <literal> = <value>, ... }`
     *
     * Defines an enumeration type with named integer-backed literals.
     *
     * **Example**
     * ```xsmp
     * public enum Mode { Standby = 0, Nominal = 1, Safe = 2 }
     * ```
     */
    'enum' name=ValidID '{' (literal+=EnumerationLiteral (',' literal+=EnumerationLiteral)* ','? )? '}';

EnumerationLiteral returns EnumerationLiteral:
    attributes+=Attribute*
    name=ValidID '=' value=Expression;

Constant returns Constant:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] constant <simple-type> <name> = <value>`
     *
     * Declares a typed constant.
     * Constants are useful for protocol values, engineering constants and reusable defaults.
     *
     * **Example**
     * ```xsmp
     * public constant Smp.Float64 StandardGravity = 9.80665
     * ```
     */
    'constant' type=[SimpleType:QualifiedName] name=ValidID ('=' value=Expression )?;

Field returns Field:
    attributes+=Attribute*
    modifiers+=FieldModifiers*
    /**
     * `[visibility] [input|output|transient] field <type> <name> [= <default-value>]`
     *
     * Declares state or data published by a type.
     * Use `input` and `output` for dataflow contracts, and `transient` when the value shall not be persisted as state.
     *
     * **Example**
     * ```xsmp
     * output field demo.foundation.Vector3 estimatedRates
     * ```
     */
    'field' type=[ValueType:QualifiedName] name=ValidID ('=' default=Expression)?;

Property returns Property:
    attributes+=Attribute*
    modifiers+=PropertyModifiers*
    /**
     * `[visibility] [readOnly|writeOnly|readWrite] property <type> <name> ...`
     *
     * Declares a property exposed through getter/setter semantics instead of direct state access.
     * Use properties when access must be validated, transformed or published through interfaces.
     *
     * **Example**
     * ```xsmp
     * public property demo.foundation.Mode mode -> modeState
     * ```
     */
    'property' type=[ValueType:QualifiedName] name=ValidID
    ('get' 'throws' getRaises+=[Exception:QualifiedName] (',' getRaises+=[Exception:QualifiedName] )*)?
    ('set' 'throws' setRaises+=[Exception:QualifiedName] (',' setRaises+=[Exception:QualifiedName] )*)?
    ('->' attachedField=[Field:QualifiedName])?;

Operation returns Operation:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] def (<return-type>|void) <name>(...) [throws <exception>, ...]`
     *
     * Declares an operation callable through publication and dynamic invocation.
     * Operations may define ordered parameters, an optional return value and raised exceptions.
     *
     * **Example**
     * ```xsmp
     * public def void apply(in demo.foundation.Mode requestedMode)
     * ```
     */
    'def' (returnParameter=(ReturnParameter|ReturnParameterWithName) | 'void') name=ValidID '(' (parameter+=Parameter (',' parameter+=Parameter)*)? ')'
    ('throws' raisedException+=[Exception:QualifiedName] (',' raisedException+=[Exception:QualifiedName])*)?;

ReturnParameter returns ReturnParameter:
    attributes+=Attribute*
    type=[LanguageType:QualifiedName];

ReturnParameterWithName returns ReturnParameter:
    attributes+=Attribute*
    type=[LanguageType:QualifiedName] name=ValidID;

Parameter returns Parameter:
    attributes+=Attribute*
    direction=ParameterDirectionKind? type=[LanguageType:QualifiedName] name=ValidID ('=' default=Expression)?;

ParameterDirectionKind returns ParameterDirectionKind:
    /** The parameter is read-only to the operation, i.e. its value must be specified on call, and cannot be changed inside the operation. */
    'in' |
    /** The parameter is write-only to the operation, i.e. its value is unspecified on call, and must be set by the operation. */
    'out' |
    /** The parameter must be specified on call, and may be changed by the operation. */
    'inout';

Association returns Association:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * `[visibility] association <type> <name>`
     *
     * Declares a semantic association to another model element or value type.
     * Associations are useful when you want to express a relation without using component containment or reference mechanics.
     *
     * **Example**
     * ```xsmp
     * public association demo.foundation.Mode requestedMode
     * ```
     */
    'association' type=[LanguageType:QualifiedName] name=ValidID;


Container returns Container:
    attributes+=Attribute*
    /**
     * `container <type>[<multiplicity>] <name> [= <default-component>]`
     * 
     * Multiplicity forms:
     * ```
     *   ?
     *   *
     *   +
     *   [<value>]
     *   [<lower>...<upper>]
     *   [<lower>...*]
     * ```
     * 
     * Declares a containment slot for child components.
     * Use multiplicity to constrain how many children may be placed in the container, and `= <default-component>` to suggest an initial implementation.
     *
     * **Example**
     * ```xsmp
     * container demo.avionics.SensorHead* sensors = demo.avionics.SensorHead
     * ```
     */
    'container' type=[ReferenceType:QualifiedName] MultiplicityDeclaration name=ValidID ('=' defaultComponent=[Component:QualifiedName])?;

Reference returns Reference:
    attributes+=Attribute*
    /**
     * `reference <type>[<multiplicity>] <name>`
     * 
     * Multiplicity forms:
     * ```
     *   ?
     *   *
     *   +
     *   [<value>]
     *   [<lower>...<upper>]
     *   [<lower>...*]
     * ```
     * 
     * Declares an aggregation reference to external components.
     * References are typed by a reference type, which can be an interface or a component depending on the selected SMP revision.
     *
     * **Example**
     * ```xsmp
     * reference demo.foundation.ILogger* loggers
     * ```
     */
    'reference' interface=[ReferenceType:QualifiedName] MultiplicityDeclaration name=ValidID;

Realization returns Realization:
    attributes+=Attribute*
    /**
     * `realization <interface> <name>`
     *
     * Declares that the enclosing component realizes a specific interface under a named slot.
     *
     * **Example**
     * ```xsmp
     * realization demo.foundation.ICommandable commandable
     * ```
     */
    'realization' interface=[Interface:QualifiedName] name=ValidID;

fragment MultiplicityDeclaration:
    (optional?='?' | multiplicity=Multiplicity | multiplicity=ShortMultiplicity)?;

ShortMultiplicity returns Multiplicity:
    {Multiplicity} aux?='+' | {Multiplicity} '*';

Multiplicity returns Multiplicity:
    {Multiplicity} '[' ((lower=Expression ('...' (aux?='*' | upper=Expression))? ) | aux?='+' | '*' )?']';

EntryPoint returns EntryPoint:
    attributes+=Attribute*
    /**
     * `entrypoint <name> { in ... out ... }`
     *
     * Declares a scheduler- or event-triggerable entry point on a component.
     * Use optional `in` and `out` sections to describe which published fields the entry point consumes or produces.
     *
     * **Example**
     * ```xsmp
     * entrypoint step
     * {
     *     out thermal
     * }
     * ```
     */
    'entrypoint' name=ValidID ('{' ('in' input+=[Field:QualifiedName] | 'out' output+=[Field:QualifiedName])*'}')?;

EventSink returns EventSink:
    attributes+=Attribute*
    /**
     * `eventsink <event-type> <name>`
     *
     * Declares an event input published by a component.
     *
     * **Example**
     * ```xsmp
     * eventsink demo.foundation.ModeEvent commandedMode
     * ```
     */
    'eventsink' type=[EventType:QualifiedName] name=ValidID;

EventSource returns EventSource:
    attributes+=Attribute*
    /**
     * `eventsource <event-type> <name>`
     *
     * Declares an event output published by a component.
     *
     * **Example**
     * ```xsmp
     * eventsource demo.foundation.ModeEvent publishedMode
     * ```
     */
    'eventsource' type=[EventType:QualifiedName] name=ValidID;

Expression returns Expression:
    OrExpression;

Attribute returns Attribute:
    '@'(type=[AttributeType:QualifiedName] ('(' value=Expression? ')')?)?;

QualifiedName returns string:
    ValidID ('.' ValidID)*;


OrExpression returns Expression:
    AndExpression ({BinaryOperation.leftOperand=current} feature=OpOr rightOperand=AndExpression)*;

OpOr returns OpBinary:
    '||';

AndExpression returns Expression:
    BitwiseOrExpression ({BinaryOperation.leftOperand=current} feature=OpAnd rightOperand=BitwiseOrExpression)*;

OpAnd returns OpBinary:
    '&&';

BitwiseOrExpression returns Expression:
    BitwiseXorExpression ({BinaryOperation.leftOperand=current} feature=OpBitwiseOr rightOperand=BitwiseXorExpression)*;

OpBitwiseOr returns OpBinary:
    '|';

BitwiseXorExpression returns Expression:
    BitwiseAndExpression ({BinaryOperation.leftOperand=current} feature=OpBitwiseXor rightOperand=BitwiseAndExpression)*;

OpBitwiseXor returns OpBinary:
    '^';

BitwiseAndExpression returns Expression:
    EqualityExpression ({BinaryOperation.leftOperand=current} feature=OpBitwiseAnd rightOperand=EqualityExpression)*;

OpBitwiseAnd returns OpBinary:
    '&';

EqualityExpression returns Expression:
    RelationalExpression ({BinaryOperation.leftOperand=current} feature=OpEquality rightOperand=RelationalExpression)*;

OpEquality returns OpBinary:
    '==' | '!=';

RelationalExpression returns Expression:
    BitwiseExpression ({BinaryOperation.leftOperand=current} feature=OpCompare rightOperand=BitwiseExpression)*;

OpCompare returns OpBinary:
    '>=' | '<=' | '>' | '<';

BitwiseExpression returns Expression:
    AdditiveExpression ({BinaryOperation.leftOperand=current} feature=OpBitwise rightOperand=AdditiveExpression)*;

OpBitwise returns OpBinary:
    '<<' | '>>';

AdditiveExpression returns Expression:
    MultiplicativeExpression ({BinaryOperation.leftOperand=current} feature=OpAdd rightOperand=MultiplicativeExpression)*;

OpAdd returns OpBinary:
    '+' | '-';

MultiplicativeExpression returns Expression:
    UnaryOperation ({BinaryOperation.leftOperand=current} feature=OpMulti rightOperand=UnaryOperation)*;

OpMulti returns OpBinary:
    '*' | '/' | '%';

UnaryOperation returns Expression:
    {UnaryOperation} feature=OpUnary operand=UnaryOperation | Literal;

OpUnary returns OpUnary:
    "!" | "-" | "+" | "~";

NamedElementReference returns Expression:
    {NamedElementReference} value=[ConstantOrEnumerationLiteral:QualifiedName];

Literal returns Expression:
    CollectionLiteral | FloatingLiteral | IntegerLiteral | StringLiteral | CharacterLiteral | BooleanLiteral | ParenthesizedExpression | NamedElementReference | BuiltInConstant | BuiltInFunction | KeywordExpression;

ParenthesizedExpression returns Expression:
    {ParenthesizedExpression} '(' expr=Expression ')';

DesignatedInitializer returns Expression:
    {DesignatedInitializer} '.' field=[Field:ValidID] ('=' expr=Expression)?;

CollectionExpression returns Expression:
    Expression | DesignatedInitializer;

CollectionLiteral returns Expression:
    {CollectionLiteral} '{' (elements+=CollectionExpression (',' elements+=CollectionExpression)* )? '}';

IntegerLiteral returns IntegerLiteral:
    {IntegerLiteral} text=INTEGER_LITERAL;

FloatingLiteral returns FloatingLiteral:
    {FloatingLiteral} text=FLOATING_LITERAL;

StringLiteral returns Expression:
    {StringLiteral} value+=STRING+;

CharacterLiteral returns Expression:
    {CharacterLiteral} value=CHAR;

BuiltInConstant returns Expression:
    {BuiltInConstant} '$' name=ID;

BuiltInFunction returns Expression:
    {BuiltInFunction} '$' name=ID '(' argument=Expression? ')';

BooleanLiteral returns Expression:
    {BooleanLiteral} ('false' | isTrue?='true');

KeywordExpression returns Expression:
    {KeywordExpression} name='nullptr';
