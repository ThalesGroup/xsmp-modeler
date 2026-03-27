# `xsmp.project`

The project language configures an XSMP project workspace.

This page documents the user-facing `xsmp.project` file: project declaration, sources, dependencies, profile selection and tool activation.

## Root syntax

An **XSMP Project** declares one project and lists the sources, dependencies, profile and tools that control how that project is built and validated.

```text
project '<project-name>'

(source '<path>' | 
dependency '<project-name>' | 
profile '<profile-name>' | 
tool '<tool-name>')*
```

Required:

- `project`
- the project name

Optional:

- any number of `source` statements
- any number of `dependency` statements
- zero or one `profile` statement
- any number of `tool` statements

Example:

```xsmp
project 'missionsystem'
source 'smdl'
dependency 'foundation'
profile 'xsmp-sdk'
tool 'smp'
tool 'adoc'
```

## Strings

The grammar accepts both single-quoted and double-quoted strings. This documentation uses single quotes by default:

```xsmp
project 'missionsystem'
```

## `source`

A **Source Declaration** tells XSMP where to look for the modeling documents that belong to the current project.

Syntax:

```text
source '<path>'
```

Required:

- `source`
- one path string

Behavior:

- the path is relative to the project directory
- a project may declare as many sources as needed
- each source may point to a directory or a single file

Examples:

```xsmp
source 'smdl'
```

```xsmp
source 'models/foundation'
```

## `dependency`

A **Project Dependency** declares that the current project uses modeling documents from another XSMP project in the same workspace.

Syntax:

```text
dependency '<project-name>'
```

Required:

- `dependency`
- the name of another XSMP project

Behavior:

- dependencies are resolved by project name, not by file path
- a project may declare as many dependencies as needed
- the target project must exist somewhere in the current workspace
- the dependency's modeling documents become available to the current project

What dependencies make visible:

- catalogues
- configurations
- assemblies
- link bases
- schedules

What dependencies do not inherit:

- the other project's selected profile
- the other project's selected tools

Example:

```xsmp
dependency 'foundation'
dependency 'avionics'
```

## `profile`

A **Profile Selection** activates one project-wide profile for the current project.

Syntax:

```text
profile '<profile-name>'
```

Required:

- `profile`
- one installed profile identifier

Behavior:

- profile identifiers are globally visible in `xsmp.project`
- the selected profile becomes active only for the current project
- profiles may add generators, extra consistency checks and wizard templates
- a project may select at most one profile

Example:

```xsmp
profile 'xsmp-sdk'
```

## `tool`

A **Tool Activation** enables one additional capability for the current project.

Syntax:

```text
tool '<tool-name>'
```

Required:

- `tool`
- one installed tool identifier

Behavior:

- tool identifiers are globally visible in `xsmp.project`
- active tools are local to the current project
- a project may enable as many tools as needed

Examples:

```xsmp
tool 'smp'
tool 'adoc'
tool 'python'
```

## Statement order

The grammar allows `source`, `dependency`, `profile` and `tool` statements in any order after the `project` line.

For readability, a common convention is:

1. `source`
2. `dependency`
3. `profile`
4. `tool`

## Practical visibility rules

These identifiers are globally visible in all `xsmp.project` files:

- profile ids
- tool ids

These effects remain project-local:

- generators
- extra consistency checks
- wizard additions
- extra model libraries supplied by the selected profile or tools

That means two projects in the same workspace may activate different tools and profiles without leaking project-local behavior into each other.

## Typical examples

### Minimal project

```xsmp
project 'foundation'
source 'smdl'
```

### Project with dependencies and generation

```xsmp
project 'mission-demo'
source 'smdl'
dependency 'foundation'
dependency 'avionics'
profile 'xsmp-sdk'
tool 'smp'
tool 'adoc'
```
