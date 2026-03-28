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

## What it adds

The tool contributes generation of SMP XML artifacts under:

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

## Expected result

After a successful generation, `smdl-gen/` contains SMP XML files that correspond to the XSMP documents found in the project sources.
