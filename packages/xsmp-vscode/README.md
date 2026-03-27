# XSMP Modeler for VS Code

XSMP Modeler brings the XSMP language family to Visual Studio Code for day-to-day modeling work on ECSS SMP projects.

## Features

- syntax highlighting for `xsmp.project`, catalogue, configuration, assembly, link base, and schedule files
- validation, cross references, rename support, formatting, completion, and code actions
- project and file wizards to bootstrap new XSMP content
- project generation commands from VS Code
- embedded user documentation available directly from keyword hovers
- native SMP support through in-memory XSMP mirrors for `.smpcat`, `.smpcfg`, `.smplnk`, `.smpasb`, and `.smpsed` files found in project source folders

## Installation

Install **XSMP Modeler** from the Visual Studio Marketplace:

- <https://marketplace.visualstudio.com/items?itemName=ydaveluy.xsmp-modeler>

You can also search for `XSMP Modeler` directly from the VS Code Extensions view.

## Commands

The extension contributes the following XSMP commands:

- `Xsmp: Create a new project`
- `Xsmp: Create XSMP File`
- `Xsmp: Create Catalogue File`
- `Xsmp: Create Configuration File`
- `Xsmp: Create Assembly File`
- `Xsmp: Create Link Base File`
- `Xsmp: Create Schedule File`
- `Xsmp: Generate Project`
- `Xsmp: Generate All Projects`
- `Xsmp: Import SMP File`

## Settings

- `xsmp.generateOnSave`: automatically generate the current project when saving an XSMP document
- `xsmp.generateAllOnStartup`: generate all projects once after the workspace loads

## Documentation

The full user documentation is published at:

- <https://thalesgroup.github.io/xsmp-modeler/>

The packaged extension also embeds that documentation so it remains available offline inside VS Code.

## Repository

The source code for the extension, CLI, core library, and built-in packages lives in the XSMP monorepo:

- <https://github.com/ThalesGroup/xsmp-modeler>
