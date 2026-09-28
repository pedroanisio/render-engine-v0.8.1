# Effects, transitions and colour (v0.5)

The renderer evaluates all 80 effect types in scene-render 1.1 and the 32
transitions implemented in the 2D backend. `flip`, `cube` and `page-curl`
are added by the 0.6.0-alpha.1 geometry backend; see [geometry-3d.md](geometry-3d.md).
The schema defines names and shared controls, but does not prescribe every
algorithm. The definitions below are the renderer's reproducible contract.

## Installation and example

```sh
npm ci
python3 -m pip install -r requirements-media.txt
node bin/scene-render.js render examples/batch4/scene.xml
npm run check
```

LUTs and OCIO use OpenColorIO 2.5.1. GLSL uses ModernGL 5.12 with an EGL
OpenGL 3.3 context; Mesa llvmpipe works without a physical GPU. Install an
EGL/Mesa driver on a headless machine. Ordinary JavaScript effects do not
require these optional native backends. Versions and the actual GL driver
are included in cache keys and the output manifest when used.

`examples/batch4` includes a six-second H.264/AAC demonstration, its scene,
poster, font licence, shader and original synthesized audio. The rendered
frames demonstrate glow, shutter sampling, CDL, hue rotation, ACEScg,
AgX, crossfade, wipe and animated GLSL uniforms.

## Evaluation and coordinates

Effects run in the order listed by `effects`, after node rasterisation and
before its masks, matte, opacity and blend. Adjustment effects receive the
preceding backdrop. Groups process their isolated composite. `enabled` and
`mix` use the same animated runtime as other properties. Mix is a linear
interpolation of premultiplied RGBA, including coverage; zero is the exact
input and disabled effects do not evaluate their algorithm.

Images remain floating-point and premultiplied. Colour operators temporarily
unassociate RGB and preserve alpha unless their purpose is keying, coverage
or an alpha curve. Transparent pixels cannot acquire hidden colour through
an invert or CDL operation. Normal compositing retains HDR values and
negative working-space components until display conversion.

Effect radii, sizes, centres and offsets are in project pixels, scaled with
the output resolution. They operate in the rasterised composition coordinate
system. Blur and warp samples outside the surface are transparent. Angles
are degrees; centres default to the image centre. Effects have a maximum
of 256 samples per evaluation, enforced with an error rather than silently
reducing a requested count. Large radii and nested temporal effects are
computationally expensive in the CPU backend.

Named `param` children are shader uniforms. Other controls use the typed
attributes defined by the schema. Unknown uniform names and non-finite
results fail instead of returning a successful render.

## Effect algorithms and controls

Common `enabled` and `mix` apply to every row. Attribute defaults come from
the XSD; explicitly set controls for a desired look.

