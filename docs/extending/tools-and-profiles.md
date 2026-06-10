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
        "apiVersion": "^1.0.0"
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

Generators implement `XsmpGenerator`. XSMP Modeler calls `generate` for each
document that belongs to a project where the tool or profile is active.

```ts
import * as fs from 'node:fs';
import { AstUtils, UriUtils, type AstNode, type URI } from 'langium';
import * as ast from '@xsmp/core/ast';
import type { TaskAcceptor, XsmpGenerator } from '@xsmp/core/generator';

export class DemoGenerator implements XsmpGenerator {
    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor): void {
        if (ast.isCatalogue(node)) {
            acceptTask(() => this.generateCatalogue(node, projectUri));
        }
    }

    clean(projectUri: URI): void {
        fs.rmSync(UriUtils.joinPath(projectUri, 'demo-gen').fsPath, {
            recursive: true,
            force: true,
        });
    }

    private async generateCatalogue(catalogue: ast.Catalogue, projectUri: URI): Promise<void> {
        const outputDir = UriUtils.joinPath(projectUri, 'demo-gen');
        await fs.promises.mkdir(outputDir.fsPath, { recursive: true });

        const sourceName = UriUtils.basename(AstUtils.getDocument(catalogue).uri)
            .replace(/\.[^.]+$/, '');
        await fs.promises.writeFile(
            UriUtils.joinPath(outputDir, `${sourceName}-summary.md`).fsPath,
            `# ${catalogue.name}\n`,
        );
    }
}
```

Use `acceptTask` for file system writes. This lets XSMP Modeler collect all
generation tasks and run them after traversal.

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
        "apiVersion": "^1.0.0",
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

