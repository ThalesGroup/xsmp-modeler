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
     * A **Catalogue** is a document that defines types.
     * It contains namespaces as a primary ordering mechanism.
     * The names of these namespaces need to be unique within the catalogue.
     */
    'catalogue' name=ValidID
    elements+=Namespace*;

Namespace returns Namespace:
    attributes+=Attribute*
    /**
     * ```c++
     * namespace <name> [::<nested-name>]* { }
     * ```
     *
     * A **Namespace** is a primary ordering mechanism.
     * A **Namespace** may contain other namespaces (nested namespaces), and does typically contain types.
     * In SMDL, namespaces are contained within a **Catalogue** (either directly, or within another namespace in a catalogue).
     * All sub-elements of a namespace (namespaces and types) must have unique names.
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
     * ```c++
     * [public|protected|private] struct <name> { }
     * ```
     *
     * A **Structure** type collects an arbitrary number of **Fields** representing the state of the structure.
     * Within a structure, each field needs to be given a unique name.
     * In order to arrive at semantically correct (data) type definitions, a structure type may not be recursive, i.e. a structure may not have a field that is typed by the structure itself.
     * A structure can also serve as a namespace to define an arbitrary number of **Constants**.
     */
    'struct' name=ValidID
    '{'
        elements+=(Constant|Field)*
    '}';

Class returns Class:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * ```java
     * [public|protected|private] [abstract] class <name> [extends <base>]{ }
     * ```
     *
     * The **Class** metaclass is derived from **Structure**.
     * A **class** may be abstract (attribute **Abstract**), and it may **extend** from a single base class (implementation inheritance), which is represented by the Base link.
     * As the Class metaclass is derived from Structure it can contain constants and fields.
     * Further, it can have arbitrary numbers of properties (Property elements), operations (**Operation** elements), and associations (**Association** elements).
     */
    'class' name=ValidID (/** A single base class to extends from */'extends' base=[Class:QualifiedName])?
    '{'
        elements+=(Constant|Field|Property|Operation|Association)*
    '}';

Exception returns Exception:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * ```java
     * [public|protected|private] [abstract] exception <name> [extends <base>]{ }
     * ```
     *
     * Exception** represents a non-recoverable error that can occur when calling into an **Operation** or **Property** getter/setter (within an **Operation** this is represented by the **RaisedException** links and within a **Property** this is represented by the **GetRaises** and **SetRaises** links, respectively).
     * An Exception can contain constants and fields (from **Structure**) as well as operations, properties and associations (from **Class**). The fields represent the state variables of the exception which carry additional information when the exception is raised.
     * Furthermore, an **Exception** may be **Abstract** (from **Class**), and it may inherit from a single base exception (implementation inheritance), which is represented by the Base link (from **Class**).
     */
    'exception' name=ValidID (/** A single base exception to extends from */'extends' base=[Class:QualifiedName])?
    '{'
        elements+=(Constant|Field|Property|Operation|Association)*
    '}';

