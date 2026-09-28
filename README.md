# scene-render-js

Deterministic JavaScript processor for scene-render 1.1 documents. This
release provides schema-validated loading and a renderer for a supported subset
of scene features. Unsupported rendering features are reported as errors.

See [examples/](examples/) for a self-contained example per feature area, each
with its own README and render command.

## Batch 7: exports and operation

Version 0.8.1 adds all 15 output codec families, real still encoders, alpha/HDR,
metadata and chapters, output ranges, multi-output execution, destination adapters,
verified lossless caches, bounded raster/stem caching and isolated cancellable audio.
See [the export contract](docs/export-operation.md) and
[validation evidence](docs/batch7-validation.md) for compatibility and certification
limits. `examples/batch7/` contains MP4, animated WebP, an alpha master, float EXR
and four still formats produced by the engine.

The compatibility option `--anchor-mode position` supports source projects whose
x/y place their 2D anchor. Default pivot behavior remains unchanged. Parallel
workers, cache keys, stills and reports preserve the selected convention.

`npm run certify` produces an item-level evidence report and returns exit code 2
while full certification is incomplete. See [the certification status](docs/batch7-status.json).
It is separate from `npm run check`, whose type/test/coverage gates remain unchanged.
The v0.8.1 release check passed 642 tests with no skips. Full B7.08 certification
remains open; the report lists the missing individual evidence.

```sh
node bin/scene-render.js render examples/batch7/scene.xml --output '*'
node bin/scene-render.js capabilities --json
node scripts/render-oracle.js examples/batch7/scene.xml --output main
```

## Batch 5 backend

Version 0.6.0 completes Batch 5 with Cycles CPU PBR/optics, MaterialX and OpenPBR,
imported clips/skinning/morphs/variants, deformation, Planck physics, particles,
tracking and 360/stereo, including the remaining composition, shadow-map,
collision, deformation-bound and projection-metadata integrations.
See [the backend contract](docs/geometry-3d.md) for installation, numerical
conventions and supported controls; see [validation](docs/batch5-validation.md)
for the acceptance evidence.

`examples/batch5/extended-preview.mp4` and `extended-poster.png` demonstrate
the new backend, rendered from `examples/batch5/extended.xml`, which includes
the MaterialX source and a hashed physics cache. `examples/batch5/completion.xml`
adds an integrated scene, video and poster covering 3D group isolation, mapped
shadows, projected deformation and particle collision with an animated rigid
fixture. All three Batch 5 scenes (`geometry.xml`, `extended.xml`,
`completion.xml`) now share one `examples/batch5/` folder and its assets.

## Effects, transitions and colour

Version 0.5 adds the 80-effect catalogue, 32 2D transitions with media handles,
random-access temporal sampling, per-node shutter controls, OCIO/LUT/GLSL
backends and managed working/display colour. See
[the effect and colour contract](docs/effects-transitions-color.md) for exact
algorithms, parameter units, dependencies and remaining 3D/export boundaries.

```sh
python3 -m pip install -r requirements-media.txt
node bin/scene-render.js render examples/batch4/scene.xml
```

## Use

```sh
npm install
npx scene-render validate scene.xml          # exit 0 valid, 1 invalid, 2 usage/I-O
npx scene-render validate --json scene.xml
npx scene-render preflight --json scene.xml   # operational capabilities and runtime rules
npx scene-render assets scene.xml            # audit every src/proxy file the scene needs
npx scene-render assets --json scene.xml     # machine-readable manifest with SHA-256
```

`assets` resolves paths relative to the scene file, refuses paths that
escape its directory, and checks SHA-256, PNG dimensions and WAV channels,
sample rate and duration against the scene's declarations. It exits 1
while any dependency is missing, inconsistent or outside the directory.

```js
import { loadScene, attributesOf } from 'scene-render-js';

const r = loadScene(xmlText);
if (r.ok) {
  const project = attributesOf(r.scene.children[0], 'projectType'); // typed, defaults applied
} else {
  for (const d of r.diagnostics) console.log(d.code, d.line, d.path, d.message);
}
```

`loadScene` never throws on invalid input. A valid scene is a deeply frozen
tree; `ids` indexes every `xs:ID`. `xs:unsignedLong` decodes to `bigint`;
any other integer beyond 2^53 is rejected with `E_INT_RANGE`.

## Pipeline

1. `src/xml/parse.js` — strict XML via saxes; DOCTYPE rejected; size, depth
   and element-count limits.
2. `src/xsd/*` — validation against a model generated from
   `schema/scene-render-1.1.xsd` (`npm run codegen`). Content models are
   matched by interned derivatives, so state count is bounded by the schema.
3. `src/scene/semantic.js` — `url(#id)` must name an element under
   `/scene/paints`; `var(--name)` must name a unique `styles/token`.

## Rendering

