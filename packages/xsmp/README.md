# @xsmp/core

Core XSMP language services, AST types and runtime helpers used by XSMP Modeler.

XSMP Modeler is a tooling stack for authoring SMDL (Simulation Model Definition
Language) models as defined in the ECSS SMP standards. This package contains the
shared TypeScript library: Langium services, generated grammars, AST definitions,
validation helpers, reference/path utilities, workspace support and SMP import
and mirror services.

For the user-facing Visual Studio Code extension and project documentation, see
the XSMP Modeler repository and documentation site:

- https://github.com/ThalesGroup/xsmp-modeler
- https://thalesgroup.github.io/xsmp-modeler/

## Installation

```sh
npm install @xsmp/core
```

The package targets modern Node.js runtimes. The XSMP Modeler workspace currently
uses Node.js 22.13 or newer.

## What This Package Provides

- Language services for XSMP project, catalogue, configuration, assembly, link
  base and schedule documents.
- Generated Langium grammars and AST type definitions.
- Validation, reference resolution and typed path helpers.
- Workspace and project management services.
- Built-in ECSS SMP catalogue resources.
- SMP XML import and mirror support.
- Generator service interfaces used by XSMP tools and profiles.

## Supported XSMP Documents

| Document | Extension | Purpose |
| --- | --- | --- |
| Project | `xsmp.project` | Declares sources, dependencies, tools and profiles |
| Catalogue | `.xsmpcat` | Defines types, components, interfaces and events |
| Configuration | `.xsmpcfg` | Defines reusable component configuration data |
| Assembly | `.xsmpasb` | Instantiates and configures model hierarchies |
| Link base | `.xsmplnk` | Declares reusable links between component instances |
| Schedule | `.xsmpsed` | Declares tasks, events and scheduled activities |

## Public Entry Points

The package exposes these import paths:

- `@xsmp/core`
- `@xsmp/core/ast`
- `@xsmp/core/ast-partial`
- `@xsmp/core/contributions`
- `@xsmp/core/generator`
- `@xsmp/core/generator/cpp`
- `@xsmp/core/grammar`
- `@xsmp/core/lsp`
- `@xsmp/core/references`
- `@xsmp/core/smp`
- `@xsmp/core/smp/*`
- `@xsmp/core/utils`
- `@xsmp/core/validation`
- `@xsmp/core/wizard`
- `@xsmp/core/wizard/templates`
- `@xsmp/core/workspace`

## Related Packages

This package is the core library. End-user tooling is provided by the XSMP
Modeler VS Code extension and by companion packages in the XSMP Modeler
monorepo, including the CLI and generator tools.

## License

MIT
