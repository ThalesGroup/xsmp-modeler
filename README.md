
> ⚠️ **Warning:** This project is a work in progress conversion of [XSMP-Modeler-Core](https://github.com/ThalesGroup/xsmp-modeler-core) from [Xtext](https://eclipse.dev/Xtext/documentation/index.html) to [Langium](https://langium.org/docs/introduction/).

Features status:
- [x] xsmp.project - Grammar
- [x] xsmp.project - Scoping
- [x] xsmp.project - Validation
- [x] xsmp.project - Formatter
- [x] xsmp.project - Documentation on hover
- [x] xsmp.project - Content Assist
- [x] Project Wizard
- [x] xsmpcat - Grammar
- [x] xsmpcat - Scoping
- [x] xsmpcat - Documentation on hover
- [x] xsmpcat - Validation
- [x] xsmpcat - Formatter
- [x] xsmpcat - Quickfixs
- [x] xsmpcat - Content Assist
- [x] SMP Tool - generator
- [ ] SMP Tool - import
- [ ] AsciiDoc Tool - generator
- [ ] xsmp-sdk Profile - generator (in progress)
- [ ] esa-cdk Profile - generator
- [ ] Command Line Interface



# XSMP Modeler

[![CI](https://github.com/ydaveluy/xsmp-modeler/actions/workflows/action.yml/badge.svg)](https://github.com/ydaveluy/xsmp-modeler/actions/workflows/action.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ydaveluy_xsmp-modeler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ydaveluy_xsmp-modeler)



XSMP Modeler is a framework for the development of SMDL (Simulation Model Definition Language) as defined in the [ECSS SMP standard](https://ecss.nl/standard/ecss-e-st-40-07c-simulation-modelling-platform-2-march-2020/).

Supported IDEs:
- Visual Studio Code: available in [Marketplace](https://marketplace.visualstudio.com/items?itemName=ydaveluy.xsmp-modeler&ssr=false#overview).
- Eclipse: see project [xsmp-modeler-eclipse](https://github.com/ydaveluy/xsmp-modeler-eclipse)).

It includes:
- An integrated text editor with syntax highlighting, error checking, auto-completion, formatting, hover information, outline, quick fixes, and more.
- Specific profiles for each framework.
- Additional tools for extended capabilities.

## Profiles

XSMP Modeler offers specific profiles to enhance its functionality:

- **XSMP SDK Profile**: Seamlessly integrates with the [XSMP SDK](https://github.com/ThalesGroup/xsmp-sdk) framework to facilitate the development and testing of SMP components.
- **ESA-CDK Profile**: Specific profile designed for use with the ESA Component Development Kit (ESA-CDK).

## Tools

XSMP Modeler provides additional tools to extend its functionality:

- **SMP Tool**: Generates SMP modeling files (smpcat, smppkg) from XSMP textual modeling files.
- **AsciiDoc Tool**: Generates AsciiDoc documentation from XSMP modeling files.



## License

This project is licensed under the [MIT License](LICENSE.md).
