# XSMP Assembly (`.xsmpasb`)

Assembly files instantiate systems from catalogue types, configure instances and define local links between instantiated components.

This page documents the assembly grammar in detail, including template parameters, instance forms, configuration blocks, links, invocations, values and paths.

## Document comments and metadata

Assembly documents can start with a documentation comment. The following root-level tags are recognized when exporting SMP artifacts:

- `@title`
- `@date`
- `@creator`
- `@version`

Example:

```xsmp
/**
 * Orbital segment assembly.
 * @title Orbital Segment Assembly
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
assembly OrbitalSegment
```

## Root structure

An **Assembly** declares one reusable instantiated system: optional template parameters, optional configuration blocks and exactly one root model instance.

### Syntax

```text
assembly [<template-parameter>[, <template-parameter>]*] <name>
    <configure-block>*
    <root-model-instance>
    <configure-block>*
```

Required:

- `assembly`
- the assembly name
- exactly one root model instance

Optional:

- template parameters
- configuration blocks before the root model instance
- configuration blocks after the root model instance

Example:

```xsmp
assembly <Lane = "Ops"> OrbitalSegment

configure Avionics{Lane}
{
    property mode = demo.foundation.Mode.Nominal
}

Scenario{Lane}: demo.orbit.OrbitalPlatform
{
    avionics += Avionics{Lane}: demo.avionics.AvionicsUnit
}
```

## Template parameters

**Template Parameters** let one assembly definition be reused with different names or numeric settings.

Assemblies support two parameter kinds:

- string parameters
- `int32` parameters

### String parameter syntax

```text
<name>: string
<name>: string = "<value>"
<name> = "<value>"
```

Examples:

```xsmp
<Lane: string>
```

```xsmp
<Lane: string = "Ops">
```

```xsmp
<Lane = "Ops">
```

### `int32` parameter syntax

```text
<name>: int32
<name>: int32 = <integer>
<name> = <integer>
```

Examples:

```xsmp
<Index: int32>
```

```xsmp
<Index: int32 = 1>
```

```xsmp
<Index = 1>
```

## `configure` blocks

A **Configure Block** applies local subscriptions, calls, property updates or field assignments to one named instance in the assembly.

### Syntax

```text
configure <instance-path>
{
    (<subscribe> | <call> | <property> | <field-assignment>)*
}
```

Required:

- `configure`
- one instance path
- one block body

Inside the block you can write:

- global-event subscriptions
- operation calls
- property assignments
- field assignments

Example:

```xsmp
configure Avionics{Lane}
{
    subscribe step -> "PlatformReady"
    property mode = demo.foundation.Mode.Nominal
    call apply(requestedMode = demo.foundation.Mode.Nominal)
}
```

## Global event subscriptions

A **Global Event Subscription** connects one local entry point to one named global event.

### Syntax

```text
subscribe <entrypoint> -> "<global-event-name>"
```

Required:

- `subscribe`
- one local entrypoint reference
- `->`
- one string event name

Example:

```xsmp
subscribe step -> "PlatformReady"
```

## Root model instance

A **Root Model Instance** is the top-level component instantiated by the assembly.

### Syntax

```text
<instance-name> : <component-type-or-string> [ { ... } ]
```

Required:

- the instance name
- `:`
- one implementation

Optional:

- a block body

The implementation is usually a qualified component type such as:

```xsmp
Scenario: demo.orbit.OrbitalPlatform
```

You may also use a quoted implementation name:

```xsmp
Scenario: "legacy.platform.type"
```

The block may contain:

- `subscribe`
- sub-instances
- links
- invocations
- field assignments

## Sub-instances

**Sub-Instances** populate a container of the current model instance with either child model instances or child assembly instances.

### Syntax

```text
<container> += <model-instance-or-assembly-instance>
```

Required:

- one local container reference
- `+=`
- one model instance or assembly instance

Optional:

- `unsafe` on the container reference

Behavior:

- the container determines which child component or assembly types are valid
- the statement adds one occurrence to the selected container

The container reference may be marked `unsafe`:

