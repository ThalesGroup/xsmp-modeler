# XSMP Catalogue (`.xsmpcat`)

Catalogue files define the type system and the reusable model building blocks of an XSMP project. They are the foundation used by configuration files, assemblies, link bases and schedules.

This page is a user-oriented reference for the catalogue grammar. It focuses on what you can write, which parts are optional, and which metadata tags are recognized by XSMP exports.

## File structure

A catalogue file starts with one catalogue declaration:

```text
catalogue <name>
```

and is followed by zero or more namespace declarations:

```xsmp
catalogue foundation_catalogue

namespace demo::foundation
{
}
```

## Documentation comments and metadata tags

Catalogue documents can be preceded by a documentation comment. In addition to normal descriptive text, the following root-level tags are recognized when exporting SMP artifacts:

- `@title`
- `@date`
- `@creator`
- `@version`

Example:

```xsmp
/**
 * Foundation catalogue.
 * @title Foundation Catalogue
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
catalogue foundation_catalogue
```

Most catalogue elements can be preceded by a documentation comment:

```xsmp
/**
 * Human-readable description.
 */
public struct ThermalLoop
{
}
```

These comments are used for:

- displayed descriptions
- generated documentation
- exported SMP metadata

### Common tags

#### `@uuid`

All catalogue type declarations are expected to define a UUID:

```xsmp
/** @uuid 8ea6f3c1-8c70-4fdf-9c4d-f9781fa8a101 */
public enum Mode
{
    Standby = 0,
    Nominal = 1
}
```

This applies to:

- `struct`
- `class`
- `exception`
- `interface`
- `model`
- `service`
- `array`
- `using`
- `integer`
- `float`
- `event`
- `string`
- `primitive`
- `native`
- `attribute`
- `enum`

In practice:

- the tag exists
- the value is a valid UUID
- the UUID is unique across visible types

#### `@deprecated`

Marks a declaration as deprecated:

```xsmp
/**
 * @deprecated Use `NominalMode` instead.
 */
public constant Smp.Int32 LegacyMode = 1
```

#### `@id`

Provides an explicit SMP identifier for a named element:

```xsmp
/**
 * @id demo.foundation.Mode
 * @uuid 8ea6f3c1-8c70-4fdf-9c4d-f9781fa8a101
 */
public enum Mode
{
    Standby = 0,
    Nominal = 1
}
```

If omitted, exported SMP identifiers are derived from the declaration name.

### Tags for specific declarations

#### Attribute type tags

Attribute types support:

- `@usage <type-name>`: restricts where an attribute may be attached
- `@allowMultiple`: allows multiple uses of the same attribute type on one target

Example:

```xsmp
/**
 * @uuid 13e42b4a-3d10-4c28-b449-8dfd7d7ad706
 * @usage Field
 * @usage Property
 * @allowMultiple
 */
public attribute Smp.String8 category = "telemetry"
```

#### Property tags

Properties support:

- `@category <text>`

Example:

```xsmp
/**
 * @category telemetry
 */
public property demo.foundation.Mode mode
```

#### Integer and float tags

Integer and float type declarations support:

- `@unit <text>`

Example:

```xsmp
/**
 * @uuid f72ad1d4-a120-4206-a283-c111d4bbdc9d
 * @unit degC
 */
public float TemperatureC extends Smp.Float32 in -120.0 ... 180.0
```

#### Native type tags

Native types support:

- `@type <c++-type>`: required for C++-oriented generation
- `@namespace <c++-namespace>`: optional
- `@location <header-or-location>`: optional

Example:

```xsmp
/**
 * @uuid 7d0c4f6d-f7ec-4f7c-b7f0-11486895d4f3
 * @type FILE_HANDLE
 * @namespace platform
 * @location platform/file_handle.hpp
 */
public native FileHandle
```

#### Event source tags

Event sources are multicast by default. Add `@singlecast` to document a singlecast publication:

```xsmp
/**
 * @singlecast
 */
eventsource demo.foundation.ModeEvent publishedMode
```

## Attributes

User-defined attributes are applied with `@` syntax:

```text
@<attribute-type>
@<attribute-type>(<value>)
```

Required:

- one attribute type reference

Optional:

- one argument value in parentheses

Behavior:

- the attribute type defines which value type is accepted
- a default value on the attribute type lets you omit the argument

