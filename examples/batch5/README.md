# 3D backend examples

Three scenes share this folder and its `assets/`. All three use the licensed
Inter font (`assets/inter.woff2`, `assets/INTER-OFL.txt`).

| Scene | Demonstrates | Extra assets | Output |
| --- | --- | --- | --- |
| `geometry.xml` | Unlit reference scene: geometry without lighting, transparency, parenting and camera | — | `geometry-preview.mp4`, `geometry-poster.png` |
| `extended.xml` | Materials, motion and dynamics: Cycles CPU PBR/OSL, MaterialX (`assets/satin.mtlx`), depth of field, lights, animation, particles, mesh deformation and rigid-body collision, with an explicit SHA-256-pinned physics cache (`assets/physics.json`) | `assets/satin.mtlx`, `assets/physics.json` | `extended-preview.mp4`, `extended-poster.png` |
| `completion.xml` | Cross-feature integration: masked 3D group isolation, mapped shadows, projected deformation and particles colliding with an animated rigid fixture | — | `completion-preview.mp4`, `completion-poster.png` |

```sh
node bin/scene-render.js render examples/batch5/geometry.xml
node bin/scene-render.js render examples/batch5/extended.xml
node bin/scene-render.js render examples/batch5/completion.xml
```

`extended.xml` and `completion.xml` need the optional 3D Python backend
(Blender/Cycles + MaterialX in `.venv-3d`); see [docs/geometry-3d.md](../../docs/geometry-3d.md)
for setup. `geometry.xml` renders with the built-in unlit path and needs no
extra environment. See [docs/batch5-validation.md](../../docs/batch5-validation.md)
for the acceptance evidence behind each rendered output.