```xsmp
unsafe payload += PayloadA: PayloadSegment
```

## Sub model instances

A **Sub Model Instance** creates one direct child component inside a container.

### Syntax

```text
<container> += <instance-name> : <component-type-or-string> [ { ... } ]
```

Required:

- the target container
- the instance name
- one implementation

Optional:

- a block body

Behavior:

- the created child is typed against the selected container
- the optional block initializes the child instance locally

Example:

```xsmp
avionics += Avionics{Lane}: demo.avionics.AvionicsUnit
```

## Sub assembly instances

A **Sub Assembly Instance** creates one child from another assembly definition, optionally with template arguments, configuration and a reusable link base.

### Syntax

```text
<container> += <instance-name> : <assembly-name>
    [<template-argument>[, <template-argument>]*]
    ['using' 'config' <configuration-name>]
    ['using' 'link' <link-base-name>]
    [ { <configure-block>* } ]
```

Required:

- the target container
- the instance name
- the referenced assembly name

Optional:

- template arguments
- `using config ...`
- `using link ...`
- inline `configure` blocks

Example:

```xsmp
payload += PayloadA: PayloadSegment<Lane = "A", Index = 1>
using config PayloadNominal
using link PayloadLinks
{
    configure SensorHead
    {
        property mode = demo.foundation.Mode.Nominal
    }
}
```

## Template arguments

**Template Arguments** bind concrete values to the template parameters expected by a referenced assembly.

Assemblies support the same argument kinds as schedules:

- string arguments
- `int32` arguments

Syntax:

```text
<parameter-name> = "<value>"
<parameter-name> = <integer>
```

Required:

- one parameter name
- `=`
- one concrete argument value

Optional:

- additional arguments separated by commas

Behavior:

- each argument is matched by parameter name
- argument types are checked against the referenced assembly template parameters

Examples:

```xsmp
<Lane = "A", Index = 1>
```

## Local links

**Local Links** let an assembly define wiring directly inside instance bodies when links should stay close to instantiation logic.

Assemblies may define local links directly inside model-instance bodies.

### Event link

An **Event Link** connects one event source path to one compatible event sink path.

Syntax:

```text
event link <owner-path> -> <client-path>
```

Required:

- `event link`
- one owner path
- `->`
- one client path

Behavior:

- the owner path must resolve to an event source
- the client path must resolve to a compatible event sink

Example:

```xsmp
event link publishedMode -> child.commandedMode
```

### Field link

A **Field Link** connects one output field path to one compatible input field path.

Syntax:

```text
field link <owner-path> -> <client-path>
```

Required:

- `field link`
- one owner path
- `->`
- one client path

Behavior:

- the owner path must resolve to an output-compatible field
- the client path must resolve to an input-compatible field

Example:

```xsmp
field link power.lineVoltage -> router.incomingBus
```

### Interface link

An **Interface Link** connects one published reference to one client instance, optionally with a back reference on the client side.

Syntax:

```text
interface link <source-path> -> <client-path> [ :<back-reference> ]
```

Required:

- `interface link`
- one source path
- `->`
- one client path

Optional:

- `:<back-reference>`

Important behavior:

- the last segment of `source-path` selects the published reference
- earlier source-path segments navigate to the owner instance
- `back-reference` selects a local reference on the client side

Examples:

```xsmp
interface link logger -> payload
```

```xsmp
interface link nested.logger -> payload:backLogger
```

## Invocations

**Invocations** let an assembly initialize behavior-oriented members instead of only writing raw field values.

Invocations are:

- operation calls
- property assignments

## `call`

A **Call Invocation** invokes one local operation with zero or more named arguments.

### Syntax

```text
call <operation>( [<parameter-name> = <simple-value>[, ...]] )
```

Required:

- `call`
- one local operation reference
- parentheses

Optional:

- named parameters

Example:

```xsmp
call apply(requestedMode = demo.foundation.Mode.Nominal)
```

## `property`

A **Property Invocation** initializes one local property through its setter semantics.

### Syntax

```text
property <property> = <simple-value>
```

Required:

- `property`
- one local property reference
- `=`
- one simple value

