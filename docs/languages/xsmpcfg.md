# XSMP Configuration (`.xsmpcfg`)

Configuration files define reusable values that can be applied to component instances.

This page documents the user-facing configuration grammar in detail: root declarations, nested component configurations, includes, values and paths.

## Document comments and metadata

Configuration files use the shared document-comment rules described in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#document-comments-and-export-metadata).

Use a leading documentation comment with the shared root-level tags `@title`, `@date`, `@creator` and `@version` when you want to enrich exported SMP metadata.

Example:

```xsmp
/**
 * Nominal avionics configuration.
 * @title Avionics Nominal Configuration
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
configuration AvionicsNominal
```

## Root structure

A **Configuration** declares one reusable configuration and then fills it with component-specific values and optional includes.

### Syntax

```text
configuration <name>
    (<component-configuration> | <include>)*
```

Required:

- `configuration`
- the configuration name

Optional:

- any number of nested component configurations
- any number of `include` statements

Example:

```xsmp
configuration AvionicsNominal
/avionics: demo.avionics.AvionicsUnit
{
    modeState = demo.foundation.Mode.Nominal
}
```

## Component configuration blocks

A **Component Configuration** block targets one component instance path and assigns values inside that component subtree.

### Syntax

```text
<path> [: <component-type>]
{
    (<include> | <component-configuration> | <field-value>)*
}
```

Required:

- one target path
- a block body

Optional:

- `: <component-type>`

Behavior:

- the path selects the configured component instance
- the optional `: <component-type>` states explicitly which component type this block is written for
- nested blocks let you configure children inline

Example:

```xsmp
/avionics: demo.avionics.AvionicsUnit
{
    modeState = demo.foundation.Mode.Nominal
}
```

### Nested component configuration

A **Nested Component Configuration** block lets you continue configuring child components without repeating a full absolute path.

Example:

```xsmp
power: demo.avionics.BatteryPack
{
    commandedMode = demo.foundation.Mode.Nominal
    stateOfCharge = 82
}
```

## `include`

An **Include** reuses another named configuration, either at the current level or below a child path.

### Syntax

```text
include <configuration-name> [at <path>]
```

Required:

- `include`
- one configuration name

Optional:

- `at <path>`

Behavior:

- without `at`, the included configuration is applied at the current level
- with `at`, it is applied below a child component path

Examples:

```xsmp
include SensorCalibration
```

```xsmp
include SensorCalibration at sensor
```

```xsmp
include LegacyCalibration at unsafe sensor
```

## Field assignments

A **Field Assignment** writes one concrete value into one configurable field.

### Syntax

```text
<field-path> = <value>
```

Required:

- a path to the target field
- `=`
- one value

Examples:

```xsmp
modeState = demo.foundation.Mode.Nominal
stateOfCharge = 82
lineVoltage = 28.2
```

## Values

**Configuration Values** group the literal forms you can assign to configurable fields.

Configurations support three value families:

- simple values
- arrays
- structures

The shared scalar literal rules, including numeric suffixes such as `i32`, `u16`, `f64`, `lit`, `d` and `dt`, are documented in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#values) and [Numeric suffixes](../concepts/paths-templates-values.md#numeric-suffixes).

## Simple values

**Simple Values** cover the shared scalar literals commonly used in configuration files.

Use the common value reference for the full list of supported scalar forms. In configuration files, those simple values are typically used for field assignments inside one component subtree.

Examples:

```xsmp
retryCount = 3i32
lineVoltage = 28.0f64
modeState = 1lit
startupDelay = "PT10S"d
```

When the target type is already clear from the field being assigned, you may also write plain integers and floats instead of suffixed numeric literals.

## Arrays

An **Array Value** assigns an ordered list of values to one array-typed field.

### Syntax

```text
[<value>[, <value>]*]
```

Required:

- opening and closing brackets
- zero or more array elements

Optional:

- commas between elements

Behavior:

- each element is validated against the item type of the target array
- element count is validated against the target type where relevant

Examples:

```xsmp
tuning = [1.0, 0.6, 0.3, 0.1]
```

```xsmp
enabledChannels = [true, false, true]
```

## Structures

A **Structure Value** assigns several member values at once to one structure-typed field.

### Syntax

```text
{
    <value-or-designated-field>[, <value-or-designated-field>]*
}
```

Required:

- opening and closing braces
- zero or more structure elements

Optional:

- commas between elements
- designated member names inside the literal

Structure elements may be:

- positional values
- designated field assignments

Behavior:

- positional values follow the declared member order
- designated fields let you initialize members by name
- you may mix both forms when the target structure type allows it

### Designated field syntax

A **Designated Field** targets one named member explicitly inside a structure literal.

```text
[unsafe] <field-name> = <value>
```

Required:

- one field name
- `=`
- one value

Optional:

- `unsafe`

Behavior:

- `unsafe` keeps the textual member name even when it cannot be resolved safely

Examples:

```xsmp
thermal = {
    sensor = 17.5,
    target = 20.0,
    heater = 12,
    enabled = true
}
```

```xsmp
legacy = {
    unsafe deprecatedField = 2
}
```

## Paths

A **Configuration Path** identifies which component or field receives the configured value.

Configuration paths are used in:

- component configuration headers
- `include ... at ...`
- field assignments

Configuration paths use the shared path model described in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#paths) and the shared `unsafe` behavior documented in [unsafe](../concepts/paths-templates-values.md#unsafe).

Behavior:

- an absolute path starts from the configuration root
- a relative path starts from the current configuration block
- `.` keeps the current level and `..` moves to the parent level

### Important note

Unlike assembly, link-base and schedule paths, configuration paths do not support template placeholders.

Examples:

```xsmp
/avionics
```

```xsmp
power.battery
```

```xsmp
../router
```

```xsmp
tuning[0]
```

```xsmp
unsafe child.sensor
```

## Minimal complete example

```xsmp
/**
 * @title Avionics Nominal Configuration
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
configuration AvionicsNominal

/avionics: demo.avionics.AvionicsUnit
{
    modeState = demo.foundation.Mode.Nominal
    thermal = {
        sensor = 17.5,
        target = 20.0,
        enabled = true
    }
    include SensorCalibration at power
}
```