Examples:

```xsmp
@demo.foundation.category("telemetry")
public field Smp.Float64 busVoltage
```

```xsmp
@demo.foundation.version
public struct ThermalLoop
{
}
```

If an attribute type defines a default value, `@Type` may omit the argument. Otherwise a value is expected.

## Namespaces

The namespace syntax is:

```text
namespace <name> [::<nested-name>]* { ... }
```

Required:

- `namespace`
- at least one namespace segment
- one block body

Optional:

- nested `::` segments

Behavior:

- namespaces organize declarations by qualified name
- nested namespaces extend the full qualified name of contained types

Examples:

```xsmp
namespace demo::foundation
{
    public enum Mode
    {
        Standby = 0,
        Nominal = 1
    }
}
```

```xsmp
namespace demo::orbit::power
{
}
```

Namespaces may contain:

- nested namespaces
- type declarations

## Type declarations

Every type declaration may start with:

- zero or more attributes
- an optional visibility modifier where allowed
- an optional `/** ... */` documentation comment

The following sections show the exact user-facing forms and indicate which parts are optional.

### `struct`

A **Structure** defines a pure value type that groups several fields into one typed value object.

Syntax:

```text
[visibility] struct <name>
{
    <constant-or-field>*
}
```

Required:

- `struct`
- the type name

Optional:

- `public`, `protected` or `private`
- any number of leading attributes
- documentation comment

Example:

```xsmp
/**
 * Temperature and pressure values captured in one sample.
 * @uuid 9e1184cb-778c-4dd2-9469-e7677f0e6eb1
 */
public struct ThermalLoop
{
    field Smp.Float64 temperature
    field Smp.Float64 pressure
}
```

### `class`

A **Class** defines a reusable behavior-oriented type with inheritance, operations, properties and associations.

Syntax:

```text
[visibility] [abstract] class <name> [extends <base-class>]
{
    <constant-or-field-or-property-or-operation-or-association>*
}
```

Required:

- `class`
- the type name

Optional:

- visibility
- `abstract`
- `extends <base-class>`

Example:

```xsmp
/**
 * Shared alarm behavior.
 * @uuid 98a4c2b5-8837-4f6e-b849-9a5be9bba891
 */
public abstract class BaseAlarm extends demo.foundation.AlarmData
{
    field Smp.String8 message
    def void acknowledge()
}
```

### `exception`

An **Exception** defines an error payload type that operations and properties may raise.

Syntax:

```text
[visibility] [abstract] exception <name> [extends <base-exception>]
{
    <constant-or-field-or-property-or-operation-or-association>*
}
```

Required:

- `exception`
- the type name

Optional:

- visibility
- `abstract`
- `extends <base-exception>`

Example:

```xsmp
/**
 * Raised when a mode transition is invalid.
 * @uuid 6d134d7b-99c2-467a-a4dd-f0328c94b236
 */
public exception InvalidMode extends demo.foundation.BaseError
{
    field Smp.String8 reason
}
```

### `interface`

An **Interface** defines a published contract that components can implement and other components can reference.

Syntax:

```text
[visibility] interface <name> [extends <base-interface>[, <base-interface>]*]
{
    <constant-or-property-or-operation>*
}
```

Required:

- `interface`
- the type name

Optional:

- visibility
- `extends ...`

Examples:

```xsmp
/**
 * Common command interface.
 * @uuid 4f9f0c09-1a58-451d-b67f-3490c4080eaf
 */
public interface ICommandable
{
    property demo.foundation.Mode mode
    def void apply(in demo.foundation.Mode requestedMode)
}
```

```xsmp
/**
 * Extended command interface.
 * @uuid 301b875b-78cb-486e-9219-3b4f5d31c17d
 */
public interface IManagedCommandable extends demo.foundation.ICommandable, demo.foundation.IHealthAware
{
    def void reset()
}
```

### `model`

A **Model** defines a simulation component that can own state, behavior, publications, entry points, containers and references.

Syntax:

```text
[visibility] [abstract] model <name>
    [extends <base-model>]
    [implements <interface>[, <interface>]*]
{
    <constant-or-field-or-property-or-operation-or-association-or-container-or-reference-or-entrypoint-or-eventsink-or-eventsource>*
}
```

Required:

- `model`
- the type name

Optional:

- visibility
- `abstract`
- `extends <base-model>`
- `implements <interface>, ...`

Examples:

```xsmp
/**
 * Avionics unit model.
 * @uuid d5b324db-ffda-437e-9f0f-9649d4bf8b54
 */
public model AvionicsUnit implements demo.foundation.ICommandable
{
    field demo.foundation.Mode modeState
    public property demo.foundation.Mode mode -> modeState
    entrypoint step
}
```

```xsmp
/**
 * Specialized avionics implementation.
 * @uuid 9bf52d38-d552-4916-9cdf-685e328fb1c2
 */
public model ManagedAvionics extends demo.avionics.AvionicsUnit implements demo.foundation.IHealthAware, demo.foundation.IManaged
{
    reference demo.foundation.ILogger? logger
}
```

### `service`

A **Service** defines a component-like type usually used for simulator infrastructure or environment capabilities shared with models.

Syntax:

```text
[visibility] [abstract] service <name>
    [extends <base-service>]
    [implements <interface>[, <interface>]*]
{
    <constant-or-field-or-property-or-operation-or-association-or-container-or-reference-or-entrypoint-or-eventsink-or-eventsource>*
}
```

Required:

- `service`
- the type name

Optional:

- visibility
- `abstract`
- `extends <base-service>`
- `implements <interface>, ...`

Examples:

```xsmp
/**
 * Event manager service.
 * @uuid 7f429bc1-d33a-49ea-95a6-af602e7c6a42
 */
public service EventManager implements Smp.IService
{
}
```

```xsmp
/**
 * Environment service with inheritance.
 * @uuid 0fa2625f-33dd-4b75-9f76-f234708d3551
 */
public abstract service ManagedEventManager extends demo.foundation.EventManager implements demo.foundation.IHealthAware
{
}
```

### `array`

An **Array Type** defines one fixed-size value collection type.

Syntax:

```text
[visibility] array <name> = <item-type>[<size>]
```

Required:

- `array`
- the type name
- the item type
- the size expression inside `[...]`

Optional:

- visibility

Example:

```xsmp
/**
 * @uuid be0f2e6f-41b3-49c0-b61f-77e99d844e37
 */
public array FloatSamples = Smp.Float32[16]
```

### `using`

A **Value Reference Type** defines a reference to another value type, not a generic type alias.

Syntax:

```text
[visibility] using <name> = <value-type>*
```

Required:

- `using`
- the type name
- the pointed value type

Optional:

- visibility

It is not a generic type alias mechanism. In XSMP Catalogue, `using` specifically declares a reference-to-value type.

Example:

```xsmp
/**
 * @uuid 9314789a-f34e-4145-9021-970391d4bc9d
 */
public using VoltageRef = demo.foundation.Voltage*
```

### `integer`

An **Integer Type** defines a constrained integer value type, optionally bound to a primitive storage type and a numeric range.

Syntax:

```text
[visibility] integer <name> [extends <primitive>] [in <minimum> ... <maximum>]
```

Required:

- `integer`
- the type name

Optional:

- visibility
- `extends <primitive>`
- `in ...`

Notes:

- `*` may be used as an unbounded minimum or maximum
- the range must remain compatible with the chosen primitive type

Example:

```xsmp
/**
 * @uuid 1244a41e-91d7-4ceb-a5ef-72b9155f091d
 * @unit percent
 */
public integer Percentage extends Smp.UInt8 in 0 ... 100
```

### `float`

A **Floating-Point Type** defines a constrained floating-point value type with an optional primitive storage type and optional bounds.

Syntax:

```text
[visibility] float <name>
    [extends <primitive>]
    [in <minimum> <range-kind> <maximum>]
```

Range kinds:

- `...` inclusive / inclusive
- `..<` inclusive / exclusive
- `<..` exclusive / inclusive
- `<.<` exclusive / exclusive

Required:

- `float`
- the type name

Optional:

- visibility
- `extends <primitive>`
- `in ...`

Example:

```xsmp
/**
 * @uuid f72ad1d4-a120-4206-a283-c111d4bbdc9d
 * @unit degC
 */
public float TemperatureC extends Smp.Float32 in -120.0 ... 180.0
```

### `event`

An **Event Type** defines the payload type carried by event sinks and event sources.

