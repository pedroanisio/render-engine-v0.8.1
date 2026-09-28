# Examples

Every example is a self-contained folder: one or more scene XML files, any
assets they need under `assets/`, and a short `README.md` describing what each
scene demonstrates and how to render it. None of these folders depend on
another. Rendered output (`preview.mp4`, `poster.png`, and similar) is checked
in for the examples that ship reviewed evidence; re-rendering overwrites it in
place.

| Folder | Demonstrates | Depends on |
| --- | --- | --- |
| [`batch1/`](batch1/) | Runtime: parameters/variants, markers, expressions, keyframes, conditions, links, motion paths | — |
| [`composition-2d/`](composition-2d/) | 2D composition: paints, shapes, symbols, repeats, clipping, responsive layout | — |
| [`batch3/`](batch3/) | Media and typography: fonts, generators, charts, TeX formulas, QR codes | Bundled Inter font |
| [`batch4/`](batch4/) | Effects, transitions and managed color: glow/CDL/hue effects, crossfade/wipe, GLSL shader, ACEScg/AgX | Bundled Inter font, WAV bed, GLSL shader |
| [`batch5/`](batch5/) | 3D backend, three scenes: `geometry.xml` (unlit primitives, parenting, transparency, occlusion), `extended.xml` (PBR/MaterialX, deformation, lights, Planck physics) and `completion.xml` (group isolation, mapped shadows, projected deformation, particle collision) | Bundled Inter font, MaterialX source, hashed physics cache |
| [`batch6/`](batch6/) | Audio, captions and accessibility: bus routing, ducking, EQ/compression/delay, Portuguese WebVTT, accessibility report | Bundled Inter font, generated WAV audio (`create-audio.mjs`) |
| [`batch7/`](batch7/) | Verified exports: H.264/MP4, animated WebP, FFV1 alpha, linear EXR sequence, PNG/JPEG/WebP/AVIF stills, all from one scene. Nests [`beta-pictoris/`](batch7/beta-pictoris/): diagnostic evidence for an unrelated external project (anchor-mode audit, frame/contrast checks), not a feature demo and not runnable here | Bundled Inter font; `beta-pictoris/` needs its own (unbundled) project assets, see its README |

Each folder's own `README.md` has the exact render command and the output
files it produces. The root [README.md](../README.md) links each example to
the batch that introduced it and to the corresponding contract/validation
docs under [`docs/`](../docs/).
