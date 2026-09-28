# Media and typography — Batch 3

This contract applies to scene-render-js 0.4.0 and scene-render XML 1.1.
The CLI prepares and audits assets before opening an encoder or reusing cached segments.
All image surfaces use premultiplied, linear-light sRGB. Output grading, OCIO and 3D drawing belong to later batches.

## Installation and example

```sh
npm ci
python3 -m pip install -r requirements-media.txt
npm run check
node bin/scene-render.js render examples/batch3/scene.xml
```

Node 22.8+, FFmpeg/ffprobe, ImageMagick (`convert`, `identify`) and Fontconfig are required.
Python/OpenEXR is used for EXR parts and channels; Python/OpenUSD is used for USD assets.
Ordinary PNG/JPEG/WebP/AVIF/TIFF/GIF images, video, text and generators do not invoke Python.
The reference environment is Linux. Native npm binaries must match the machine architecture.

The example writes a four-second MP4, a PNG poster and an `.assets.json` manifest.
It includes an OFL-licensed Inter variable font. Test media are generated locally; tests do not call online providers.

## B3.01 — Resolution, integrity and provenance

Asset URIs are scene-directory-relative paths. Absolute paths, URI schemes and symlinks escaping that directory are rejected, including missing files below an existing symlink. SVG, OBJ/MTL, glTF, Lottie and USD dependencies pass through the same boundary.

`--representation NAME` selects that named representation when available. `--representation proxy` selects a proxy if present. Other assets retain their primary source. Selected representation hashes and dimensions replace the source-file expectations; the original logical dimensions remain the layer's layout dimensions. Only selected files are required. Supply dimensions on representations whose pixel size differs from the original.

Declared SHA-256, dimensions, duration, audio channel count and sample rate are checked. Video preparation performs a complete decode to detect errors beyond its first frame. Sequence preparation audits every existing frame. Generated caches require an exact hash match.

The output's `VIDEO.assets.json` records asset IDs, selected files and SHA-256 values, license, credit and generated-source provenance. Referenced fonts, secondary files and representations participate in cache invalidation. System-font bytes are recorded too; bundle fonts for reproducibility across machines. Simple image-only shots preserve selective segment invalidation; procedural and indirect dependencies use conservative invalidation.

## B3.02 — Images and alpha

Sharp handles common raster formats and EXIF orientation. ImageMagick selects PSD layers by index or label; OpenEXR selects parts by index/name or a channel prefix such as `beauty`. Decoded dimensions are checked after orientation.

PNG export unassociates linear RGB before sRGB encoding. Transparent pixels cannot introduce a coloured fringe during linear resampling. `alpha="none"`, `straight`, `premultiplied` and `auto` are respected. Auto means straight alpha for ordinary raster inputs and associated alpha for EXR. EXR retains float values above 1, and 16-bit raster inputs retain their precision on import.

Input primaries and transfer functions are converted before compositing. Camera log curves use committed lookup tables generated from colour-science 0.4.7, with its BSD notice included. Rebuilding these tables is a development operation; rendering needs no colour-science installation. Working/display transforms are implemented in v0.5; see [Effects and colour](effects-transitions-color.md). HDR containers and output metadata remain export work in Batch 7.

## B3.03 — Video and embedded audio

Source frame times use rational FPS. Random-access decoding, frame caching, pixel aspect ratio and 0/90/180/270-degree rotation are supported. File rotation/SAR metadata is used when XML does not explicitly override it. `timecodeStart` is source provenance, checked against a stored timecode when one is present; layer trims remain relative source seconds.

Layers apply `clipIn`, `clipOut`, `speed`, `timeStretch`, `reverse`, `loop`, `freezeAt` and `timeRemap`. `loop="N"` adds N repeats. Playback holds the endpoint after the requested repeats. Negative speed reverses the interval. A time-remap track takes precedence over freeze and the ordinary playback clock. Its keys map layer-local seconds to source seconds.

Frame blending policies are nearest source frame (`none`), linear-light `frame-mix`, and FFmpeg motion-compensated `optical-flow`. The latter uses a 1/1024-second interpolation grid and is more expensive. Endpoint padding supplies the required temporal neighbours.

When `hasAudio="true"`, the selected zero-based `audioStream` is sampled onto the same source clock at 48 kHz and routed through `audioBus`. Layer volume and mute apply. Explicit freezes are silent. Reverse and speed changes affect pitch; this is resampling, not pitch-preserving time stretching. Explicit audio tracks can independently select a video's audio stream.

## B3.04 — Image sequences

Exactly one `%d`, `%0Nd` or `#` run identifies the frame number. `first`, `last` and positive `step` enumerate frames inclusively. FPS determines their playback duration. Policies are `error`, `hold`, `black` and `transparent`; `hold` requires an earlier existing frame.

Decoded image and sequence caches have bounded memory. Evicted frames are decoded again and their bytes are checked against the preparation hash. Requesting frames in a different order does not change pixels.

An optional sequence SHA-256 is the hash of UTF-8 `JSON.stringify([{src,sha256}, ...])`, in enumeration order, for existing files. Missing placeholders are not file dependencies.

## B3.05 — Specialized assets

