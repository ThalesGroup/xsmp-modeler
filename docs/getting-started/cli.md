# Command Line Interface

XSMP Modeler ships with a project-oriented CLI.

The CLI works at project level, not file level. It loads the target project, scans a workspace root to discover related `xsmp.project` files, resolves dependencies by project name, checks the target project together with its visible dependencies, and can run the generators selected for that project.

## Main commands

The CLI currently provides two commands:

- `validate <path>`
- `generate <path>`

`<path>` can be:

- a project directory containing `xsmp.project`
- or the `xsmp.project` file itself

## Local usage from this repository

From a local checkout, use:

```bash
npm run cli -- validate examples/04-orbital-segment
```

```bash
npm run cli -- generate examples/04-orbital-segment
```

If the CLI is installed as a command on your machine, you can also use:

```bash
xsmpproject-cli validate path/to/project
xsmpproject-cli generate path/to/project
```

## Workspace root discovery

Both commands support:

```bash
--workspace-root <dir>
```

If you do not provide it, XSMP Modeler uses the parent directory of the target project directory.

The workspace root is scanned recursively for `xsmp.project` files so that dependencies declared with `dependency "<project-name>"` can be resolved.

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
- `2`: usage error, input error or startup failure

## Examples

Validate a project directory:

```bash
xsmpproject-cli validate path/to/missionsystem
```

Validate a project file explicitly:

```bash
xsmpproject-cli validate path/to/missionsystem/xsmp.project
```

Generate with an explicit workspace root:

```bash
xsmpproject-cli generate path/to/missionsystem --workspace-root path/to/workspace
```
