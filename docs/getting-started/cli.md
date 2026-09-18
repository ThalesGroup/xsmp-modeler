# Command Line Interface

XSMP Modeler ships with a project-oriented CLI.

The `validate` and `generate` commands work at project level. They load the target project, scan a workspace root to discover related `xsmp.project` files, resolve dependencies by project name, check the target project together with its visible dependencies, and can run the generators selected for that project.

## Main commands

The CLI provides these commands:

- `new project [name] [directory]`
- `validate <path>`
- `generate <path>`
- `import-smp <path>`

The executable is named `xsmp`. From the npm workspace, run it with
`npm exec -- xsmp`; GitHub releases distribute the standalone
`xsmp-<version>.cjs` artifact described below. The `@xsmp/cli` workspace package
is not currently published to npm.

## Create a project

Run the project wizard in an interactive terminal:

```bash
npm exec -- xsmp new project
```

The wizard asks only for values which were not supplied on the command line,
then shows a summary before creating the project.

For scripts and CI, provide the project name and parent directory explicitly:

```bash
npm exec -- xsmp new project Mission ./workspace \
  --profile xsmp-sdk \
  --tool smp \
  --tool python \
  --no-interactive
```

This creates `./workspace/Mission`. `--profile` accepts one profile and `--tool`
can be repeated. Both are optional: when omitted in scriptable mode, no profile
or tool is enabled. In interactive mode, the wizard proposes the available
contributions and allows selecting none. `--yes` skips prompts and confirmation;
omitted contributions remain disabled.

Contribution-specific wizard values can be supplied with a repeatable option:

```bash
--set profile.<id>.<prompt>=value
--set tool.<id>.<prompt>=value
```

When input or output is not a terminal, the command never prompts. Defaults for
contribution-specific settings apply only to explicitly selected contributions;
a missing required setting without a default is an error. Existing project
directories are never overwritten.

`<path>` can be:

- a project directory containing `xsmp.project`
- or the `xsmp.project` file itself

## Run from a GitHub release

Download the CLI artifact `xsmp-<version>.cjs` from the
[GitHub Releases page](https://github.com/ThalesGroup/xsmp-modeler/releases).

The release artifact is a single JavaScript file. Run it with Node.js `22.13.0`
or newer:

```bash
node xsmp-<version>.cjs --help
```

```bash
node xsmp-<version>.cjs new project Mission ./workspace \
  --profile xsmp-sdk \
  --tool smp \
  --tool python \
  --no-interactive
```

```bash
node xsmp-<version>.cjs validate path/to/project
```

```bash
node xsmp-<version>.cjs generate path/to/project
```

## Workspace root discovery

The `validate` and `generate` commands support:

```bash
--workspace-root <dir>
```

If you do not provide it, XSMP Modeler uses the parent directory of the target project directory.

The workspace root is scanned recursively for `xsmp.project` files so that dependencies declared with `dependency '<project-name>'` can be resolved.

## Validation behavior

`validate` reports errors and warnings only for:

- the target project
- the projects reachable through its dependencies
- the modeling documents visible from that dependency closure

Errors and warnings from unrelated projects that happen to exist in the selected workspace root do not fail the command.

If a declared dependency is missing from the selected workspace root, the CLI reports an explicit error.

## Generation behavior

`generate` first validates the target project and its visible dependency closure.

Generation runs only if no validation errors remain in that scope. When validation succeeds, XSMP Modeler runs the generators contributed by the tools and profile declared in the target project's `xsmp.project`.

Dependencies do not contribute their own active tools or profiles to the target project.

## Exit codes

The CLI uses these exit codes:

- `0`: success
- `1`: validation errors on the target project or its visible dependencies
- `2`: usage, input, operational or startup failure

## Examples

Validate a project directory:

```bash
node xsmp-<version>.cjs validate path/to/missionsystem
```

Validate a project file explicitly:

```bash
node xsmp-<version>.cjs validate path/to/missionsystem/xsmp.project
```

Generate with an explicit workspace root:

```bash
node xsmp-<version>.cjs generate path/to/missionsystem --workspace-root path/to/workspace
```
