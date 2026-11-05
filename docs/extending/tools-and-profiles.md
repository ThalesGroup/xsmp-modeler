# Create Tools and Profiles

XSMP Modeler can be extended with custom tools and profiles. A contribution is
loaded by XSMP Modeler, made available in `xsmp.project`, and then applied only
to projects that enable it.

A complete demonstration repository is available at
[ydaveluy/xsmp-tool-demo](https://github.com/ydaveluy/xsmp-tool-demo). It shows
a VS Code extension package that contributes a generator and a validator.

## Choose a Contribution Kind

Use a tool when the behavior is optional and task-oriented:

- export or generate extra files
- add checks for a specific workflow
- scaffold optional folders or configuration files

Use a profile when the behavior represents a project convention or target
platform:

- select one project layout or runtime ecosystem
- add profile-specific generation
- add validation rules that should apply to the whole project

Projects can enable several tools, but at most one profile:

```text
project 'mission-demo'
source 'smdl'
profile 'xsmp-sdk'
tool 'smp'
tool 'adoc'
```

## Package Layout

An external contribution is usually packaged as a VS Code extension that depends
on XSMP Modeler:

```text
xsmp-tool-demo/
  package.json
  src/
    demo.xsmptool
    contributor.ts
    generator.ts
    validator.ts
```

The extension manifest exposes the XSMP contribution through `contributes.xsmp`:

```json
{
  "extensionDependencies": [
    "ydaveluy.xsmp-modeler"
  ],
  "contributes": {
    "xsmp": [
      {
        "descriptor": "./lib/demo.xsmptool",
        "handler": "./lib/contributor.js",
        "apiVersion": "^2.0.0"
      }
    ]
  },
  "dependencies": {
    "@xsmp/core": "^2.0.0",
    "langium": "4.2.4"
  }
}
```

The descriptor is a small XSMP contribution document. Tools use `.xsmptool`:

```text
/**
 * Demo XSMP tool.
 */
tool 'demo-tool'
```

Profiles use `.xsmpprofile`:

```text
/**
 * Demo XSMP profile.
 */
profile 'demo-profile'
```

The identifier declared by the descriptor is the identifier used in
`xsmp.project`:

```text
tool 'demo-tool'
```

## Register the Contribution

The handler must export `registerContribution`. XSMP Modeler calls it once the
descriptor has been loaded.

```ts
import { DemoGenerator } from './generator.js';
import { registerDemoValidation } from './validator.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'Demo Tool',
        description: 'Demonstrates a custom generator and validator.',
    });

    api.addGenerator(services => new DemoGenerator(services));
    api.addValidation('xsmpcat', registerDemoValidation);
}
```

The same handler shape is used by tools and profiles. The descriptor determines
whether the contribution is a `tool` or a `profile`.

## Add a Generator

Generators implement `XsmpGenerator`. For each project, XSMP Modeler calls
`prepareGeneration` once on every active generator, then calls `generate` for
each valid project document.

```ts
import { AstUtils, UriUtils, type AstNode, type URI } from 'langium';
import * as ast from '@xsmp/core/ast';
import { GeneratedFiles, type TaskAcceptor, type XsmpGenerator } from '@xsmp/core/generator';

export class DemoGenerator implements XsmpGenerator {
    private outputs = new GeneratedFiles();

    prepareGeneration(projectUri: URI): GeneratedFiles {
        return this.outputs = new GeneratedFiles([
            UriUtils.joinPath(projectUri, 'demo-gen').fsPath,
        ]);
    }

    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor): void {
        if (ast.isCatalogue(node)) {
            acceptTask(() => this.generateCatalogue(node, projectUri));
        }
    }

    private async generateCatalogue(catalogue: ast.Catalogue, projectUri: URI): Promise<void> {
        const outputDir = UriUtils.joinPath(projectUri, 'demo-gen');
        const sourceName = UriUtils.basename(AstUtils.getDocument(catalogue).uri)
            .replace(/\.[^.]+$/, '');
        await this.outputs.write(
            UriUtils.joinPath(outputDir, `${sourceName}-summary.md`).fsPath,
            `# ${catalogue.name}\n`,
        );
    }
}
```

Create a fresh `GeneratedFiles` in `prepareGeneration` and use that same object
for all the project's writes. Its `write` method records the output path,
creates parent directories, and preserves the file when its contents are unchanged.
Submit asynchronous work through `acceptTask`: tasks may start during traversal,
and XSMP Modeler waits for all accepted tasks before starting another generation.

Declare only wholly generated folders in `GeneratedFiles`. Stale-output removal
starts only after all generators and tasks succeed: XSMP Modeler removes files
in those folders that no active generator produced. It keeps the root folders,
so a terminal opened in one does not prevent generation on Windows. Failure or
cancellation before this stage, or skipped invalid documents, preserves stale
files. A failure to remove stale files is reported as a warning after generation.

Files in mixed folders can also be written through `GeneratedFiles`, but their
folders must not be declared for removal. In particular, exclude generation-gap
source folders and folders containing user-written Python modules. Pass no
folders to `new GeneratedFiles()` if none is wholly generated.

### Migrating Existing Generators

The extension API is now `2.0.0`. After migrating, set `apiVersion` to `^2.0.0`
in the contribution manifest; extensions requiring API 1 are not loaded.

`prepareGeneration` is required; the previous `clean` method and
`cleanGeneratedFolders` helper have been removed. Move per-generation state
initialization from `clean` to `prepareGeneration`, return a `GeneratedFiles`
with the formerly cleaned folders, and replace generated-file writes with
`GeneratedFiles.write`. Remove any deletion before generation: stale-output
removal now belongs to XSMP Modeler and uses all generators' output paths.

## Add Validation

Validation is registered per XSMP language. The category passed to the registrar
is the active contribution id; XSMP Modeler runs that category only for projects
that enable the tool or profile.

```ts
import type { ValidationAcceptor, ValidationChecks } from 'langium';
import * as ast from '@xsmp/core/ast-partial';
import type { XsmpcatServices } from '@xsmp/core';

