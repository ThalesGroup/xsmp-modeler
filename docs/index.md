# XSMP Modeler

XSMP Modeler is a Visual Studio Code extension and tooling stack for authoring XSMP models with a textual workflow. It supports project configuration, catalogues, configurations, assemblies, link bases and schedules, together with generators and user-facing tooling such as a project wizard and a CLI.

This documentation is intentionally user-oriented. It focuses on how to install the extension, create and work with projects, understand each XSMP language, and use the built-in tools and profiles effectively.

## What you can do with XSMP Modeler

- Create XSMP projects directly from VS Code with the project wizard.
- Edit the full XSMP language set with validation, hover, completion and formatting.
- Organize models into projects with dependencies, tools and profiles.
- Generate SMP XML artifacts, AsciiDoc outputs and Python-oriented assets.
- Validate and generate from the command line as part of local or CI workflows.

## Supported languages

XSMP Modeler currently covers these user-facing languages:

| Language | File name / extension | Purpose |
| --- | --- | --- |
| Project | `xsmp.project` | Declares sources, dependencies, tools and profiles |
| Catalogue | `.xsmpcat` | Defines types, components and interfaces |
| Configuration | `.xsmpcfg` | Defines reusable configuration data |
| Assembly | `.xsmpasb` | Instantiates and configures systems |
| Link base | `.xsmplnk` | Declares reusable links |
| Schedule | `.xsmpsed` | Declares tasks, events and activities |

## Quick start

1. [Install XSMP Modeler in VS Code](getting-started/install-vscode.md).
2. Use the [project wizard](getting-started/create-project.md) to create a project.
3. Read the [project, tools and profiles concepts](concepts/projects-tools-profiles.md).
4. Start with the [language overview](languages/overview.md), then open the page for the file type you are editing.
5. Use the [CLI](getting-started/cli.md) or the VS Code generation commands when you need generated outputs.

## Where to go next

- If you are new to XSMP Modeler, start with [Install in VS Code](getting-started/install-vscode.md).
- If you already have the extension installed, go straight to [Create a Project](getting-started/create-project.md).
- If you want the language reference, begin with [Languages Overview](languages/overview.md).
