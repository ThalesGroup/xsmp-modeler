# XSMP Schedule (`.xsmpsed`)

Schedule files define tasks, task activities and time- or event-driven activations.

They are used to describe when tasks run, where they run, and which operations, properties, transfers or global events are part of the execution flow.

## Document comments and metadata

Schedule files use the shared document-comment rules described in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#document-comments-and-export-metadata).

Use a leading documentation comment with the shared root-level tags `@title`, `@date`, `@creator` and `@version` when you want to enrich exported SMP metadata.

Example:

```xsmp
/**
 * Mission schedule.
 * @title Mission Schedule
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
schedule MissionPlan
```

## Root structure

A **Schedule** declares one reusable schedule, optional timing origins, then a set of tasks and event activations.

### Syntax

```text
schedule [<template-parameter>[, <template-parameter>]*] <name>
    [epoch "<time>"] [mission "<time>"]
    <task-or-event>*
```

Required:

- `schedule`
- the schedule name

Optional:

- template parameters
- `epoch "<time>"`
- `mission "<time>"`
- tasks
- events

Important note:

- if both `epoch` and `mission` are present, you may write them in either order

Example:

```xsmp
schedule <Root = "platform"> MissionPlan epoch "2025-01-01T00:00:00Z"
```

## Template parameters

**Template Parameters** let one schedule definition be reused with different string or integer settings.

Schedules support:

- string parameters
- `int32` parameters

