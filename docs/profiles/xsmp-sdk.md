# XSMP SDK Profile

`xsmp-sdk` is the default user-facing profile for projects that target the XSMP SDK ecosystem.

## When to use it

Use `xsmp-sdk` when you want:

- a ready-to-use XSMP SDK-oriented project layout
- generated C++ sources integrated with the XSMP SDK toolchain
- a convenient default profile in the project wizard

## How to enable it

Add this to `xsmp.project`:

```text
profile 'xsmp-sdk'
```

## What it adds

The profile contributes:

- wizard templates for an XSMP SDK-style project
- project files such as `CMakeLists.txt` and `README.md`
- profile-specific generation on top of your XSMP sources

## Typical wizard result

When selected in the wizard, the profile prepares a project layout that is immediately usable with the XSMP SDK build workflow.

Typical additions include:

- `CMakeLists.txt`
- `README.md`

## Typical use with tools

The profile is often combined with the `smp` tool:

```text
project 'mission-demo'
source 'smdl'
profile 'xsmp-sdk'
tool 'smp'
```

This gives you:

- XSMP SDK-oriented project scaffolding
- SMP XML generation from your XSMP sources