Syntax:

```text
[visibility] event <name> [extends <simple-type>]
```

Required:

- `event`
- the type name

Optional:

- visibility
- payload type via `extends`

Example:

```xsmp
/**
 * @uuid c03fa653-d1e2-478d-a973-d6d9e6d7a3cd
 */
public event ModeEvent extends demo.foundation.Mode
```

### `string`

A **String Type** defines a bounded textual value type with an explicit maximum length.

Syntax:

```text
[visibility] string <name>[<length>]
```

Required:

- `string`
- the type name
- the length expression inside brackets

Optional:

- visibility

Example:

```xsmp
/**
 * @uuid 7d04df36-c146-4ed3-b56c-7bb2b5eb7a45
 */
public string Label[32]
```

### `primitive`

A **Primitive Type** defines one low-level built-in value type used as a base for other simple types.

Syntax:

```text
[visibility] primitive <name>
```

Required:

- `primitive`
- the type name

Optional:

- visibility

Example:

```xsmp
/**
 * @uuid 52756eb5-b8a5-49a1-b7e0-280bc2baf977
 */
primitive Float64
```

### `native`

A **Native Type** binds the model to an external platform-specific type, typically for generated code integration.

Syntax:

```text
[visibility] native <name>
```

Required:

- `native`
- the type name

Optional:

- visibility
- `@type`, `@namespace`, `@location` metadata in the documentation comment

Example:

```xsmp
/**
 * @uuid 7d0c4f6d-f7ec-4f7c-b7f0-11486895d4f3
 * @type FILE_HANDLE
 * @namespace platform
 * @location platform/file_handle.hpp
 */
public native FileHandle
```

### `attribute`

An **Attribute Type** defines a typed metadata annotation that can later be applied with `@...`.

Syntax:

```text
[visibility] attribute <value-type> <name> [= <default-value>]
```

Required:

- `attribute`
- the attribute value type
- the attribute type name

Optional:

- visibility
- default value
- `@usage` and `@allowMultiple` metadata

Example:

```xsmp
/**
 * @uuid 13e42b4a-3d10-4c28-b449-8dfd7d7ad706
 * @usage Field
 * @usage Property
 */
public attribute Smp.String8 category = "telemetry"
```

### `enum`

An **Enumeration** defines one named set of integer-backed literals.

Syntax:

```text
[visibility] enum <name>
{
    <literal> = <value>[, ...]
}
```

Required:

- `enum`
- the type name

Optional:

- visibility
- trailing comma

Example:

```xsmp
/**
 * @uuid 8ea6f3c1-8c70-4fdf-9c4d-f9781fa8a101
 */
public enum Mode
{
    Standby = 0,
    Nominal = 1,
    Safe = 2
}
```

## Members inside classifiers

The following members can appear inside different classifier kinds.

### `constant`

A **Constant** defines one named immutable value published by a type.

Syntax:

```text
[visibility] constant <simple-type> <name> = <value>
```

Required:

- `constant`
- one simple type
- one name
- `=`
- one value

Optional:

- visibility

Behavior:

- constants are immutable named values published by the enclosing classifier

Example:

```xsmp
public constant Smp.Float64 StandardGravity = 9.80665
```

Allowed in:

- `struct`
- `class`
- `exception`
- `interface`
- `model`
- `service`

### `field`

A **Field** defines stored or published state on a type, optionally marked as input, output or transient.

Syntax:

```text
[visibility] [input] [output] [transient] field <value-type> <name> [= <default-value>]
```

Required:

- `field`
- the field type
- the field name

Optional:

- visibility
- `input`
- `output`
- `transient`
- default value

Example:

```xsmp
output field demo.foundation.Vector3 estimatedRates
```

Allowed in:

- `struct`
- `class`
- `exception`
- `model`
- `service`

### `property`

A **Property** defines controlled access to a value through getter/setter semantics instead of direct field access.

Syntax:

```text
[visibility] [readOnly|writeOnly|readWrite] property <value-type> <name>
    ['get' 'throws' <exception>[, <exception>]*]
    ['set' 'throws' <exception>[, <exception>]*]
    ['->' <attached-field>]
```

Required:

- `property`
- the property type
- the property name

Optional:

- visibility
- one access modifier
- `get throws ...`
- `set throws ...`
- `-> <field>`
- `@category` metadata

