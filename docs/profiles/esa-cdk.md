# ESA CDK Profile

`esa-cdk` prepares a project for workflows that target the ESA SMP CDK environment.

## When to use it

Use `esa-cdk` when your project needs:

- an ESA CDK-oriented project layout
- profile-specific generated outputs for that environment

## How to enable it

Add this to `xsmp.project`:

```text
profile "esa-cdk"
```

## What it adds

The profile contributes:

- wizard templates for ESA CDK-oriented projects
- project files such as `CMakeLists.txt`
- profile-specific generation based on the active XSMP models

## Typical project snippet

```text
project "orbital-segment"
source "smdl"
profile "esa-cdk"
tool "smp"
```

## Expected outcome

With this profile enabled, generation and scaffolding produce outputs aligned with the ESA CDK environment instead of the XSMP SDK-oriented layout.
