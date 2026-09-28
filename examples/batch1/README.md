# Runtime example

`scene.xml` is a self-contained, four-second scene demonstrating the temporal
runtime: a numeric parameter with a bound color variant, markers and a beat
grid, a pure expression driving position, keyframed fill and depth, a
conditional shape and a link-driven property, and an SVG motion path animated
by progress. It needs no external assets.

```sh
node bin/scene-render.js render examples/batch1/scene.xml
node bin/scene-render.js render examples/batch1/scene.xml --variant warm --param distance=180
```

See [docs/runtime.md](../../docs/runtime.md) for the full runtime contract.