Example:

```xsmp
/**
 * @category telemetry
 */
public readOnly property demo.foundation.Mode mode get throws demo.foundation.InvalidMode -> modeState
```

Allowed in:

- `class`
- `exception`
- `interface`
- `model`
- `service`

### `def`

An **Operation** defines callable behavior, with optional parameters, return value and raised exceptions.

Syntax:

```text
[visibility] def (<return-type> | <return-type> <return-name> | void) <name>(
    [<parameter>[, <parameter>]*]
) [throws <exception>[, <exception>]*]
```

Parameter syntax:

```text
[in|out|inout] <type> <name> [= <default-value>]
```

Required:

- `def`
- `void` or a return type
- the operation name
- parentheses

Optional:

- visibility
- named return parameter
- parameters
- default parameter values
- `throws ...`

Example without return value:

```xsmp
public def void apply(in demo.foundation.Mode requestedMode) throws demo.foundation.InvalidMode
```

Example with an unnamed return parameter:

```xsmp
public def demo.foundation.Mode readMode()
```

Example with a named return parameter:

```xsmp
public def demo.foundation.Mode resultingMode readBackMode(in demo.foundation.Mode requestedMode)
```

Allowed in:

- `class`
- `exception`
- `interface`
- `model`
- `service`

### `association`

An **Association** expresses a typed semantic relation without using component containment or reference publication.

Syntax:

```text
[visibility] association <language-type> <name>
```

Required:

- `association`
- one language type
- one name

Optional:

- visibility

Behavior:

- associations express semantic relationships without creating ownership or interface publication

Example:

```xsmp
public association demo.foundation.Mode requestedMode
```

Allowed in:

- `class`
- `exception`
- `model`
- `service`

### `container`

A **Container** defines a child-component slot inside a model or service, optionally with multiplicity and a default implementation.

Syntax:

```text
container <reference-type>[<multiplicity>] <name> [= <default-component>]
```

Multiplicity forms:

```text
?
*
+
[<value>]
[<lower>...<upper>]
[<lower>...*]
```

Required:

- `container`
- the reference type
- the container name

Optional:

- multiplicity
- `= <default-component>`

Behavior:

- omitting multiplicity means exactly one occurrence
- `?` means zero or one occurrence
- `*` means zero or more occurrences
- `+` means one or more occurrences
- `[<lower>...<upper>]` defines explicit lower and upper bounds
- `[<lower>...*]` defines an explicit lower bound with no upper bound
- `[<value>]` defines one fixed cardinality, not a lower bound

Examples:

Optional child:

```xsmp
container demo.payload.Sensor? sensor
```

Zero or more children:

```xsmp
container demo.payload.Sensor* sensors
```

One or more children:

```xsmp
container demo.payload.Sensor+ sensors
```

Bounded range:

```xsmp
container demo.payload.Sensor[1...4] sensors
```

Fixed number of children:

```xsmp
container demo.payload.Sensor[2] sensorPair
```

At least three children:

```xsmp
container demo.payload.Sensor[3...*] sensors
```

Example:

```xsmp
container demo.payload.Sensor[1...4] sensors = demo.payload.BasicSensor
```

Allowed in:

- `model`
- `service`

### `reference`

A **Reference** defines an aggregation point through which a component connects to external components via interfaces.

Syntax:

```text
reference <interface>[<multiplicity>] <name>
```

Required:

- `reference`
- the interface type
- the reference name

Optional:

- multiplicity

Behavior:

- omitting multiplicity means exactly one target
- `?` means zero or one target
- `*` means zero or more targets
- `+` means one or more targets
- `[<lower>...<upper>]` defines explicit lower and upper bounds
- `[<lower>...*]` defines an explicit lower bound with no upper bound
- `[<value>]` defines one fixed number of targets, not a lower bound

Examples:

Optional reference:

```xsmp
reference demo.foundation.ILogger? logger
```

Zero or more references:

```xsmp
reference demo.foundation.ILogger* loggers
```

One or more references:

```xsmp
reference demo.foundation.ILogger+ loggers
```

Bounded range:

```xsmp
reference demo.foundation.ILogger[1...4] loggers
```

Fixed number of references:

```xsmp
reference demo.foundation.ILogger[2] loggers
```

At least three references:

