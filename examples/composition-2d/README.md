# Composition example

`scene.xml` is a two-second, dependency-free scene demonstrating affine 2D
composition: linear and radial gradient paints, vector shapes and blend/stroke
styling, a symbol instanced twice, a repeated dot row, a clipped bar group
driven by an expression, and a second, portrait-reframed output driven by a
named layout. It needs no external assets.

```sh
node bin/scene-render.js render examples/composition-2d/scene.xml
node bin/scene-render.js render examples/composition-2d/scene.xml --output portrait
```

See [docs/composition-2d.md](../../docs/composition-2d.md) for the full
composition contract.
