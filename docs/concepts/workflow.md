# Recommended Workflow

XSMP Modeler supports several ways of working, but the most productive user workflow is usually the following.

## 1. Start with a project

Create or open a project with:

- the VS Code wizard
- or an existing `xsmp.project`

Declare the project sources, profile and tools first. This gives the editor enough context to validate the rest of the workspace correctly.

## 2. Define your types in catalogues

Start modeling in `.xsmpcat` files:

- value types
- enumerations
- interfaces
- models
- services

Catalogues are the foundation for everything else.

## 3. Add runtime documents as needed

Use the other XSMP languages when the project grows:

- `.xsmpcfg` for reusable configuration data
- `.xsmpasb` for instantiated systems
- `.xsmplnk` for reusable link wiring
- `.xsmpsed` for schedules and activities

Not every project needs all of them.

## 4. Reuse examples

The repository `examples/` directory is a good place to study realistic structures:

- `01-foundation`
- `02-avionics`
- `04-orbital-segment`
- `06-mission-system`

Those examples show how catalogues, configurations, assemblies, links and schedules fit together.

## 5. Validate early

Use validation continuously in the editor. For workspace-level checks or CI, use the CLI:

```bash
xsmpproject-cli validate path/to/project
```

## 6. Generate outputs

Use the VS Code commands:

- `Xsmp: Generate Project`
- `Xsmp: Generate All Projects`

Or use the CLI:

```bash
xsmpproject-cli generate path/to/project
```

Generation uses the active profile and tools of the target project.

## 7. Keep project boundaries clear

When a project depends on another project:

- the modeling documents of the dependency become visible
- but the dependency's active tools and profile do not become active in the dependent project

That separation keeps large workspaces predictable.
