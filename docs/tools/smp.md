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

## String template values and the published XSD

The published SMP Level 2 XSD can reject string template values used as schedule root paths. XSMP preserves these values during export. For example:

```xsmp
schedule <Root = "/Root"> Demo
```

produces this parameter in the schedule XML:

```xml
<Parameter xsi:type="Assembly:StringArgument" Name="Root" Value="/Root"/>
```

In `xml/Smdl/Assembly.xsd` from `ECSS_SMP_L2_(31March2025).zip`, `StringArgument/@Value` has type `Assembly:Name`. Its pattern is:

```text
(([a-zA-Z0-9_])|\{[a-zA-Z0-9_]*\})*
```

This permits ASCII letters, digits, underscores and `{...}` template tokens, including empty values and values starting with a digit or underscore. It rejects `/` and `.`, so an XSD validator rejects the `/Root` value above.

[ECSS-E-ST-40-08C](https://ecss.nl/standard/ecss-e-st-40-08c-simulation-modelling-platform-level-2-5-august-2025/), clauses 4.2.4.4 and 5.4.3.2b, describes a String8 template argument specifying the schedule root path. Resolver paths can contain multiple component names separated by `/`; the published `Name` restriction therefore does not cover all such paths.

The same XML type represents string defaults in assemblies and schedules, and explicit arguments in assembly instances and task executions. A consumer enforcing the published XSD can reject these values. XSMP keeps the original value and does not issue a diagnostic solely for this schema restriction; removing a separator would change the path. Account for this limitation when exchanging generated files with such consumers.