Schedules use the shared template-parameter forms documented in [Template parameters and placeholders](../concepts/paths-templates-values.md#template-parameters-and-placeholders).

Examples:

```xsmp
<Root: string>
```

```xsmp
<Root: string = "platform">
```

```xsmp
<Cycles: int32 = 3>
```

## Tasks

A **Task** defines one reusable execution body made of task activities.

### Syntax

```text
task <name> [on <component-or-assembly>]
{
    <activity>*
}
```

Required:

- `task`
- the task name
- one block body

Optional:

- `on <component-or-assembly>`

Behavior:

- `on <component-or-assembly>` states which component or assembly context the task body is written against
- when an assembly context is used, relative activity paths and task roots may reuse that assembly's template parameters
- a task may contain zero or more activities

Example:

```xsmp
task Bootstrap on demo.orbit.OrbitalPlatform
{
    trig run
}
```

## Activities

**Activities** are the executable statements that make up a task body.

Tasks may contain:

- `call`
- `property`
- `transfer`
- `trig`
- `execute`
- `emit`

## `call`

A **Call Activity** invokes one operation in the current task execution context.

### Syntax

```text
call <operation-path>( [<parameter-name> = <simple-value>[, ...]] )
```

Required:

- `call`
- one operation path
- parentheses

Optional:

- named parameters

Example:

```xsmp
call avionics.apply(requestedMode = demo.foundation.Mode.Nominal)
```

## `property`

A **Property Activity** writes one simple value through a property setter.

### Syntax

```text
property <property-path> = <simple-value>
```

Required:

- `property`
- one property path
- one simple value

Example:

```xsmp
property mode = demo.foundation.Mode.Nominal
```

## `transfer`

A **Transfer Activity** copies data from one output field to one input field.

### Syntax

```text
transfer <output-field-path> -> <input-field-path>
```

Required:

- `transfer`
- one output field path
- `->`
- one input field path

Example:

```xsmp
transfer bus.outValue -> router.incomingBus
```

## `trig`

A **Trigger Activity** triggers one entry point.

### Syntax

```text
trig <entrypoint-path>
```

Required:

- `trig`
- one entrypoint path

Example:

```xsmp
trig avionics.step
```

## `execute`

An **Execute Activity** calls another task, optionally with template arguments and a different execution root.

### Syntax

```text
execute <task>
    [<template-argument>[, <template-argument>]*]
    [at <root-path>]
```

Required:

- `execute`
- the called task

Optional:

- template arguments
- `at <root-path>`

Behavior:

- `at` changes the execution root for the called task
- template arguments are used when the called task belongs to a templated schedule context

Examples:

```xsmp
execute PowerBalance at avionics
```

```xsmp
execute OrbitTick<Root = "/platform", Cycles = 3> at orbital
```

## `emit`

An **Emit Activity** publishes one global event, optionally asynchronously.

### Syntax

```text
[async] emit "<event-name>"
```

Required:

- `emit`
- one global event name

Optional:

- `async`

Example:

```xsmp
async emit "PlatformReady"
```

## Template arguments

**Template Arguments** provide concrete values to a templated task invocation.

Schedules support:

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

- arguments are matched by parameter name
- argument types are checked against the called task template parameters

Example:

```xsmp
<Root = "/system", Cycles = 3>
```

## Events

**Events** define when tasks start running, whether from time origins or from global events.

Schedules support five event forms:

- mission-relative
- epoch-based
- simulation-relative
- zulu-based
- global-event-triggered

## Mission event

A **Mission Event** starts a task relative to the mission clock.

### Syntax

```text
event <task> mission "<time>" [cycle "<time>" [repeat <count>]]
```

Required:

- `event`
- the task name
- `mission`
- one mission-relative time value

Optional:

- `cycle`
- `repeat`

Example:

```xsmp
event Bootstrap mission "PT10S"
```

## Epoch event

An **Epoch Event** starts a task at an absolute epoch-based instant.

### Syntax

```text
event <task> epoch "<time>" [cycle "<time>" [repeat <count>]]
```

Required:

- `event`
- the task name
- `epoch`
- one absolute epoch value

Optional:

- `cycle`
- `repeat`

Example:

```xsmp
event Bootstrap epoch "2025-01-01T00:00:10Z"
```

## Simulation event

A **Simulation Event** starts a task relative to simulation time.

### Syntax

```text
event <task> simulation "<time>" [cycle "<time>" [repeat <count>]]
```

Required:

- `event`
- the task name
- `simulation`
- one simulation-relative time value

Optional:

- `cycle`
- `repeat`

Example:

```xsmp
event Worker simulation "PT45S"
```

## Zulu event

A **Zulu Event** starts a task using an absolute UTC-like timestamp.

### Syntax

```text
event <task> zulu "<time>" [cycle "<time>" [repeat <count>]]
```

Required:

- `event`
- the task name
- `zulu`
- one zulu timestamp

Optional:

- `cycle`
- `repeat`

Example:

```xsmp
event Bootstrap zulu "2025-01-01T00:00:10Z"
```

## Global-event-triggered event

A **Global-Event-Triggered Event** starts a task when one named global event is emitted.

### Syntax

```text
event <task> on "<start-event>"
    [until "<stop-event>"]
    [using <time-kind>]
    [delay "<time>"]
    [cycle "<time>" [repeat <count>]]
```

Time kinds:

- `mission`
- `epoch`
- `simulation`
- `zulu`

Required:

- `event`
- the task
- `on "<start-event>"`

Optional:

- `until`
- `using`
- `delay`
- `cycle`
- `repeat`

Example:

```xsmp
event Observe on "PlatformReady" using mission delay "PT5S" cycle "PT30S" repeat 3
```

## Paths

A **Schedule Path** identifies the members and instances used by task activities.

Schedule paths are used in:

- `call`
- `property`
- `transfer`
- `trig`
- `execute ... at ...`

Schedule paths use the shared path model described in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#paths), the shared `unsafe` behavior documented in [unsafe](../concepts/paths-templates-values.md#unsafe), and the shared placeholder forms described in [Template parameters and placeholders](../concepts/paths-templates-values.md#template-parameters-and-placeholders).

Behavior:

- a relative path starts from the current task execution context
- an absolute path starts from the root execution context
- the last segment is interpreted according to the activity that uses the path

Examples:

```xsmp
avionics.apply
```

```xsmp
bus.outValue
```

```xsmp
../router
```

```xsmp
payloads[0]
```

```xsmp
{ConsoleMember}.log
```

```xsmp
unsafe legacy.reset
```

## Simple values

**Simple Values** are the scalar literals accepted by schedule activities for arguments and property assignments.

Schedule activities use the shared scalar literal rules documented in [Shared Syntax: Comments, Paths, Templates and Values](../concepts/paths-templates-values.md#values) and [Numeric suffixes](../concepts/paths-templates-values.md#numeric-suffixes).

Unlike configurations and assemblies, schedules accept simple values only. They do not use array or structure literals in activities.

Examples:

```xsmp
call controller.setRetryCount(count = 3u16)
property mode = 1lit
call controller.setTimeout(timeout = "PT10S"d)
```

When the target type is already clear from the called parameter or property, you may also write plain integers and plain floating-point values.

Examples:

```xsmp
property mode = demo.foundation.Mode.Nominal
```

```xsmp
call controller.setTimeout(timeout = "PT10S"d)
```

## Minimal complete example

```xsmp
/**
 * @title Mission Schedule
 * @creator alice
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
schedule <Root = "/system", Cycles = 3> MissionSchedule epoch "2025-01-01T01:00:00Z"

task Dispatch on demo.mission.MissionSystemRoot
{
    call ground.log(message = "mission dispatch")
    execute OrbitalTick<Root = "/system/orbital"> at orbital
    async emit "MissionReady"
}

task OrbitalTick on demo.orbit.OrbitalPlatform
{
    trig run
}

event Dispatch mission "PT15S"
event OrbitalTick simulation "PT20S"
```