| Types | Algorithm and relevant controls |
|---|---|
| `blur` | Separable finite Gaussian; `radius` is three standard deviations. Transparent borders. |
| `directional-blur` | Uniform line integration at `angle`, half-length `radius`, `samples`. |
| `radial-blur` | Angular integration around `centerX/Y`; total swept `angle`, `samples`. |
| `zoom-blur` | Radial scale integration; `amount` is the scale interval, `samples`. |
| `lens-blur` | Golden-angle disk aperture quadrature; `radius`, `samples`. |
| `tilt-shift` | Gaussian mixed by distance from a focused strip; `radius`, `size`, centre, `angle`. |
| `glow` | Blurred coverage, tinted by `color`, scaled by `intensity`; `radius`, `compositeOriginal`. |
| `bloom` | Rec.709-luma bright pass above `threshold`, Gaussian scatter, additive linear light; `radius`, `intensity`. |
| `halation` | Bright-pass scatter with a red-biased response, distinct from white bloom. |
| `drop-shadow`, `inner-shadow`, `inner-glow` | Blurred coverage or its interior complement; colour, radius, intensity, offsets, original placement. Inner glow is unshifted. |
| `long-shadow` | Maximum-coverage extrusion along `offsetX/Y`, sampled over its full length; colour and original placement. |
| `stroke`, `outline` | Disk morphology coverage difference; radius and inside/centre/outside `position`. Stroke also retains the original; outline emits the edge. Newly covered pixels take the covering neighbour's colour; radii beyond the image diagonal are equivalent to it. |
| `matte-choke` | Alpha erosion for positive `amount`, dilation for negative amount. |
| `sharpen` | Four-neighbour Laplacian detail gain by `amount`. |
| `unsharp-mask` | Gaussian low-frequency subtraction, `radius`, `amount`, detail `threshold`. |
| `emboss`, `bevel` | Directional luminance gradient or alpha-derived relief; `angle`, `amount`. |
| `color-grade` | Luma-preserving saturation, contrast around 0.18, additive brightness. |
| `lift-gamma-gain` | Per-channel lift, inverse gamma and gain; comma-separated RGB triples. |
| `cdl` | ASC slope/offset/power followed by Rec.709 saturation. Power and gamma must be positive. |
| `curves` | Piecewise linear points `x,y x,y ...`; RGB, individual channel, luma or alpha. Duplicate x values are rejected. |
| `levels` | Input black/white normalisation, RGB gamma and output black/white mapping. |
| `white-balance` | Artistic red/blue stop offset by `temperature/100`, green offset by `tint/100`, preserving luminance. Temperature is an offset, not an absolute Kelvin illuminant. |
| `exposure` | Linear multiplication by `2^exposure`. |
| `hue-saturation` | Chroma-plane rotation around Rec.709 luminance; `hue` and `saturation`. |
| `lut` | OpenColorIO `.cube`, `.clf`, `.ctf` or `.3dl` processing. `space` specifies the LUT's encoded domain. |
| `tonemap` | ACES fitted curve, full AgX and Filmic display transforms, Hable, Reinhard, or BT.2390-style PQ EETF from a 10,000-nit source to 100 nits. |
| `tint`, `tritone` | Luma-scaled tint mixed by `amount`, or black–colour–white interpolation through the midtone. |
| `grayscale`, `sepia`, `invert` | Rec.709 luminance, sepia matrix, or channel complement, preserving coverage. |
| `posterize`, `threshold` | `levels` equally spaced values, or a luma cutoff at `threshold`. |
| `fill` | Replace unassociated RGB with `color`, multiplying source coverage by its alpha. |
| `color-overlay` | Mix unassociated RGB toward color by `amount × color alpha`, preserving source coverage. |
| `gradient-overlay`, `gradient-map` | Sample `paint` in composition coordinates, or by source luminance. `source` can supply a raster ramp; gradient-map also accepts a paint reference. |
| `selective-color` | RGB-distance selection around `keyColor`, tolerance and softness; additive `color` correction by `amount`. |
| `film-grain`, `noise` | Seeded, frame-indexed zero-mean noise: correlated monochrome grain or independent channel noise. |
| `fractal-noise` | Six octaves of interpolated lattice noise; size, frequency, speed, amount and seed. |
| `halftone` | Rotated antialiased dot screen; size and angle. |
| `scanlines` | Alternating half-period row attenuation; size and intensity. |
| `pixelate`, `mosaic` | Cell-centre sampling or exact cell-area averaging; size. |
| `rgb-split`, `chromatic-aberration` | Per-channel translation by offsets, or radial channel scaling by amount. Alpha is retained. |
| `vignette` | Elliptical radial attenuation toward color; centre, threshold, softness and intensity. |
| `light-leak`, `light-sweep`, `lens-flare` | Noisy radial exposure, moving Gaussian strip, or core/ring/streak flare; colour, intensity, centre, size, radius, angle and speed as applicable. |
| `god-rays` | Radial light integration toward the centre, with amount, samples and intensity. |
| `glitch`, `vhs` | Seeded discontinuous scan-band displacement, or continuous tape distortion with chroma loss, scanlines and noise. |
| `mirror`, `kaleidoscope`, `tile` | Reflection about an angled axis, angular folding with `levels` sectors, or repeated coordinates controlled by amount and offsets. |
| `twirl` | Radially tapered angular rotation; radius and angle. |
| `bulge`, `spherize`, `lens-distortion` | Polynomial radial bulge, spherical arcsine projection, or quadratic radial distortion. Radius/amount/centre. |
| `wave-warp`, `ripple` | Directed sinusoidal displacement or radial wave; size, frequency, speed and amount. |
| `turbulent-displace`, `heat-haze` | Two-axis coherent noise displacement or horizontally refracting moving noise; size, frequency, amount, speed and seed. |
| `displacement-map` | Red/green source channels shift x/y around 0.5; offsets and amount. |
| `chroma-key`, `luma-key`, `difference-key` | RGB key distance, luma threshold, or distance to a plate; tolerance/threshold and softness. |
| `spill-suppress` | Suppress excess key-dominant channel by spill, preserving alpha. |
| `letterbox` | Bars of colour; amount is the fraction of height on each edge, capped below one half. |
| `lighting` | Alpha-gradient relief with ambient/point lights, colour, intensity, exposure, range and selected falloff. Other light types belong to the 3D backend. |
| `echo` | Normalised weighted history: `samples` frames spaced `1/frequency` seconds, successive weights `amount^n`. |
| `posterize-time` | Re-evaluate at `floor(time*frequency)/frequency`. |
| `pixel-motion-blur` | Block-matched RGBA flow to the next frame, then motion-aligned integration; block size, search radius, samples and amount. |
| `shader` | Offline GLSL program, described below. |

For glow and shadow effects, `compositeOriginal="behind"` places the original
behind the generated effect, `on-top` puts it above, and `none` emits only the
effect. Use `on-top` for a conventional exterior drop shadow.

## Transitions and audio

`from` and `to` must identify distinct siblings. A missing endpoint is
transparent, allowing entrances and exits. The cut is the incoming node's
start, or the outgoing node's end for an exit. `alignment` starts, centres
or ends the duration-sized window at that cut. Both endpoints get the
necessary handles; original timeline positions and clocks are retained.
Implicitly coextensive children receive the same handles. A source video
uses available frames outside its trimmed range and clamps at actual media
boundaries. Explicitly shorter child intervals remain shorter.