```xsmp
reference demo.foundation.ILogger[3...*] loggers
```

Example:

```xsmp
reference demo.foundation.ILogger? logger
```

Allowed in:

- `model`
- `service`

### `entrypoint`

An **Entry Point** defines one triggerable activity that schedules or event subscriptions can execute.

Syntax:

```text
entrypoint <name>
entrypoint <name>
{
    [in <field> ...]
    [out <field> ...]
}
```

Required:

- `entrypoint`
- the name

Optional:

- body
- `in` field list
- `out` field list

Example:

```xsmp
entrypoint step
{
    in commandedMode
    out publishedMode
}
```

Allowed in:

- `model`
- `service`

### `eventsink`

An **Event Sink** defines one incoming event publication point on a component.

Syntax:

```text
eventsink <event-type> <name>
```

Required:

- `eventsink`
- one event type
- one name

Optional:

- no additional syntax

Behavior:

- an event sink receives events published by compatible event sources or event links

Example:

```xsmp
eventsink demo.foundation.ModeEvent commandedMode
```

Allowed in:

- `model`
- `service`

### `eventsource`

An **Event Source** defines one outgoing event publication point on a component.

Syntax:

```text
eventsource <event-type> <name>
```

Required:

- `eventsource`
- one event type
- one name

Optional:

- `@singlecast` metadata in the documentation comment

Behavior:

- an event source publishes events to connected sinks
- `@singlecast` documents that at most one effective receiver is expected

Example:

```xsmp
/**
 * @singlecast
 */
eventsource demo.foundation.ModeEvent publishedMode
```

Allowed in:

- `model`
- `service`

## Expressions and literals

Catalogue expressions are used in:

- constant values
- field defaults
- attribute defaults
- enumeration literal values
- parameter default values
- integer and float ranges
- array sizes
- string lengths

Supported expression families include:

- boolean, integer, floating, string and character literals
- enumeration literals
- constant references
- arithmetic operators
- logical operators
- bitwise operators
- comparison operators
- parentheses
- collection literals
- designated initializers
- built-in constants and built-in functions prefixed with `$`
- `nullptr`

### Numeric literal forms

Catalogue expressions use their own literal syntax.

Integer literals may be written in:

- decimal form:
  - `42`
- hexadecimal form:
  - `0x2A`
- binary form:
  - `0b101010`

Accepted integer literal suffixes are:

- `u`: unsigned integer literal
- `ul` or `lu`: unsigned long integer literal
- `ns`: nanoseconds
- `us`: microseconds
- `ms`: milliseconds
- `s`: seconds
- `mn`: minutes
- `h`: hours
- `d`: days

Examples:

```xsmp
public constant Smp.UInt32 Mask = 0xFFu
public constant Smp.Duration StartupDelay = 10s
public constant Smp.Duration PollingPeriod = 250ms
```

Floating-point literals may be written with:

- a decimal fraction:
  - `3.5`
- an exponent:
  - `1.2e3`
- an optional `f` suffix:
  - `3.5f`

Examples:

```xsmp
public constant Smp.Float64 Calibration = (1.0 + 2.0) / 3.0
```

```xsmp
public field demo.foundation.ThermalLoop loop = {
    temperature = 18.5,
    pressure = 1.0
}
```

## Minimal complete example

```xsmp
catalogue foundation_catalogue

namespace demo::foundation
{
    /**
     * Operating modes.
     * @uuid 8ea6f3c1-8c70-4fdf-9c4d-f9781fa8a101
     */
    public enum Mode
    {
        Standby = 0,
        Nominal = 1,
        Safe = 2
    }

    /**
     * Command contract.
     * @uuid 3b2cbdb0-d53a-43d9-bd15-5f7d7b89d93f
     */
    public interface ICommandable
    {
        property demo.foundation.Mode mode
        def void apply(in demo.foundation.Mode requestedMode)
    }

    /**
     * Component implementation.
     * @uuid d5b324db-ffda-437e-9f0f-9649d4bf8b54
     */
    public model AvionicsUnit implements demo.foundation.ICommandable
    {
        field demo.foundation.Mode modeState = demo.foundation.Mode.Standby
        public property demo.foundation.Mode mode -> modeState
        entrypoint step
        reference demo.foundation.ILogger? logger
    }
}
```
