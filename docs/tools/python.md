# Python Tool

`python` adds Python-oriented generation and test scaffolding to an XSMP project.

## When to use it

Use `python` when you want:

- Python bindings or wrappers generated from XSMP content
- starter Python test files from the wizard

## How to enable it

Add this to `xsmp.project`:

```text
tool 'python'
```

## What it adds

The tool contributes:

- Python-related generation for supported XSMP workflows
- wizard templates for Python test assets

Typical files added by the tool include:

- `pytest.ini`
- `python/<project-identifier>/test_<project-identifier>.py`

## Typical project snippet

```text
project 'mission-demo'
source 'smdl'
tool 'python'
```

## Expected result

With `python` enabled, XSMP Modeler can generate Python-oriented outputs and prepare the project for Python-based testing workflows around the active profile and tools.

Catalogue, namespace and component names that are Python keywords receive a leading
underscore in Python. For example, namespace `from` becomes `_from` and model `None`
becomes `_None`. This cannot collide with another valid XSMP name, which must start
with a letter. Use explicit imports for these names, since Python excludes names
beginning with an underscore from `import *`. The catalogue names and component
UUIDs remain unchanged.