Interface returns Interface:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] interface <name> [extends <base> [, <base2>]* ]{ }
     * ```
     *
     * An **Interface** is a reference type that serves as a contract in a loosely coupled architecture. It has the ability to contain constants, properties and operations (from ReferenceType).
     * An **Interface** may inherit from other interfaces (interface inheritance), which is represented via the Base links.
     * Remark : It is strongly recommended to only use value types, references and other interfaces in the properties and operations of an interface (i.e. not to use models). Otherwise, a dependency between a model implementing the interface, and other models referenced by this interface is introduced, which is against the idea of interface-based or component-based design.
     */
    'interface' name=ValidID (/** Interface(s) to inherit from */'extends' base+=[Interface:QualifiedName] (',' base+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Property|Operation)*
    '}';

Model returns Model:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * ```java
     * [public|protected|private] [abstract] model <name> [extends <base>] [implements <interface> [, <interface2>]* ]{ }
     * ```
     *
     * The **Model** metaclass is a component and hence inherits all component mechanisms.
     * These mechanisms allow using various different modelling approaches.
     * For a class-based design, a **Model** may provide a collection of **Field** elements to define its internal state.
     * For scheduling and global events, a **Model** may provide a collection of **EntryPoint** elements that can be registered with the **Scheduler** or **EventManager** services of a Simulation Environment.
     * For an interface-based design, a **Model** may provide (i.e. implement) an arbitrary number of interfaces, which is represented via the **Interface** links.
     * For a component-based design, a **Model** may provide **Container** elements to contain other models (composition), and **Reference** elements to reference other components (aggregation).
     * These components can either be models or services.
     * For an event-based design, a **Model** may support inter-model events via the **EventSink** and **EventSource** elements.
     * For a dataflow-based design, the fields of a **Model** can be tagged as Input or Output fields.
     * In addition, a **Model** may have **Association** elements to express associations to other models or fields of other models.
     */
    'model' name=ValidID (/** A single base model to extends from */'extends' base=[Component:QualifiedName] )?
        (/** Interface(s) to inherit from */'implements' interface+=[Interface:QualifiedName] (',' interface+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Field|Property|Operation|Association|Container|Reference|EntryPoint|EventSink|EventSource)*
    '}';


Service returns Service:
    attributes+=Attribute*
    modifiers+=ClassModifiers*
    /**
     * ```java
     * [public|protected|private] [abstract] model <name> [extends <base>] [implements <interface> [, <interface2>]* ]{ }
     * ```
     *
     * The Service metaclass is a component and hence inherits all component mechanisms.
     * A Service can reference one or more interfaces via the **Interface** links (inherited from Component), where at least one of them must be derived from Smp::IService, which qualifies it as a service interface.
     */
    'service' name=ValidID (/** A single base service to extends from */'extends' base=[Component:QualifiedName] )?
        (/** Interface(s) to inherit from */'implements' interface+=[Interface:QualifiedName] (',' interface+=[Interface:QualifiedName])*)?
    '{'
        elements+=(Constant|Field|Property|Operation|Association|Container|Reference|EntryPoint|EventSink|EventSource)*
    '}';

ArrayType returns ArrayType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] array <name> = <item-type> [ <size> ]
     * ```
     *
     * An **Array** type defines a fixed-size array of identically typed elements, where ItemType defines the type of the array items, and Size defines the number of array items.
     * Multi-dimensional arrays are defined when ItemType is an **Array** type as well.
     * Dynamic arrays are not supported by SMDL, as they are not supported by some potential target platforms, and introduce various difficulties in memory management.
     * Remarks : Nevertheless, specific mechanisms are available to allow dynamic collections of components, either for containment (composition) or references (aggregation).
     */
    'array' name=ValidID '=' itemType=[ValueType:QualifiedName] '[' size=Expression? ']';

ValueReference returns ValueReference:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```c++
     * [public|protected|private] using <name> = <type>*
     * ```
     *
     * A **ValueReference** is a type that references a specific value type. It is the "missing link" between value types and reference types.
     */
    'using' name=ValidID '=' type=[ValueType:QualifiedName] '*';

