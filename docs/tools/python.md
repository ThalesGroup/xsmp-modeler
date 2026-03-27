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

- Python-related generation
- wizard templates for Python test assets

Typical wizard-created files include:

- `pytest.ini`
- `python/<project-identifier>/test_<project-identifier>.py`

## Typical project snippet

```text
project 'mission-demo'
source 'smdl'
tool 'python'
```

## Expected result

With `python` enabled, XSMP Modeler can generate Python-oriented outputs and prepare the project for Python-based testing workflows.