export function registerDemoValidation(services: XsmpcatServices, category: string): void {
    const registry = services.validation.ValidationRegistry;
    const validator = new DemoCatalogueValidator();
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Catalogue: validator.checkCatalogue,
        NamedElement: validator.checkNamedElement,
    };

    registry.register(checks, validator, category);
}

class DemoCatalogueValidator {
    checkCatalogue(catalogue: ast.Catalogue, accept: ValidationAcceptor): void {
        if (!catalogue.elements.some(ast.isNamespace)) {
            accept('warning', 'Catalogue should contain at least one namespace.', {
                node: catalogue,
                keyword: 'catalogue',
            });
        }
    }

    checkNamedElement(element: ast.NamedElement, accept: ValidationAcceptor): void {
        if (element.name?.startsWith('tmp')) {
            accept('warning', "Avoid public XSMP names prefixed with 'tmp'.", {
                node: element,
                property: 'name',
            });
        }
    }
}
```

Available language ids are:

- `xsmpproject`
- `xsmpcat`
- `xsmpcfg`
- `xsmpasb`
- `xsmplnk`
- `xsmpsed`

## Add Wizard Scaffolding

Tools and profiles can also add project wizard content:

```ts
import * as path from 'node:path';
import type { XsmpContributionScaffoldContext } from '@xsmp/core/contributions';

export async function scaffoldDemoTool(context: XsmpContributionScaffoldContext): Promise<void> {
    await context.writeFile(
        path.join(context.projectDir, 'README.demo-tool.md'),
        'This project enables the demo tool.\n',
    );
}
```

Register it from the handler:

```ts
api.setScaffolder(scaffoldDemoTool);
```

The scaffolder can create files, ensure directories, read prompt values, and add
project dependencies requested by the contribution.

## Include Built-in Model Files

If the contribution ships reusable XSMP model files, add them through the
manifest `builtins` list:

```json
{
  "contributes": {
    "xsmp": [
      {
        "descriptor": "./lib/demo-profile.xsmpprofile",
        "handler": "./lib/contributor.js",
        "apiVersion": "^2.0.0",
        "builtins": [
          "./lib/builtins"
        ]
      }
    ]
  }
}
```

Built-in model files are visible only to projects that enable the contribution.
They are not inherited through project dependencies.

## Development Checklist

1. Add `@xsmp/core` and `langium` dependencies.
2. Create a `.xsmptool` or `.xsmpprofile` descriptor.
3. Add a `contributes.xsmp` manifest entry in `package.json`.
4. Export `registerContribution` from the handler.
5. Register generators, validations, scaffolding or built-in model files.
6. Compile the handler and copy descriptors into the packaged extension.
7. Package the extension with `vsce package --no-dependencies`.
8. Install the VSIX next to XSMP Modeler and enable the contribution in
   `xsmp.project`.

