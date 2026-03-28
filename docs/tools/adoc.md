# AsciiDoc Tool

`adoc` generates AsciiDoc-oriented outputs from an XSMP project.

## When to use it

Use `adoc` when you want:

- generated AsciiDoc documentation alongside your XSMP project
- documentation scaffolding created by the wizard
- one generated AsciiDoc file per supported XSMP source document

## How to enable it

Add this to `xsmp.project`:

```text
tool 'adoc'
```

## What it adds

The tool contributes:

- generation of AsciiDoc outputs for catalogues, configurations, assemblies, link bases and schedules
- wizard templates for a `doc/` folder and theme files

Typical files added by the tool include:

- `doc/<project-identifier>.adoc`
- `doc/themes/default.yml`
- `adoc-gen/<source-basename>-gen.adoc`

Generated outputs are written to `adoc-gen/` in the project root.

Each supported source document produces one file named from the source file basename:

- `mission_catalogue.xsmpcat` -> `adoc-gen/mission_catalogue-gen.adoc`
- `mission_schedule.xsmpsed` -> `adoc-gen/mission_schedule-gen.adoc`

The scaffolded `doc/<project-identifier>.adoc` file stays intentionally minimal and does not automatically include generated outputs. Add the `include::...[]` statements that fit your publishing flow.

## Typical project snippet

```text
project 'mission-demo'
source 'smdl'
tool 'adoc'
```

## Expected result

With `adoc` enabled, XSMP generation can produce user-facing documentation assets that fit into an AsciiDoc publishing flow, while leaving document aggregation under your control.