Example:

```xsmp
property mode = demo.foundation.Mode.Nominal
```

## Field assignments

**Field Assignments** initialize direct field state either inside an instance body or inside a `configure` block.

### Syntax

```text
<field-path> = <value>
```

These can appear:

- inside model-instance bodies
- inside `configure` blocks

Required:

- one target field path
- `=`
- one value

Optional:

- no extra syntax beyond the target path and value

Behavior:

- the assigned value is checked against the resolved field type

Example:

```xsmp
missionMode = demo.foundation.Mode.Standby
```

## Values

**Assembly Values** group the literal forms accepted in field assignments, property assignments and operation arguments.

Assemblies support:

- simple values
- arrays
- structures

### Simple values

**Simple Values** are the scalar literals accepted in field assignments, property assignments and operation arguments.

Accepted forms include:

- integers with suffixes:
  - `1i8`, `1i16`, `1i32`, `1i64`
  - `1u8`, `1u16`, `1u32`, `1u64`
- plain integers:
  - `1`
- floats with suffixes:
  - `1.0f32`
  - `1.0f64`
- plain floats:
  - `1.0`
- booleans:
  - `true`
  - `false`
- characters
- strings
- enumeration literals:
  - `demo.foundation.Mode.Nominal`
  - `0lit`
- durations:
  - `"PT10S"d`
- datetimes:
  - `"2026-03-27T08:00:00Z"dt`

### Arrays

An **Array Literal** initializes an array-typed value in one expression.

Syntax:

```text
[<value>[, <value>]*]
```

Required:

- opening and closing brackets
- zero or more array elements

Optional:

- commas between elements

Behavior:

- each element is checked against the target item type

Example:

```xsmp
tuning = [1.0, 0.6, 0.3]
```

### Structures

A **Structure Literal** initializes a structure-typed value with positional or designated members.

Syntax:

```text
{
    [<field-path> =] <value>[, ...]
}
```

Required:

- opening and closing braces
- zero or more structure elements

Optional:

- designated member paths
- commas between elements

Assembly structure elements may be:

- positional values
- designated field assignments using a path

Behavior:

- positional values follow member order
- designated paths let you initialize members explicitly by name

Example:

```xsmp
thermal = {
    sensor = 17.5,
    target = 20.0,
    enabled = true
}
```

## Paths

An **Assembly Path** identifies instances, members and linked endpoints inside the instantiated hierarchy.

Assembly paths are used in:

- `configure`
- field assignments
- event links
- field links
- interface links

### Syntax

```text
[unsafe] [ / ] <segment> [ ('.' | '/') <segment> | '[' <index> ']' ]*
```

Segments may be:

- named segments
- templated segments
- `.`
- `..`

Required:

- at least one segment for normal relative paths
- or `/` for the absolute-root form

Optional:

- `unsafe`
- absolute `/`
- additional segments
- indexes

Behavior:

- an absolute path starts from the root model instance
- a relative path starts from the current instance context
- the last segment may resolve to a field, event source, event sink, reference or other member depending on usage

### Template placeholders

Assembly paths and instance names support placeholder-based segments such as:

- `Avionics{Lane}`
- `{BusMember}`
- `Router{Lane}`

### Examples

```xsmp
/platform
```

```xsmp
avionics.power
```

```xsmp
nested.logger
```

```xsmp
../router
```

```xsmp
payloads[0]
```

```xsmp
unsafe child.inValue
```

## Minimal complete example

```xsmp
/**
 * @title Orbital Segment Assembly
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
assembly <Lane = "Ops"> OrbitalSegment

configure Avionics{Lane}
{
    subscribe step -> "PlatformReady"
    property mode = demo.foundation.Mode.Nominal
}

Scenario{Lane}: demo.orbit.OrbitalPlatform
{
    avionics += Avionics{Lane}: demo.avionics.AvionicsUnit
    router += Router{Lane}: demo.orbit.PowerRouter
    logger += Logger{Lane}: demo.orbit.SegmentLogger
    interface link logger -> avionics:backLogger
}
```