- **Vector/SVG:** built-in geometry and SVG paths share the compositor's paint/stroke rules. SVG uses resvg; relative raster references are audited and embedded. Scripts, entities and external network URIs are rejected.
- **Lottie:** JSON and dotLottie archives use the bundled offline WASM player. `animation` selects an archive entry. `segment` accepts `firstFrame,lastFrame` or a marker name. Slots use their `id` and a JSON value understood by the Lottie player. Playback wraps within the selected segment.
- **Mesh:** OBJ/MTL, glTF/GLB, FBX, PLY, binary `.splat`, USD/USDA/USDC and USDZ are imported. `prepareMedia().meshes` exposes imported geometry. The 0.6.0-alpha.1 geometry backend renders static triangle meshes with an explicit unlit scene material; splat rendering and imported animation/materials remain pending. See [geometry-3d.md](geometry-3d.md).
- **Generators:** solid, gradient, noise, fractal-noise, film-grain, checkerboard, stripes, grid, cells and light-rays use deterministic coordinates and seeds. Animate `evolution` for temporal noise.
- **Charts:** inline series or a JSON array of `{name,values,color}` supports bar, column, line, area, scatter, pie, donut, counter and progress. Scatter places values at ordinal X positions. Labels are comma-separated. `format="0.00"` controls decimal precision. Fonts, paints and animated progress are supported.
- **Audiograms:** a fixed causal window provides waveform, envelope, circular and FFT views. Smoothing uses eight weighted history windows, so random seeks do not depend on the last rendered frame.
- **Codes:** QR, Data Matrix, PDF417, EAN-13, UPC-A and Code 128 use bwip-js. Payload checks are delegated to the selected encoder. Foreground/background alpha and quiet zones are retained.
- **Formula:** MathJax compiles TeX to vector geometry. Size controls the formula's geometry within its declared box; paint controls its colour and alpha. Invalid TeX fails preparation/rendering with a diagnostic.

## B3.06 — Frozen generated assets

Providers are explicit caller-supplied adapters. Rendering never invokes a provider.

```js
import { resolveGenerated, selectRepresentations, prepareMedia } from 'scene-render-js';

const frozen = await resolveGenerated(validatedScene, {
  base: projectDirectory,
  providers: {
    myProvider: async request => generateBytes(request),
  },
});
// Persist frozen's updated cacheSha256 in the authored XML.
const selected = selectRepresentations(frozen);
const media = await prepareMedia(selected, { base: projectDirectory });
try {
  // Use media.read, media.render and media.dimensions as FrameRenderer's I/O.
} finally {
  media.close();
}
```

Adapters receive provider/model/prompt/voice/language/seed and the declared metadata. Existing matching cache files are reused without a call. Distinct generated assets must use distinct cache paths. New cache files are written atomically. The updated hash is returned in a cloned tree; the input tree is not mutated.

## B3.07–B3.08 — Text, styles and layout

Styles resolve `basedOn` recursively. Explicit XML attributes override inherited styles; an automatically inserted XSD default does not erase a referenced style. Spans inherit the text asset and can override their own character style.

Font sources support `fontFile`, `fontAsset`, family lookup, a comma-separated family fallback list and TTC collection indices. WOFF/WOFF2 containers are unwrapped before shaping. Fontkit applies OpenType shaping, kerning, feature settings (`kern=1,liga=0`) and variable axes (`wght=700,wdth=90`). Static fonts can receive synthetic bold/italic when requested. Bundle real faces for precise design matching.

Unicode bidi levels order mixed-direction runs; `start`/`end` align relative to paragraph direction. Horizontal and vertical writing modes, language-specific case conversion, colour/text emoji, letter spacing, tracking (1/1000 em), baseline shifts, decorations, highlights, strokes, shadows and text backgrounds are supported.

Wrapping supports word, character, none and balanced lines. Hyphenation uses English or Portuguese patterns according to the language tag; other languages use the English fallback. Fit modes use a bounded search between minSize/maxSize. Max-lines and overflow clipping/ellipsis apply after fitting. Visible overflow carries the raster's origin into the compositor instead of changing the asset's layout box.

## B3.09 — Text animation and paths

Animators are sampled at layer-local time, with character, non-space character, word, line and span selectors. Ranges accept percentages or indices; shapes, amounts, ordering, seeds, staggering, overlap and absolute-time wiggle are deterministic. Selector expressions receive `textIndex` and `textTotal`; their result is a percentage.

The declared presets and custom transform/style properties can be combined with add, multiply or replace. Geometric changes are applied to shaped glyphs. Rotation X/Y and depth use a planar projection; this is not a 3D scene renderer. Named span roles constrain an animator. Counter animates numeric text; scramble uses a deterministic seed.

`textPath` uses SVG path distance, margins, start offset, reverse direction, tangent orientation and force alignment. Text layout and paint remain separate from the surrounding layer's transform, masks and effects.

## Validation

`npm run check` retains the original 90% line/branch/function coverage gates.
The media suite exercises asset integrity, provider reuse, representations, raster formats,
alpha round trips, video clocks and audio, sequence policies, code types, generators,
charts, TeX, Lottie, every mesh format, bidi text, variable fonts, text paths,
EXR/PSD selection, cache eviction and full MP4/provenance output.
