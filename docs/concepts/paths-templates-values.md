# Shared Syntax: Comments, Paths, Templates and Values

Several XSMP languages share the same ideas for document comments, paths, template placeholders and values. This page explains the common syntax once so the language-specific pages can stay focused on language-specific statements.

## Document comments and export metadata

Catalogue, configuration, assembly, link-base and schedule documents may start with a documentation comment.

In addition to normal descriptive text, the same root-level tags are recognized when exporting SMP artifacts:

- `@title`
- `@date`
- `@creator`
- `@version`

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

Some languages also recognize additional metadata on individual declarations. Those declaration-specific tags are documented on the relevant language pages, especially [XSMP Catalogue](../languages/xsmpcat.md).

## Paths

Paths are used in configurations, assemblies, link bases and schedules.

Common path forms:

```text
/
platform
platform.avionics
../router
/system/orbital
```

### Path features

- `.` or `/` separators depending on the language context
- `..` for the parent segment
- `.` for the current segment when supported
- `[index]` for indexed access
- absolute paths starting with `/`
- relative paths starting at the current context

## `unsafe`

Most path-bearing languages support `unsafe`.

Example:

```text
include Legacy at unsafe child
```

`unsafe` means:

- keep the textual form
- leave the path or name exactly as written
- skip normal name checking for that path or reference

Use it for legacy models, partially typed setups or temporary workarounds, not as the default modeling style.

## Template parameters and placeholders

Assemblies and schedules can declare template parameters.

Common supported forms are:

```text
<Name: string>
<Name: string = "Ops">
<Name = "Ops">
<Index: int32>
<Index: int32 = 1>
<Index = 1>
```

Example:

```text
assembly <Lane: string = "Ops", Index: int32 = 1> OrbitalSegment
```

You can then reuse them in names and paths with `{...}` placeholders:

```text
Avionics{Lane}
{BusMember}.logger
execute Tick at {OrbitalMember}
```

### Typical uses

- specialize instance names
- specialize relative paths
- reuse one assembly or schedule template in several deployment contexts

## Values

Configurations, assemblies and schedules share the same family of scalar value literals.

Configurations and assemblies also support array and structure values. Schedules only use simple values.

### Simple values

```text
true
false
"text"
'c'
42
3.14
demo.foundation.Mode.Nominal
"PT10S"d
"2025-01-01T01:00:00Z"dt
```

### Arrays

```text
[1.0, 0.6, 0.3, 0.1]
```

### Structures

```text
{
    sensor = 17.5,
    target = 20.0,
    enabled = true
}
```

## Numeric suffixes

Configuration, assembly and schedule values accept explicit numeric suffixes when you want to state the exact scalar type directly in the literal.

```text
12i32
28u16
3.5f32
1lit
```

### Integer suffixes

- `i8`: signed 8-bit integer
- `i16`: signed 16-bit integer
- `i32`: signed 32-bit integer
- `i64`: signed 64-bit integer
- `u8`: unsigned 8-bit integer
- `u16`: unsigned 16-bit integer
- `u32`: unsigned 32-bit integer
- `u64`: unsigned 64-bit integer

Examples:

```text
12i8
12i16
12i32
12i64
28u8
28u16
28u32
28u64
```

### Floating-point suffixes

- `f32`: 32-bit floating-point value
- `f64`: 64-bit floating-point value

Examples:

```text
3.5f32
3.5f64
```

### Enumeration numeric suffix

- `lit`: numeric value of an enumeration literal

This form is useful when you want to write the underlying numeric value instead of the qualified enumeration name.

Examples:

```text
0lit
2lit
```

### Plain numbers

When the target type is already clear from the surrounding declaration, you may also write plain integers and floats in many places, such as:

```text
count = 3
ratio = 1.5
```

### Related non-numeric value suffixes

XSMP also uses two common value suffixes that are not numeric-width suffixes:

- `d`: duration literal
- `dt`: datetime literal

Examples:

```text
"PT10S"d
"2025-01-01T01:00:00Z"dt
```

## When to look at language-specific rules

Use this page for the shared ideas. Then go to the relevant language page for the exact statement forms:

- [XSMP Configuration](../languages/xsmpcfg.md)
- [XSMP Assembly](../languages/xsmpasb.md)
- [XSMP Link Base](../languages/xsmplnk.md)
- [XSMP Schedule](../languages/xsmpsed.md)
