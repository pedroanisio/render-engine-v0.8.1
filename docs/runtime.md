# Runtime contract, version 1

This document specifies the semantics implemented by scene-render-js 0.2.0.
The referenced `scene-render-1.1.sch` was not supplied. These are explicit
runtime rules, not a claim to implement an unavailable Schematron document.

## Validation and API

`loadScene(xml)` checks XML, XSD, IDs, static paint references and style tokens.
`compileRuntime(scene, options)` resolves parameters, checks cross-field rules,
compiles tracks/dependencies and returns a random-access evaluator. It throws
on invalid runtime input. `prepareScene(xml, options)` returns located diagnostics
instead, and also checks the raster/export backend's capability manifest.

```js
import { loadScene, compileRuntime, prepareScene } from 'scene-render-js';
const loaded = loadScene(xml);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
const runtime = compileRuntime(loaded.scene, {
  parameters: { distance: 100 },
  variant: 'wide',
  read: source => readFileSync(source, 'utf8'),
});
const x = runtime.value(runtime.ids.get('card'), 'x', 2.5);
const attrs = runtime.attributes(runtime.ids.get('card'), 2.5);
const visible = runtime.enabled(runtime.ids.get('card'), 2.5);
```

The compiled tree is a resolved copy; the validated input stays frozen.
Nodes retain `specifiedAttributes`, distinguishing inherited bounds from XSD
attribute defaults. The schema validator still accepts versions 1.0 and 1.1;
the operational runtime explicitly requires 1.1. It checks reference target
kinds, cycles in parents/styles/bus routes/symbol instantiation, positive
sizes, ordered trims and intervals, and ordered parameter/link bounds.

`E_RUNTIME_SEMANTIC` identifies runtime contract errors;
`E_RUNTIME_CAPABILITY` identifies unsupported backend features. Capability
checks inspect sections, values, attributes and driven properties before any
output encoder or segment cache is used. Neutral schema defaults are allowed.
The manifest is `src/scene/preflight.js`; adding a schema enum does not silently
enable it in the backend.

## Time

All times are seconds. The project FPS retains its numerator and denominator;
the FFmpeg encoder receives the rational FPS string. `timecode(text, fps)`
accepts seconds, non-drop-frame `HH:MM:SS:FF` or drop-frame `HH:MM:SS;FF`.
Timecode labels count frames at the nominal rate `round(fps)`, so the label's
frame number is divided by the actual rate (`00:00:01:00` at 30000/1001 is
30 frames, 1.001 s). Drop-frame is accepted only at 30000/1001 and 60000/1001
and skips 2 (respectively 4) labels each minute except every tenth; a dropped
label is an error. Visibility intervals are half-open `[start,end)`.
Marker times, key times, `timeOffset` and beat-grid offsets must be finite.

Unspecified bounds inherit from the parent, then from the project.
`startMarker`/`endMarker` add the corresponding numeric attribute as an offset.
Explicit markers and generated `beat.N`/`bar.N` use zero-based indices, starting
at beat-grid offset. Generated markers are recognized by IDREF validation only
when a grid exists and the marker falls before the project end.

A group's child clock is `start + (parentTime-start)*timeScale + timeOffset`.
Tracks use that composition clock, its difference from the owner's start for
`local`, or that difference divided by the owner's duration for `normalized`.
A zero-duration normalized interval evaluates at zero. Negative evaluation
times are supported by track extrapolation.

Sequences place each child after the previous end plus `timeGap`, then add the
child's explicit start offset. Child duration is its declared end minus start,
or, when no end was supplied, the parent duration still available from the
child's placed start to the sequence end.

`runtime.instanceValue(instanceId, innerId, property, time)` evaluates a
symbol's property with instance-local overrides and its own source clock.
Source time follows clip bounds, speed and reversal; `loop=N` adds N repeats,
then holds the final endpoint. Global parameters remain available, while an
instance override cannot leak into another instance. Vector sequence/symbol
drawing, layout reflow and instance time remapping are supported by the 2D
compositor. Media decoding and media frame interpolation remain separate work.

## Tracks and interpolation

Key values are parsed against the owning property's XSD type. Unknown properties,
non-finite numbers, unknown ID/paint/token references and invalid typed values
are compile errors. Color tokens resolve before interpolation. Numeric keys
interpolate continuously; colors interpolate in straight-alpha linear-light
RGB, then encode to normalized sRGB strings. Strings, booleans, IDs, and paint
references change discretely at the next key. Gradients/patterns still require
the Batch 5 paint backend.

Tracks compose in document order: a replacement track replaces the preceding
value; an additive numeric track adds to it, starting from the base attribute.
Expressions and links then apply in their document order. Every property has
the same evaluation path, including effect parameters, material properties,
visibility and z. The current compositor consumes its supported properties;
unsupported material/compositor operations fail preflight.

Equal key times create a discontinuity: the later key wins at that instant.
Linear extrapolation skips duplicate-time intervals; non-numeric tracks hold
instead. Hold, loop, ping-pong and numeric offset extrapolation are
deterministic for negative and positive time. Vector and unit-length values
(`50%`, `10vw`) interpolate per segment with the same easing, handles, hold,
step(s) and spring curves as numbers.

Temporal handles are normalized `influence,speed`: outgoing Bézier coordinates
are `(influence,influence*speed)`, incoming coordinates are their complements.
Both components must be in `[0,1]`. Spatial tangents are pixel offsets for x/y
cubic segments. Roving interior keys redistribute time by distance between key
positions; paired x/y tracks with matching key counts use joint 2D distance.
Roving endpoints and non-numeric roving are errors. TCB uses outgoing and incoming
Kochanek–Bartels tangents; spring uses the physical unit-step solution with
stiffness, damping and mass on normalized segment time, including critical and
overdamped cases. TCB is numeric; incompatible combinations report an error.

