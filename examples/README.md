# XSMP Examples

This workspace contains a small but connected XSMP landscape:

- `01-foundation`: reusable types, event types, and interfaces
- `02-avionics`: models and typed configurations built on top of `foundation`
- `03-payload`: models and typed configurations built on top of `foundation`
- `04-orbital-segment`: local models, assembly, configuration, link base, and schedule using `avionics`
- `05-payload-segment`: local models, assembly, configuration, link base, and schedule using `payload`
- `06-mission-system`: parent assembly project integrating all previous projects

Open `examples.code-workspace` in this folder to load the whole demo workspace in VS Code.
