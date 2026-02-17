# XSMP Modeler

[![CI](https://github.com/ThalesGroup/xsmp-modeler/actions/workflows/action.yml/badge.svg)](https://github.com/ThalesGroup/xsmp-modeler/actions/workflows/action.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ydaveluy_xsmp-modeler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ydaveluy_xsmp-modeler)

XSMP Modeler is a framework for developing SMDL (Simulation Model Definition Language) models as defined in the [ECSS SMP standard — Level 1](https://ecss.nl/standard/ecss-e-st-40-07c-simulation-modelling-platform-2-march-2020/) and provides a preview of the [ECSS SMP standard — Level 2](https://ecss.nl/standard/ecss-e-st-40-08c-simulation-modelling-platform-level-2-5-august-2025/).

Features:

- Integrated text editor with syntax highlighting, error checking, auto-completion, formatting, hover information, outline view, quick fixes, and more.
- Profiles tailored for different target frameworks.
- Additional tools for documentation and code generation.

## Installation

### Visual Studio Code

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ydaveluy.xsmp-modeler).


## Profiles

XSMP Modeler provides profiles to adapt the tooling to different environments:

- **XSMP SDK Profile**: Integrates with the [XSMP SDK](https://github.com/ThalesGroup/xsmp-sdk) to facilitate development and testing of SMP components.
- **ESA-CDK Profile**: Intended for use with the ESA Component Development Kit (ESA-CDK).

## Tools

- **SMP Tool**: Generates SMP modeling artifacts (smpcat, smppkg, smpcfg, smplnk, smpasb) from XSMP textual models.
- **AsciiDoc Tool**: Generates AsciiDoc documentation from XSMP models.

## Sponsors

<a href="https://cnes.fr"><img src="icons/logo_cnes.png" align="center" height="121" width="142" alt="Cnes"></a>

## License

This project is licensed under the [MIT License](LICENSE).