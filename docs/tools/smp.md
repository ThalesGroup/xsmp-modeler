# SMP Tool

`smp` generates SMP XML artifacts from XSMP models.

## When to use it

Use the SMP tool when you want XSMP sources to produce standard SMP artifacts such as:

- catalogue XML
- package XML
- configuration XML
- assembly XML
- link base XML
- schedule XML

## How to enable it

Add this to `xsmp.project`:

```text
tool 'smp'
```

## What it generates

The tool writes generated outputs under:

```text
smdl-gen/
```

Typical outputs include files such as:

- `.smpcat`
- `.smppkg`
- `.smpcfg`
- `.smpasb`
- `.smplnk`
- `.smpsed`

depending on which XSMP documents exist in the project.

## Typical project snippet

```text
project 'orbitalsegment'
source 'smdl'
tool 'smp'
```

## How to run it

From VS Code:

- `Xsmp: Generate Project`
- `Xsmp: Generate All Projects`

From the CLI:

```bash
xsmpproject-cli generate path/to/project
```

## Expected result

After a successful generation, `smdl-gen/` contains SMP XML files that correspond to the XSMP documents found in the project sources.
