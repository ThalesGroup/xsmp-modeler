# Install XSMP Modeler in VS Code

XSMP Modeler is distributed as a Visual Studio Code extension.

## Install from the Marketplace

1. Open **Visual Studio Code**.
2. Open the **Extensions** view.
3. Search for **XSMP Modeler**.
4. Install the extension published as `ydaveluy.xsmp-modeler`.

You can also install it directly from the Visual Studio Marketplace:

- [XSMP Modeler on the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ydaveluy.xsmp-modeler)

## Open an XSMP workspace

After installation:

1. Open an existing XSMP workspace or a folder that will contain XSMP projects.
2. Open or create an `xsmp.project` file.
3. VS Code should recognize XSMP file types automatically:
   - `xsmp.project`
   - `.xsmpcat`
   - `.xsmpcfg`
   - `.xsmpasb`
   - `.xsmplnk`
   - `.xsmpsed`

## What becomes available in VS Code

Once the extension is active, you get:

- syntax highlighting
- validation diagnostics
- content assist
- hover documentation
- formatting
- outline support
- quick fixes
- built-in XSMP commands

The most important commands for daily work are:

- `Xsmp: Create a new project`
- `Xsmp: Generate Project`
- `Xsmp: Generate All Projects`

## Optional startup generation

The extension provides a setting named `xsmp.generateAllOnStartup`.

- Default: `false`
- When enabled: VS Code automatically runs **Generate All Projects** after XSMP has loaded the workspace

This is useful when you want generated artifacts to stay in sync each time the workspace opens.

## Next step

Continue with [Create a Project](create-project.md) to build your first XSMP workspace.
