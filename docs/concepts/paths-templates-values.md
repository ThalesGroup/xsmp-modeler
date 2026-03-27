# Paths, Templates and Values

Several XSMP languages share the same ideas for paths, template placeholders and values. This page explains the common syntax once so the language-specific pages can stay focused.

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

Configurations, assemblies and schedules support the same family of value literals.

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

Some contexts accept explicit numeric suffixes:

```text
12i32
28u16
3.5f32
1lit
```

When the target type is already clear from the surrounding declaration, you may also write plain integers and floats in many places, such as:

```text
count = 3
ratio = 1.5
```

## When to look at language-specific rules

Use this page for the shared ideas. Then go to the relevant language page for the exact statement forms:

- [XSMP Configuration](../languages/xsmpcfg.md)
- [XSMP Assembly](../languages/xsmpasb.md)
- [XSMP Link Base](../languages/xsmplnk.md)
- [XSMP Schedule](../languages/xsmpsed.md)
