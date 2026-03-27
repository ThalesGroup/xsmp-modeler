# Projects, Tools and Profiles

The `xsmp.project` file is the entry point of an XSMP project. It tells XSMP where the modeling sources live and which profiles and tools are active for that project.

## Project

A project declares:

- its name
- one or more source locations
- optional dependencies on other projects
- zero or one profile
- zero or more tools

Example:

```text
project "missionsystem"
source "smdl"
dependency "foundation"
profile "xsmp-sdk"
tool "smp"
tool "adoc"
```

## Sources

Each `source` entry points to modeling content relative to the project directory.

Typical value:

```text
source "smdl"
```

All XSMP modeling files usually live in that directory.

## Dependencies

`dependency "<project-name>"` links one project to another by project name.

Dependencies make the dependent project's modeling documents available to the current project, such as:

- catalogues
- configurations
- assemblies
- link bases
- schedules

Important rules:

- dependencies are resolved by project name
- the dependent project must be present in the workspace
- tools and profiles are **not inherited** through dependencies

## Profiles

A profile adapts the project to one environment or delivery style.

Built-in user-facing profiles currently documented here are:

- `xsmp-sdk`
- `esa-cdk`

Profiles can:

- scaffold project files in the wizard
- contribute generators
- add extra consistency checks

A project typically activates at most one profile:

```text
profile "xsmp-sdk"
```

You can omit the profile entirely, but you cannot activate several profiles in one project.

## Tools

Tools add focused capabilities on top of the base language support.

Built-in user-facing tools currently documented here are:

- `smp`
- `adoc`
- `python`

Tools can:

- add generators
- add extra consistency checks
- add wizard support

You can combine several tools in the same project:

```text
tool "smp"
tool "adoc"
tool "python"
```

## What is global and what is project-local

These identifiers are globally visible in `xsmp.project` files:

- profile ids
- tool ids

These effects remain project-local:

- generators
- extra consistency checks
- extra model libraries supplied by the selected profile or tools

This means two projects in the same workspace can activate different tools and profiles without leaking their project-specific behavior into each other.