Requires FFmpeg and ffprobe on `PATH`. Text rendering requires the font files
referenced by the scene.

```sh
npx scene-render render scene.xml
npx scene-render render scene.xml --from 10 --to 20
npx scene-render render scene.xml --jobs 4
npx scene-render render scene.xml --threads 1
```

### Performance

Frames are rendered by the same compositor and effect code as before, but each
pass now touches only the pixels a layer can reach (surfaces and masks carry a
zero-region hint), the hot loops allocate nothing per pixel, static text is
reused across frames, and the 16-bit encoder quantises float32 values through
a table that `scripts/verify-encode-lut.mjs` checks against the direct
computation for every float32 in [0, 1]. Output is byte-identical to the
previous release: lossless segment digests are unchanged, so existing segment
caches stay valid. Single-thread frame throughput is 8 to 15 times higher on
the bundled examples and a 1080p reference scene;
`node scripts/bench-frames.mjs <scene.xml> [output] [start] [frames]` measures
it for any scene.

Renders of a second or more of frames also spread frames over worker threads
(`--threads N`, default: half the cores, at most four, and no more renderers
than free memory holds; `--threads 1` restores the serial path). Every thread
holds its own renderer and decoded media, so memory grows with the count, and
shard processes started by `--jobs` stay serial unless `--threads` is given.
Frames are independent of rendering order, as stills and shards already rely
on, so threaded output is identical to serial output. FFprobe results are
cached in the OS temp directory by file identity and probe version.

Partial exports split segments at the requested interval, rounded upward to frame boundaries.
Audio samples and caption/word times are rebased to the same exported interval. Output is
written to the work directory as `partial.<container>` (or a numbered sequence); results do not depend on
previous cached exports. An interval containing no segments is an error.

Completed, supported segments are cached by scene, render settings, image
content and font content. Replacing a font invalidates all segments. Failed
unsupported segments are not cached.

Omitted audio `clipOut` uses the decoded source duration. Version 0.7 replaces
the internal `mixGraph` builder with `mixAudio` and `finishAudio`; gain, pan,
DSP and ducking are evaluated on the sample clock.

Version 0.3.0 adds affine 2D composition, all vector shapes and blend modes,
paints, masks, symbols/includes/repeats and responsive layout. See
[the composition contract](docs/composition-2d.md) for semantics and boundaries.

```sh
npx scene-render render examples/composition-2d/scene.xml
npx scene-render render examples/composition-2d/scene.xml --output portrait
```

## Verification

`npm run check` runs `tsc --checkJs --strict` and the suite with a 90 %
branch, line and function gate. `test/oracle.test.js` compares verdicts on
1,650 seeded documents with libxml2 2.14.6 (`npm run oracle` re-records them;
needs Python with lxml).

Known, deliberate divergence from libxml2: dangling IDREFs are errors, as
XSD 1.0 cvc-id requires; libxml2 accepts them.

## Runtime and remaining renderer work

The temporal runtime, typed tracks, parameter/variant resolver, pure expressions,
SVG motion paths, links, conditions, markers and sample-accurate audio automation
are described in [docs/runtime.md](docs/runtime.md). `examples/batch1/scene.xml` is a
self-contained scene demonstrating the new runtime.

```sh
npx scene-render render examples/batch1/scene.xml --variant warm --param distance=180
```

Additional export backends remain in Batch 7. Batch 5
geometry/material support and numerical conventions are documented separately;
unsupported individual controls are rejected by operational preflight.
The absent Schematron is not claimed as implemented; explicit runtime rules
and interpolation conventions are documented instead. DOCTYPE, `xsi:type` and
`xsi:nil` remain unsupported by policy.

## Batch 3: media and typography

Version 0.4.0 adds audited source/representation selection, raster/video/sequence decoding,
embedded video audio, offline Lottie and generated caches, mesh import, procedural assets,
codes, TeX, charts, audiograms and shaped variable-font text with animation.
See [the media and text contract](docs/media-and-text.md) for installation, APIs,
clock semantics and the boundary with later batches.

Run the bundled example with:

```sh
python3 -m pip install -r requirements-media.txt
node bin/scene-render.js render examples/batch3/scene.xml
```

## Batch 6: audio, captions and accessibility

Version 0.7.0 implements sample-clock editing, bus routing and level-triggered
ducking; 16 audio effect types; integrated/dynamic normalization and independent
true-peak limiting; configurable PCM formats; six caption source formats,
verified transcription caches, burned/sidecar/embedded captions; and accessibility
reports with blocking error policies.

See [the Batch 6 contract](docs/audio-captions-accessibility.md) and
[validation evidence](docs/batch6-validation.md) for numerical conventions,
codec boundaries, reproducible tests and the included example.

```sh
node examples/batch6/create-audio.mjs
node bin/scene-render.js render examples/batch6/scene.xml
```