Integer returns Integer:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] integer <name> [extends <integeral-type>] [in (*|<minimum>) ... (*|<maximum>)]
     * ```
     *
     * An **Integer** type represents integer values with a given range of valid values (via the Minimum and Maximum attributes).
     * The Unit element can hold a physical unit that can be used by applications to ensure physical unit integrity across models.
     * Optionally, the **PrimitiveType** used to encode the integer value may be specified (one of **Int8**, **Int16**, **Int32**, **Int64**, **UIn8**, **UInt16**, **UInt32**, **UInt64**, where the default is **Int32**).	
     */
    'integer' name=ValidID (/** The Integral type to inherit from */'extends' primitiveType=[PrimitiveType:QualifiedName] )?
    (/** The integer range */'in' (minimum=Expression | '*' )'...' (maximum=Expression | '*' ))?;

Float returns Float:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] float <name> [extends <floating-type>] [in (*|<minimum>) (...|..<|<..|<.<) (*|<maximum>)]
     * ```
     *
     * A **Float** type represents floating-point values with a given range of valid values (via the Minimum and Maximum attributes).
     * The MinInclusive and MaxInclusive attributes determine whether the boundaries are included in the range or not.
     * The Unit element can hold a physical unit that can be used by applications to ensure physical unit integrity across models.
     * Optionally, the **PrimitiveType** used to encode the floating-point value may be specified (one of **Float32** or **Float64**, where the default is **Float64**).
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
     * ```java
     * [public|protected|private] event <name> [extends <simple-type>]
     * ```
     *
     * An **Event** Type is used to specify the type of an event.
     * This can be used not only to give a meaningful name to an event type, but also to link it to an existing simple type (via the EventArgs attribute) that is passed as an argument with every invocation of the event.
     */
    'event' name=ValidID (/** The event argument type */ 'extends' eventArgs=[SimpleType:QualifiedName])?;

StringType returns StringType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] string <name> [<length>]
     * ```
     *
     * A **String** type represents fixed Length string values base on **Char8**.
     * The **String** language element defines an **Array** of **Char8** values, but allows a more natural handling of it, e.g. by storing a string value as one string, not as an array of individual characters.
     * As with arrays, SMDL does not allow defining variable-sized strings, as these have the same problems as dynamic arrays (e.g. their size is not know up-front, and their use requires memory allocation).
     */
    'string' name=ValidID '[' length=Expression? ']';

PrimitiveType returns PrimitiveType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] primitive <name>
     * ```
     *
     * A pre-defined type needed in order to bootstrap the type system.
     *
     * These pre-defined value types are represented by instances of the metaclass **PrimitiveType**.
     * This mechanism is only used in order to bootstrap the type system and may not be used to define new types for modelling.
     * This is an important restriction, as all values of primitive types may be held in a **SimpleValue**.
     * The metaclasses derived from **SimpleValue**, however, are pre-defined and cannot be extended.
     */
    'primitive' name=ValidID;

NativeType returns NativeType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] native <name>
     * ```		
     *
     * A **Native** Type specifies a type with any number of platform mappings. It is used to anchor existing or user-defined types into different target platforms.
     * This mechanism is used within the specification to define the SMDL primitive types with respect to the Metamodel, but it can also be used to define native types within an arbitrary SMDL catalogue for use by models.
     * In the latter case, native types are typically used to bind a model to some external library or existing Application Programming **Interface** (API).	
     */
    'native' name=ValidID;

AttributeType returns AttributeType:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] attribute <name> [= <default-value>]
     * ```
     *
     * An **Attribute** Type defines a new type available for adding attributes to elements.
     * The AllowMultiple attribute specifies if a corresponding Attribute may be attached more than once to a language element, while the Usage element defines to which language elements attributes of this type can be attached.
     * An attribute type always references a value type, and can optionally specify a Default value.
     */
    'attribute' type=[ValueType:QualifiedName] name=ValidID ('=' default=Expression )?;

Enumeration returns Enumeration:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] enum <name> { <literal-name> = <value> [, <literal-name2> = <value2>]* }
     * ```
     *
     * An **Enumeration** type represents one of a number of pre-defined enumeration literals.
     * The Enumeration language element can be used to create user-defined enumeration types.
     * An enumeration must always contain at least one EnumerationLiteral, each having a name and an integer Value attached to it.
     * All enumeration literals of an enumeration type must have unique names and values, respectively.
     */
    'enum' name=ValidID '{' (literal+=EnumerationLiteral (',' literal+=EnumerationLiteral)* ','? )? '}';

EnumerationLiteral returns EnumerationLiteral:
    attributes+=Attribute*
    name=ValidID '=' value=Expression;

Constant returns Constant:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] constant <simple-type> <name> = <value>
     * ```
     *
     * A **Constant** is a feature that is typed by a simple type and that must have a Value.
     */
    'constant' type=[SimpleType:QualifiedName] name=ValidID ('=' value=Expression )?;

