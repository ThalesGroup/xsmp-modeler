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

Generators implement `XsmpGenerator`. Each generator has a stable `id`, unique
within its contribution. For each project generation, XSMP Modeler calls
`prepare` once on every active generator, validates all output definitions, then
calls `generate` for each valid project document.

```ts
import { type AstNode } from 'langium';
import * as ast from '@xsmp/core/ast';
import type {
    GeneratedFiles, GenerationContext, GenerationPreparationContext, XsmpGenerator,
} from '@xsmp/core/generator';

export class DemoGenerator implements XsmpGenerator {
    readonly id = 'summary';

    prepare(context: GenerationPreparationContext): GeneratedFiles {
        return context.createFiles({
            generated: {
                directory: 'demo-gen',
                writeMode: 'if-changed',
                cleanup: 'directory',
            },
            user: {
                directory: 'src',
                writeMode: 'if-missing',
            },
        });
    }

    generate(node: AstNode, { files, acceptTask }: GenerationContext): void {
        if (ast.isCatalogue(node)) {
            acceptTask(() => files.write(
                'generated', `${node.name}-summary.md`, `# ${node.name}\n`,
            ));
            acceptTask(() => files.write(
                'user', `${node.name}-notes.md`, () => this.initialNotes(node),
            ));
        }
    }

    private initialNotes(catalogue: ast.Catalogue): string {
        return `# Notes for ${catalogue.name}\n`;
    }
}
```

The preparation context provides `projectUri`, `cancelToken` and `createFiles`.
The execution context provides the same project and cancellation token, the
prepared `files`, and `acceptTask`. Capture that context in tasks rather than
storing the current session in a field on the generator. Submit asynchronous
work through `acceptTask`; XSMP Modeler limits concurrency and drains all
accepted tasks before closing the session. Tasks cannot submit more work after
traversal has finished.

`files.write(outputName, relativePath, content)` accepts either a string or a
function returning `string | Promise<string>`. In `if-missing` mode, an existing
file skips the function and formatter entirely. When creation is needed, an
exclusive write preserves any file that appeared during rendering. In
`if-changed` mode, the content is produced and the file is written only when its
bytes differ. The function is called at most once per write; its errors fail
generation. Content functions should only produce content, since they can be
skipped. Pass a function for asynchronous rendering, not an already started
promise.

Paths are relative to the named output directory, itself relative to the
project. `files.resolvePath(outputName, relativePath)` resolves an input path
without disk access, for example to inspect an existing generation-gap header.
Output names separate the generator's rendering from a profile's directory
configuration. Repeated `if-missing` writes from the same generator and output
to the same normalized destination share the first request's result, including
any failure. Later content functions are not evaluated. This permits shared
files such as Python package initializers to be requested by several catalogues.
Conflicting writes involving `if-changed`, different generators or output names,
or ambiguous physical aliases remain errors.

Each output independently specifies its cleanup policy:

| `cleanup` | Behavior after complete successful generation |
| --- | --- |
| `none` (default) | Preserve obsolete files. Required for `if-missing`. |
| `tracked` | Remove obsolete files recorded as owned by this generator/output; preserve unknown files in the same directory. |
| `directory` | Synchronize a directory reserved for generated files, removing every unexpected file, including manual additions. |

Use `if-changed` with `directory` for `src-gen`, `include-gen`, `adoc-gen` and
`smdl-gen`. Use `if-changed` with `tracked` for generated Python modules in mixed
folders. Use `if-missing` for generation-gap files and Python user stubs. Mixed
outputs can share a directory; a directory purged in its entirety cannot contain
protected user outputs. Cleanup preserves the union of outputs from all active
generators. An unchanged file remains an expected output even when no write
occurs. Failure, cancellation or skipped invalid documents prevents cleanup
from starting. Cancellation remains available between files, including after
the first write and during cleanup. An in-flight filesystem operation finishes
before generation returns; files already written or removed are not rolled
back. Outputs may therefore temporarily reflect different generations.
Ownership of completed writes and pending deletions is saved even on
cancellation, so the next successful generation updates the remaining outputs
and completes cleanup, including after a restart.
Output directories differing only in case cannot use incompatible cleanup
policies, so the same configuration stays safe on case-insensitive volumes.
Declared output roots are kept in place, including nested roots. Empty
subdirectories locked by another process on Windows are left for a later
generation to prune. Failure to remove an obsolete file is still reported.

Selective cleanup uses the project's `.xsmp/generated-files.json` inventory,
which records generator/output ownership and paths, not file contents. Keep this
local metadata across sessions to remove obsolete generated modules after a
restart; exclude `.xsmp/` from version control. Missing or corrupt inventory
preserves unknown files. Changing an output directory, removing a generator or
changing ownership does not implicitly authorize deletion in the old location.

Outputs may specify an optional `formatter`. The common writer caches only
SHA-256 hashes of raw and formatted bytes, the output path, and the formatter's
identity. It skips formatting only when the new raw hash, formatter identity and
actual disk hash match the preceding result. It always checks current disk
bytes, so an external edit or deletion is repaired at the next generation.
The bounded metadata cache is shared across project generations; eviction or a
restart only requires recomputation. It retains no generated text, ASTs or
content functions. Python, ADoc and SMP currently use direct byte comparison
without a formatter. Opening a workspace with startup generation disabled does
not write or delete outputs.
Model inputs, formatter configuration and tool version must remain stable during
a generation; changes are re-evaluated on the next pass.
The C++ formatter identifies configuration by hashing `.clang-format` and
`_clang-format` files in the output directory and every ancestor, plus its version
and the output extension. Ancestor reads are shared within a pass, without
starting a configuration process per directory. This fingerprint is conservative:
changing an unused parent configuration may also require reformatting.

### Migrating Existing Generators

The extension API is `2.0.0`. After migrating, set `apiVersion` to `^2.0.0`
in the contribution manifest; extensions requiring API 1 are not loaded.

Add a stable generator `id`. Replace `clean` with
`prepare(context): GeneratedFiles`, returning `context.createFiles` with named
output definitions. Change `generate(node, projectUri, acceptTask)` to
`generate(node, context)`, and replace direct writes with
`context.files.write(outputName, relativePath, content)`. Use lazy content for
files generated only when missing. Remove generator-side deletion and formatting
caches: the common writer owns disk comparison, optional formatting, ownership
and cleanup. Keep rendering caches tied to their model documents as before.

C++ subclasses now return text from `generatePackageHeader`,
`generatePackageSource`, `generateDynamicPackageSource`, `generateHeader`,
`generateSource`, `generateHeaderGen` and `generateSourceGen`. These methods no
longer write files. Remove overrides of the former `generateFile` and `format`
methods; output writing and formatting belong to the common writer.

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

