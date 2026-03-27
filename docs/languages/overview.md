# Languages Overview

XSMP Modeler uses several related languages, each with a focused role.

## At a glance

| Language | File | Main purpose |
| --- | --- | --- |
| Project | `xsmp.project` | Define project sources, dependencies, tools and profiles |
| Catalogue | `.xsmpcat` | Define types, interfaces, models and services |
| Configuration | `.xsmpcfg` | Provide reusable configuration values |
| Assembly | `.xsmpasb` | Instantiate systems and connect local configuration |
| Link base | `.xsmplnk` | Declare reusable connections |
| Schedule | `.xsmpsed` | Declare tasks, events and task activities |

## Typical progression

Most projects are built in this order:

1. `xsmp.project`
2. `.xsmpcat`
3. `.xsmpcfg`
4. `.xsmpasb`
5. `.xsmplnk`
6. `.xsmpsed`

You do not need every language in every project, but this order matches how systems usually grow.

## Relationship between the languages

- `xsmp.project` selects the workspace context.
- `.xsmpcat` defines the reusable types and components.
- `.xsmpcfg` applies values to component structures.
- `.xsmpasb` instantiates components and sub-assemblies.
- `.xsmplnk` collects reusable connections.
- `.xsmpsed` drives execution and orchestration.

## Shared syntax

Several languages share common syntax for:

- paths
- template parameters
- placeholders
- values

See [Paths, Templates and Values](../concepts/paths-templates-values.md) for the common rules.

## Language reference pages

- [xsmp.project](xsmpproject.md)
- [XSMP Catalogue (.xsmpcat)](xsmpcat.md)
- [XSMP Configuration (.xsmpcfg)](xsmpcfg.md)
- [XSMP Assembly (.xsmpasb)](xsmpasb.md)
- [XSMP Link Base (.xsmplnk)](xsmplnk.md)
- [XSMP Schedule (.xsmpsed)](xsmpsed.md)