Field returns Field:
    attributes+=Attribute*
    modifiers+=FieldModifiers*
    /**
     * ```java
     * [public|protected|private] [input|output|transient] field <type> <name> [= <default-value>]
     * ```
     *
     * A **Field** is a feature that is typed by any value type but String8, and that may have a Default value.
     * The transient attribute defines how the field is published to the simulation environment.
     * Only non transient fields are stored using external persistence.
     * The visibility to the user within the simulation environment can be controlled via the standard SMP attribute "View".
     * By default, a field is not transient and the View attribute defaults to "None" when not applied.
     * The Input and Output attributes define whether the field value is an input for internal calculations (i.e. needed in order to perform these calculations), or an output of internal calculations (i.e. modified when performing these calculations).
     * These flags default to false, but can be changed from their default value to support dataflow-based design.
     */
    'field' type=[ValueType:QualifiedName] name=ValidID ('=' default=Expression)?;

Property returns Property:
    attributes+=Attribute*
    modifiers+=PropertyModifiers*
    /**
     * ```java
     * [public|protected|private] [readOnly|writeOnly|readWrite] property <type> <name>
     * [get throws <exception> [, <exception2>]* ]
     * [set throws <exception> [, <exception2>]* ]
     * [-> <attached-field>]
     * ```
     *
     * A **Property** has a similar syntax as a Field: It is a feature that references a language type.
     * However, the semantics is different in that a property does not represent a state and that it can be assigned an Access attribute to specify how the property can be accessed (either readWrite, readOnly, or writeOnly, see **AccessKind**).
     * Furthermore, a property can be assigned a **Category** attribute to help grouping the properties within its owning type, and a property may specify an arbitrary number of exceptions that it can raise in its getter (**GetRaises**) and/or setter (**SetRaises**).
     * Remark : The category can be used in applications as ordering or filtering criterion, for example in a property grid. The term "property" used here closely corresponds in its semantics to the same term in the Java Beans specification and in the Microsoft .NET framework.
     * That is, a property formally represents a "getter" or a "setter" operation or both which allow accessing state or configuration information (or derived information thereof) in a controlled way and which can also be exposed via interfaces (in contrast to fields).
     */
    'property' type=[ValueType:QualifiedName] name=ValidID
    ('get' 'throws' getRaises+=[Exception:QualifiedName] (',' getRaises+=[Exception:QualifiedName] )*)?
    ('set' 'throws' setRaises+=[Exception:QualifiedName] (',' setRaises+=[Exception:QualifiedName] )*)?
    ('->' attachedField=[Field:QualifiedName])?;

Operation returns Operation:
    attributes+=Attribute*
    modifiers+=VisibilityModifiers*
    /**
     * ```java
     * [public|protected|private] def (<return-type> [<return-type-name>] | void) <name> (...)
     * [throws <exception> [, <exception2>]* ]
     * ```
     *
     * An **Operation** may have an arbitrary number of parameters, where at most one return parameter.
     * If such a parameter is absent, the operation is a void function (procedure) without return value.
     * An **RaisedException** may specify an arbitrary number of exceptions that it can raise (**RaisedException**).
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
     * ```java
     * [public|protected|private] association <type> <name> [= <default-value>]
     * ```
     *
     * An **Association** is a feature that is typed by a language type (Type link). An association always expresses a reference to an instance of the referenced language type.
     * This reference is either another model (if the Type link refers to a **Model** or **Interface**), or it is a field contained in another model (if the Type link refers to a ValueType).
     */
    'association' type=[LanguageType:QualifiedName] name=ValidID;


