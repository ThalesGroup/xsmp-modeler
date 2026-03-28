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

- a convenient default profile in the project wizard
- wizard templates for an XSMP SDK-style project
- project files such as `CMakeLists.txt` and `README.md`
- profile-specific generation on top of your XSMP sources

## Typical project snippet

```text
project 'mission-demo'
source 'smdl'
profile 'xsmp-sdk'
tool 'smp'
```

## Expected result

With this profile enabled, scaffolding and generation produce an XSMP SDK-oriented project layout that is ready for the usual XSMP SDK build workflow.