The 2D catalogue includes cuts, crossfade/additive dissolve, dip-to-colour,
wipes, slide/push/cover/reveal, zoom/spin/whip-pan, circles/iris, angular
wipes, barn-door/blinds/stripe, luma mattes, blur/pixelize/glitch,
film-roll/squash/shuffle/carousel, light-leak, block-correspondence morph
and GLSL. Iris uses a rectangular aperture; circles use radial apertures.
Slide dissolves its incoming moving layer, while cover replaces by coverage.
`curve` drives progress, and direction/angle orient directional algorithms.
Luma transitions require a matte. Overlapping transitions may not claim the
same endpoint at the same instant.

Embedded video audio uses the same transition window and progress:
linear complementary amplitudes for crossfade, sine/cosine amplitudes for
equal-power, or a cut at the original cut time. `audio="none"` leaves its
original audio interval intact. Independent audioMix tracks keep their own
schedules. More general audio DSP and editing remain in Batch 6.

## Time, shutter and determinism

Temporal effects re-evaluate their owning node before the current effect
at each requested time. They do not consume a mutable previous-frame buffer.
Adjustment history includes its preceding backdrop. Random textures depend
on seed, frame index and coordinates. Asking for frame B before A therefore
does not change A, and segmented/sharded rendering sees the same neighbours.

Node `motionBlur` uses `on/off/inherit`; inherited flags follow the containing
groups and then the project. Shutter samples include animated transforms,
source time and effects. Angle and phase are fractions of a 360-degree frame
period; default 180/-90 centres a half-frame exposure. `motionBlurSamples`
sets the maximum, without changing nominal output FPS. Adaptive mode doubles
quadrature density until successive images converge; disable it for a fixed
sample count. Transition shutter sampling also integrates transition progress.

## Colour management

Asset decoders import declared primaries and transfer functions into linear
sRGB. The managed compositor converts those values and generated paints to
working primaries before compositing. The legacy project workingColorSpace
is honoured when no colorManagement section exists. Colour names used for a
working buffer designate their linear primaries; encoded domains are used
when entering/leaving a look or a LUT `space`.

Working precision is quantised at the colour-management buffer boundary:
8/16 are bounded normalised integer precision, 16f is half-float precision,
and 32f retains Float32. Exposure, ordered look references, optional LUT and
CDL operations, look mix, and the display tone transform are applied explicitly. The built-in `raw`
view bypasses tone mapping; `standard` applies the selected tone mapper.
AgX and Filmic use the pinned Blender 4.5 reference data, while ACES 2 uses
OpenColorIO's built-in ACES 2.0 SDR 100-nit transform. Output colourSpace and
transfer drive RGB encoding. The container transfer tag names the curve actually
applied (with `transfer="auto"`: linear for linear-srgb/ACEScg/ACES2065-1/
XYZ-D65/raw, BT.709 for rec709, sRGB otherwise); gamma 2.6 (dci-p3), ACEScct
and camera-log encodings have no matching standard tag and are left untagged. Additional HDR containers, bit depths and
metadata are export work in Batch 7.

With `ocioConfig`, actual OCIO colourspace/look/display/view processors run.
The config must expose `linear-srgb` (or the standard `Linear Rec.709 (sRGB)`
name) as the import interchange. WorkingSpace must name the desired configured
space; the input bridge also resolves standard ACES aliases. Set output
colourSpace/transfer to match the chosen OCIO display encoding.

Referenced LUTs are audited recursively, constrained to the scene directory,
frozen as bytes and hashed before cache selection. Absolute paths and dynamic
environment-variable paths are rejected. Changes to any resolved dependency
invalidate affected cached rendering; scenes with transitions/temporal effects
use conservative source dependencies to include neighbouring shots.

## GLSL convention

An effect may use a full fragment `main()` (with `uv`, `from` and `to`
provided), or define `vec4 effect(vec2 uv)`. Use
`vec4 transition(vec2 uv)` for a transition. Inputs and results are
premultiplied working-space RGBA. `uv=(0,0)` is the top-left input pixel edge.
Available helpers are `getFromColor(uv)` and `getToColor(uv)`; an ordinary
effect supplies its input to both. Built-in uniforms are `time`, `resolution`
and transition `progress`. Declare additional uniforms in the shader and
supply numeric, boolean or numeric-vector values through `param` children.
The renderer compiles real GLSL and reports compilation errors. Exact GPU
pixels are guaranteed only for a fixed driver/backend; cache keys retain it.

## Validation

`test/fx.test.js` covers the complete effect enumeration, immutable inputs,
mix endpoints, reordered temporal reads, analytical Gaussian/CDL/alpha
references, distinct kernels, LUT formats, actual GLSL uniforms, OCIO
resources, measured display transforms, transition endpoints/midpoints,
shutter phase, embedded-audio amplitudes, cache invalidation and identical
decoded pixels after sharded/resumed rendering. The global line, branch and
function coverage gates remain at 90%.

The 0.6.0-alpha.1 geometry backend adds flip, cube and page-curl. See
[geometry-3d.md](geometry-3d.md) for their geometric contract and remaining 3D limitations.
