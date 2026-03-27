# XSMP Link Base (`.xsmplnk`)

Link base files collect reusable links separately from assembly bodies.

They are useful when the same wiring should be applied to several assembly instances or when link topology should stay separate from instantiation logic.

## Document comments and metadata

Link-base documents can start with a documentation comment. The following root-level tags are recognized when exporting SMP artifacts:

- `@title`
- `@date`
- `@creator`
- `@version`

Example:

```xsmp
/**
 * Orbital segment reusable links.
 * @title Orbital Links
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
link OrbitalLinks
```

## Root structure

A **Link Base** groups reusable wiring rules that can later be attached to assembly instances.

### Syntax

```text
link <name> [for <assembly>]
    <component-link-base>*
```

Required:

- `link`
- the link-base name

Optional:

- `for <assembly>`
- any number of component link-base blocks

Behavior:

- `for <assembly>` states which assembly shape this link base is written for
- without `for`, the file still acts as a reusable link container, but path checking may be less precise

Example:

```xsmp
link OrbitalLinks for OrbitalSegment
```

## Component link-base blocks

A **Component Link-Base Block** changes the current component context and groups links below one subtree.

### Syntax

```text
<path>
{
    (<link> | <component-link-base>)*
}
```

Required:

- one component path
- one block body

Behavior:

- an absolute path starts from the assembly root
- a relative path is resolved below the parent component link-base
- nested blocks let you organize links by subtree

Examples:

```xsmp
/
{
}
```

```xsmp
avionics
{
}
```

```xsmp
payload
{
    router
    {
    }
}
```

## Link kinds

**Link Kinds** describe the three kinds of reusable wiring supported by a link base.

Link bases support three link kinds:

- event links
- field links
- interface links

## Event link

An **Event Link** connects one event source to one compatible event sink.

### Syntax

```text
event link <owner-path> -> <client-path>
```

Required:

- `event link`
- one owner path
- `->`
- one client path

Example:

```xsmp
event link publishedMode -> child.commandedMode
```

## Field link

A **Field Link** connects one output field to one compatible input field.

### Syntax

```text
field link <owner-path> -> <client-path>
```

Required:

- `field link`
- one owner path
- `->`
- one client path

Example:

```xsmp
field link power.lineVoltage -> router.incomingBus
```

## Interface link

An **Interface Link** connects one published reference to one client instance, optionally with a back reference on the client side.

### Syntax

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

Behavior:

- the last segment of `source-path` selects the published reference
- any earlier segments navigate to the owner component instance
- the optional `back-reference` selects one local reference on the client side

Examples:

```xsmp
interface link logger -> payload
```

```xsmp
interface link nested.logger -> payload:backLogger
```

## Back references

A **Back Reference** names one local reference on the client side of an interface link.

Back references use a local named reference syntax:

```text
[unsafe] <name>
```

Required:

- one local reference name

Optional:

- `unsafe`

Behavior:

- the back reference is resolved on the client side of the interface link
- `unsafe` keeps the local name exactly as written even when it cannot be checked safely

Example:

```xsmp
interface link nested.logger -> payload:backLogger
```

## Paths

A **Link-Base Path** identifies the component context and the endpoints used by reusable links.

Link-base paths are used in:

- component link-base headers
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

- an absolute path starts from the link-base root context
- a relative path starts from the current component link-base block
- the last segment is interpreted according to the link kind that uses the path

### Template placeholders

Link bases support templated path segments such as:

- `{BusMember}`
- `{RouterMember}`
- `Logger{Lane}`

Example:

```xsmp
field link {BusMember}.power.lineVoltage -> {RouterMember}.incomingBus
```

### `unsafe`

`unsafe` keeps a path or local name exactly as written even when it cannot be checked safely against the available model definitions.

Examples:

```xsmp
field link unsafe outValue -> unsafe child.inValue
```

```xsmp
interface link unsafe logger -> payload:unsafe backLogger
```

## Minimal complete example

```xsmp
/**
 * @title Orbital Links
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
link OrbitalLinks for OrbitalSegment

/
{
    field link {BusMember}.power.lineVoltage -> {RouterMember}.incomingBus
    interface link {BusMember}.logger -> {LoggerMember}
    event link {BusMember}.publishedMode -> inboundMode
}
```
