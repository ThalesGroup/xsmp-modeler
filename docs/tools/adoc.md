# AsciiDoc Tool

`adoc` generates AsciiDoc-oriented outputs from an XSMP project.

## When to use it

Use `adoc` when you want:

- generated AsciiDoc documentation alongside your XSMP project
- documentation scaffolding created by the wizard

## How to enable it

Add this to `xsmp.project`:

```text
tool "adoc"
```

## What it adds

The tool contributes:

- generation of AsciiDoc outputs
- wizard templates for a `doc/` folder and theme files

Typical wizard-created files include:

- `doc/<project-identifier>.adoc`
- `doc/themes/default.yml`

## Typical project snippet

```text
project "mission-demo"
source "smdl"
tool "adoc"
```

## Expected result

With `adoc` enabled, XSMP generation can produce user-facing documentation assets that fit into an AsciiDoc publishing flow.
