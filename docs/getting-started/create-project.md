# Create a Project

The fastest way to start a new XSMP workspace is the built-in VS Code wizard.

## Start the wizard

Run the command:

- `Xsmp: Create a new project`

The wizard walks through the following steps:

1. Choose the destination folder that will contain the new project directory.
2. Enter the project name.
3. Select one profile, if needed.
4. Select zero or more tools.
5. Answer any extra prompts contributed by the selected profile or tools.

## What the wizard creates

At minimum, the wizard creates:

- one project folder
- one `xsmp.project` file
- one `smdl/` source directory
- one starter `.xsmpcat` catalogue file

Depending on the selected profile and tools, the wizard may also add project-specific files such as:

- `CMakeLists.txt`
- `README.md`
- `doc/`
- `python/`
- `pytest.ini`

## Typical generated structure

```text
MyProject/
├── xsmp.project
└── smdl/
    └── MyProject.xsmpcat
```

If you select additional tools or profiles, the structure can grow with documentation, Python or build-related files.

## Example `xsmp.project`

The wizard generates an `xsmp.project` file that looks like this in principle:

```text
project "MissionDemo"

source "smdl"

profile "xsmp-sdk"
tool "smp"
tool "adoc"
```

It may also add `dependency` entries if a selected contribution scaffolder asks for them.

## After creation

After the wizard finishes:

- the new project is added to the current workspace if needed
- the starter catalogue is opened automatically
- you can begin modeling immediately

## Recommended next steps

1. Edit the generated catalogue.
2. Add more XSMP files under `smdl/`.
3. Run `Xsmp: Generate Project` when you want generated outputs.
4. Read [Projects, Tools and Profiles](../concepts/projects-tools-profiles.md) to understand how the project is configured.