Container returns Container:
    attributes+=Attribute*
    /**
     * ```java
     * container <type> [<multiplicity>] <name> [= <default-component>]
     * ```
     * ### multiplicity
     *  - `?`: optional element (0 or 1)
     *  - `[]`: 0 to infinitite
     *  - `[<value>]`: exactly **value** element(s)
     *  - `[<min> ... *]`: at least **min** element(s)
     *  - `[<min> ... <max>]`: between **min** and **max** element(s)
     *
     * A **Container** defines the rules of composition (containment of children) for a Component.
     * The type of components that can be contained is specified via the Type link.
     * The Lower and Upper attributes specify the multiplicity, i.e. the number of possibly stored components.
     * Therein the upper bound may be unlimited, which is represented by Upper=-1.
     * Furthermore, a container may specify a default implementation of the container type via the DefaultComponentl link.
     * Remark : SMDL support tools may use this during instantiation (i.e. during model integration) to select an initial implementation for newly created contained components.
     */
    'container' type=[ReferenceType:QualifiedName] MultiplicityDeclaration name=ValidID ('=' defaultComponent=[Component:QualifiedName])?;

Reference returns Reference:
    attributes+=Attribute*
    /**
     * ```java
     * reference <type> [<multiplicity>] <name>
     * ```
     * ### multiplicity
     *  - `?`: optional element (0 or 1)
     *  - `[]`: any number of elements
     *  - `[<number>]`: exactly **number** element(s)
     *  - `[<lower> ... *]`: at least **lower** element(s)
     *  - `[<lower> ... <upper>]`: between **lower** and **upper** element(s)
     *
     * A **Reference** defines the rules of aggregation (links to components) for a **Component**.
     * The type of components (models or services) that can be referenced is specified by the **Interface** link.
     * Thereby, a service reference is characterized by an interface that is derived from `Smp::IService`.
     * The Lower and Upper attributes specify the multiplicity, i.e. the number of possibly held references to components implementing this interface.
     * Therein the upper bound may be unlimited, which is represented by Upper=-1.
     */
    'reference' interface=[Interface:QualifiedName] MultiplicityDeclaration name=ValidID;

fragment MultiplicityDeclaration:
    optional?='?' | multiplicity=Multiplicity?;

Multiplicity returns Multiplicity:
    {Multiplicity} '[' ((lower=Expression ('...' (aux?='*' | upper=Expression))? ) | aux?='+' | '*' )?']';

EntryPoint returns EntryPoint:
    attributes+=Attribute*
    /**
     * ```java
     * entrypoint <name>
     * ```
     *
     * An **EntryPoint** is a named element of a **Component** (**Model** or **Service**).
     * It corresponds to a void operation taking no parameters that can be called from an external client (e.g. the Scheduler or Event Manager services).
     * An Entry Point can reference both Input fields (which must have their Input attribute set to true) and Output fields (which must have their Output attribute set to true).
     * These links can be used to ensure that all component output fields are updated before the entry point is called, or that all input fields can be used after the entry point has been called.	
     */
    'entrypoint' name=ValidID ('{' ('in' input+=[Field:QualifiedName] | 'out' output+=[Field:QualifiedName])*'}')?;

EventSink returns EventSink:
    attributes+=Attribute*
    /**
     * ```java
     * eventsink <type> <name>
     * ```
     *
     * An **EventSink** is used to specify that a **Component** can receive a specific event using a given name. An **EventSink** can be connected to any number of **EventSource** instances.	
     */
    'eventsink' type=[EventType:QualifiedName] name=ValidID;

EventSource returns EventSource:
    attributes+=Attribute*
    /**
     * ```java
     * eventsource <type> <name>
     * ```
     *
     * An **EventSource** is used to specify that a **Component** publishes a specific event under a given name.
     * The Multicast attribute can be used to specify whether any number of sinks can connect to the source (the default), or only a single sink can connect (**Multicast=false**).
     * Remark: A tool for model integration can use the **Multicast** attribute to configure the user interface accordingly to ease the specification of event links.
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



