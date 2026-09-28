# Batch 5 validation — 0.6.0

Status: Batch 5 implementation and integration acceptance completed.
The algorithms, numerical conventions and supported combinations are specified
in `geometry-3d.md`.

## Verified release

- `npm run check`: **572 tests passed**, zero failures, zero skips.
- TypeScript checkJs: passed.
- Coverage: **97.08% lines**, **90.72% branches**, **94.72% functions**.
- Original 90% thresholds retained; generated-schema exclusion unchanged.
- Python adapters compile and execute with Blender 4.5.0, MaterialX 1.39.4,
  NumPy 1.26.4 and Python 3.11. OpenUSD dependency auditing executes in the
  separately pinned media environment.
- Previous Batch 1–4 tests and all 552 baseline tests remain part of the suite.

## Acceptance evidence

| Area | Verified behavior |
| --- | --- |
| Composition | Contiguous depth stacks, interleaved 2D overlays, collapsed groups, group opacity/clip/masks/effects, individual geometry mattes, parented projected planes, reframe and nested camera transforms. |
| Optics/materials | Physical sensors, clipping, DOF/shake/shutter, PBR extensions, texture maps, fonts/extrusion, real MaterialX Standard Surface/OpenPBR compilation. |
| Shadows | Authored depth-map size and bias change pixels; directional and point maps; receiver-plane correction; environment shadow overrides and diffuse/specular filtering. |
| Import | Real glTF clips/morphs/variants/skinning and FBX tracking; static glTF material slots; Assimp emissive textures/UVs; real USD texture dependencies/material binding/UV import. |
| Deformation | All modifiers, mesh and mask warps, MLS puppet pins, skin weights, automatic layout bounds, projected overflow. |
| Dynamics | Fixed-step body/soft-body solvers, all fields and joints, parent transforms, hashed cache replay; swept particles against moving/rotating fixtures with radius and relative velocity. |
| Seek | Animated emitters and colliders reproduce the same frame after forward/backward requests and in a fresh renderer. |
| Colour | Non-identity custom OCIO working space produces matching ordinary and projected 2D colours. |
| 360/stereo | Equirectangular/cubemap/EAC/fisheye renders, stereo, V2 compressed mesh decoding, CRC32, inward winding, idempotent injection and unchanged decoded MP4 frames with moov before/after media. |

`test/batch5-completion.test.js` contains the new cross-feature regressions.
`test/batch5-import.test.js` adds static material and USD texture validation.
The earlier native, geometry, dynamics, compositor and effects suites are retained.

## Rendered examples

All three Batch 5 scenes now share one `examples/batch5/` folder and one
`assets/` directory (font, MaterialX source, hashed physics cache).

- `examples/batch5/completion.xml`: **320×200, 8 fps, 16 frames, 2.000 seconds**,
  silent H.264 (`completion-preview.mp4`) plus a reviewed PNG poster
  (`completion-poster.png`). Demonstrates masked 3D group isolation, mapped
  shadows, projected deformation and particles colliding with an animated
  fixture. Includes XML, font licence and hashed render asset manifest.
- `examples/batch5/extended.xml`: retained three-second PBR/MaterialX/dynamics
  example (`extended-preview.mp4`, `extended-poster.png`) with its explicit
  SHA-256-pinned physics cache.
- `examples/batch5/geometry.xml`: the original unlit geometry example
  (`geometry-preview.mp4`, `geometry-poster.png`). Batch 1–4 artifacts are
  preserved.

Renderer cache version is **9**. Previous version-8 render segments are invalidated.
Physics cache identity remains compatible because the body solver has not changed.
Native floating-point comparisons use a 1e-5 tolerance, not a cross-platform
bitwise-equality promise. Standard player support for mesh projection varies.

## Delivery contents

The ZIP contains source, schema/generated types, lockfile, Python requirements,
tests, operational documentation, example XML/assets, rendered videos/posters
and the physics bake command. It excludes environments, node_modules, render
scratch/cache directories, Python bytecode and working-session files.

Install and validation commands are in `geometry-3d.md`. Source-engine material
conversion and shadow-map numerical behavior are documented there as part of
the renderer contract.
