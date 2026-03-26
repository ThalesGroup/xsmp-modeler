# XSMP Examples

This workspace contains a small but connected XSMP landscape:

- `01-foundation`: reusable types, event types, and interfaces
- `02-avionics`: models and typed configurations built on top of `foundation`
- `03-payload`: models and typed configurations built on top of `foundation`
- `04-orbital-segment`: local models, assembly, configuration, link base, and schedule using `avionics`
- `05-payload-segment`: local models, assembly, configuration, link base, and schedule using `payload`
- `06-mission-system`: parent assembly project integrating all previous projects

The examples intentionally exercise recent XSMP features as well:

- typed `Configuration` paths with explicit `: component` anchors
- safe numeric literals without suffixes when the target type is inferred
- `unsafe` paths on configuration includes
- typed `LinkBase` roots with `for <Assembly>`
- typed `Schedule` tasks with `task Name: component`
- templated assembly identifiers such as `Avionics{Lane}` and `Ground{OrbitTag}`
- templated L2 paths imported from assembly parameters in link bases and schedules

Open `examples.code-workspace` in this folder to load the whole demo workspace in VS Code.