## Expressions, motion and links

Expressions run through an Acorn AST whitelist interpreter. There is no `eval`,
`Function`, object/member access, assignment, loops, imports, I/O or wall clock.
A single expression is limited to 32,768 characters and 2,048 AST nodes. Literal
reference arguments make dependency cycles detectable before rendering.

Supported built-ins are `time`, `frame`, `value`, `index`, `count`, `seed`,
`textIndex`, `textTotal`, `param`, `prop`, `valueAtTime`, `random`, `noise`,
`wiggle`, `loopIn`, `loopOut`, `linear`, `ease`, `easeIn`, `easeOut`, `clamp`,
`lerp`, `smoothstep`, `spring`, `audioAmplitude`, `beat`, and `markerTime`.
Math helpers: `PI`, `E`, `sin`, `cos`, `tan`, `abs`, `sqrt`, `floor`, `ceil`,
`round`, `min`, `max`, `pow`. Outside expansion/text-animator contexts,
index/textIndex are 0 and count/textTotal are 1.

`valueAtTime` samples the pre-expression track stack, preventing self-recursion.
`loopIn/loopOut` use the selected key interval (0 means the full interval).
Random/noise use a stateless 32-bit coordinate hash. An explicit expression
`seed` is used as given; otherwise the project seed is mixed with an FNV-1a hash
of the owner's id (or path) and the property name, so `x: random()` and
`y: random()` on one node differ while staying deterministic. `random()` draws
per frame index. `noise` is lattice noise; `wiggle` interpolates lattice
samples and supports up to 16 octaves. Evaluation order does not affect
results. `frame` is composition seconds times rational FPS, snapped to the
integer frame when within 1e-6 of it.

Each top-level `value()` call memoizes nested evaluations by
node, property and time, so repeated `prop()` references and smoothed links do
not re-evaluate shared inputs. At most 100,000 distinct property evaluations
are allowed per top-level call; exceeding that budget is an error naming the
property being evaluated. Driven list-typed values (for example number lists)
are revalidated in their space-separated lexical form.

Motion paths support SVG commands, arc-length traversal, equal time per segment
with native curve parameters when `constantSpeed=false`, additive/replacement
progress tracks, tangent orientation and orientation offset. Zero-radius SVG
arcs are normalized to lines, and compact arc flags (`a5 5 0 0110 10`) parse.
Smooth (`S`/`T`) and relative commands are normalized to absolute cubic and
quadratic segments before parameter-space traversal. Auto-orientation requires a backend that supports
rotation on the owner (currently image/text layers).

Links read a property, parameter, marker or analyzed audio band. Delay shifts
the source sampling time; smoothing is a causal moving average evaluated with
32 fixed trapezoidal panels. Scale/offset and min/max apply after smoothing.
This numerical integration contract is independent of prior frames and seeks.

## Parameters and scopes

Precedence is `default < variant set < data row < caller parameters`.
Binds apply after parameter validation; selected layout overrides then selected
variant overrides apply after binds. Instance overrides apply only inside that
instance. Unknown parameters, targets and properties are errors.

Parameter types: string, number, boolean (`true/false/1/0`), color, asset, enum,
list (JSON array) and time. The runtime checks required values, numeric bounds,
maxLength, ECMAScript regex patterns, and options separated by comma, semicolon
or `|`. A `pattern` must match the whole value, as in XSD (it is applied as
`^(?:pattern)$`); values longer than 10,000 characters are rejected for any
parameter that declares a pattern, which bounds (but does not eliminate) the
cost of pathological backtracking patterns. Asset parameters must name an asset. `{{id}}` substitutes parameter
values in string attributes, which are revalidated against their XSD type.

Bind maps use `input=output;input=output`; an unmapped value passes through.
JSON data must be an array of row objects. CSV/TSV support headers, quoted
fields, escaped quotes, newlines and optional SHA-256 verification. External
sources use the supplied `read` callback. CLI row selection is zero-based.
Conditions use the same pure expression interpreter as properties.

```sh
npx scene-render preflight --json scene.xml
npx scene-render render scene.xml --variant wide --param distance=100
npx scene-render render scene.xml --data customers --row 2 --param locale=pt
```

## Audio and cache

Track, bus and master volume, track/bus gain and pan automation are evaluated
per sample at 48 kHz. Stereo float WAV envelopes feed FFmpeg `amultiply` after
track trim/fades and before track effects, or at the corresponding bus/master.
Pan is clamped to `[-1,1]` and is constant-power with unity gain at center.
An animated `mute` is evaluated per sample. Envelope files are streamed
in bounded chunks. RIFF's size limit is reported, not silently truncated.

`audioAmplitude(id, band)` in the rendering pipeline reads causal 1,024-sample
RMS of the placed mono source before effects and bus gain. Bands are all, low
(<250 Hz), mid (250–4,000 Hz), high (>4,000 Hz), using FFmpeg filters. Source
trim/start markers and end-of-source silence are respected. Standalone runtime
users supply an `audioAmplitude(id,time,band)` provider.

Resolved parameters, variants and row selection enter segment cache keys.
Font bytes remain dependencies. Dynamic asset selection, audio-driven values
and retimed groups conservatively include all source bytes, preventing stale
segments when a dependency changes. Cache version is 4. Included XML and expanded reusable structures also enter
the scene hash. See [2D composition](composition-2d.md) for the rendering contract.

## Verification

`npm run check` runs strict checked JavaScript, the existing schema/oracle suite,
new runtime fixtures, pixel assertions, numerical audio sample checks, actual
FFmpeg exports, and cold/warm cache checks. The 90% branch/line/function gate is
unchanged. No supplied schema or recorded oracle verdict was rewritten.
