# 2D composition (0.3.0)

The renderer evaluates animation and layout before constructing affine world
matrices. Skia (`@napi-rs/canvas`, installed through npm) supplies antialiased
vector coverage. Paint and compositing operate on premultiplied, linear-light
floating-point RGBA. The encoded MP4 is still the existing H.264 backend.

## Geometry and coordinate spaces

Transforms are `T(x + anchor) R(rotation) skew S(scale) T(-anchor)`, composed
through the hierarchy. Negative scales mirror geometry; singular transforms
produce no coverage. Explicit `parent` references replace the containing
node's transform parent, while drawing order stays in the containing group.
Clipping happens after transforming the path, so an object initially outside
its local viewport can enter the visible frame. Groups without `clip` do not
clip their children to their declared box.

Lengths accept pixels, `%` relative to the parent box, and viewport units
`vw`, `vh`, `vmin`, `vmax`. Same-unit length keyframes interpolate numerically.
Alignment selects parent, frame or safe-area coordinates, with margin and
stretch. Layout positions are established before each child's affine transform.

All seven shapes render: rect, rounded-rect, ellipse, polygon, star, line and
SVG path. Rounded rectangles accept one to four corner radii. Polygon/star
points start at the top of their box; radius and roundness control their
vertices. Paths use SVG coordinates in the node's local space. Fill rules are
nonzero and evenodd. Strokes support cap, join, miter limit, arbitrary dash
arrays, dash offset, inside/center/outside position and both paint orders.
A line needs a visible stroke.

Trim uses fractions of arc length and an offset in degrees. `simultaneous`
trims the combined contour length; `individual` trims each contour. Modifiers
run in document order: repeater, offset-path, pucker-bloat, zig-zag, twist,
round-corners, wiggle-path, merge and trim. Repeater supports fractional copies,
accumulated transforms, opacity interpolation and stacking order. Offset/merge
use path boolean operations. Procedural deformation samples contours at the
specified detail; seeded wiggle is independent of frame evaluation order.
Trim modifier `offset` and `amount` specify start/end percentages across the
ordered set of paths, including repeater copies. Merge combines that set.

## Paints

Linear, radial (including focal circle/aspect), conic and mesh gradients are
supported, as are image patterns. Gradients support their schema-defined
spread, object/user units, rotation, stop midpoint and alpha. Alpha is interpolated with premultiplied color to avoid transparent-stop
fringes. Color mixing
supports linear RGB, sRGB, OKLab and OKLCH where allowed by the schema.
Mesh color patches use a bicubic Catmull–Rom neighborhood with clamped edge
control points; point positions define the patch grid. Patterns repeat source
tiles with offset, rotation and scale. Color tokens, stops and paint parameters
can be animated. Dither is deterministic. Pattern assets currently use the
existing PNG/text decoders; other asset decoders remain separate work.

## Compositing and masks

All 35 schema blend modes are implemented. Add/plus-lighter sum premultiplied
channels; separable and nonseparable modes blend unassociated linear RGB.
Dissolve uses deterministic pixel noise. Stencil/silhouette use alpha or luma.

Groups normally share the backdrop. `isolate`, non-normal group blending,
group opacity, effects, masks or mattes require an intermediate composite.
`collapse` does not change affine 2D geometry; its camera/2.5D meaning requires
the future 3D backend. Existing supported effects run in the order of `effects`.
The order is geometry/child composition, effects, masks, matte, inherited clip,
then blend/opacity. Adjustment layers filter the accumulated lower siblings
and interpolate the filtered result through their mask/matte/opacity once.

Masks support all six shapes, expansion/contraction, feather, opacity, inversion
and all seven combination modes. Combination follows document order. The first
subtract mask starts from full coverage; other first masks seed the result.
`none` skips the mask. Feather is a separable box filter in transformed pixels.
Mattes render through their own transform and clock. `matteVisible` controls
whether the provider also appears in the normal draw stack. Reference cycles
are errors.

Images crop their source before fitting, then apply focus and flips. Fit modes
are none, contain, cover, fill, scale-down and contain-blur. The blurred cover
background is confined to the fitted box. Image sampling is nearest-neighbor;
vector coverage remains antialiased at the requested output resolution.

## Reusable structure and time

`prepareScene` and the pipeline expand symbols, includes and repeats before
compiling animation. `compileRuntime(scene, {expand:true, load:loadScene, read})`
provides the same behavior. Without `expand`, the standalone runtime retains
its original `instanceValue` inspection API.

Expanded IDs use `instanceId__innerId`; generated-ID collisions are errors.
Overrides are typed and local to a copy. Local IDREFs, paint references, tokens,
links and `prop()` references are rewritten. Original symbol templates are
removed from the expanded runtime scene. An instance's placement animation
uses the parent clock; its content has an independent clip/speed/reverse/loop
clock, or a keyframed timeRemap. Fit scales vector content into the instance box.
Media frame blending is outside the vector instance clock contract.

Sequences place each child after the previous child's declared duration plus
`timeGap`. Repeats accept count, list parameters or data rows, from/step,
translation/rotation/scale/opacity steps and time staggering. Expressions see
`index`, `count`, `param(var)` and the named item. Plain object fields are
readable without exposing prototypes or methods. Repeat node behaviors apply
to the enclosing repeated group.

Includes are relative local scene files, validated before expansion, with an
optional SHA-256. Nested includes resolve against the including file's folder.
Cycles, directory escapes, invalid scenes, unknown overrides and oversized
expansions fail before encoding. The default expansion budget is 10,000 nodes.
Included assets retain their relative paths under a scoped namespace. The
expanded scene participates in cache keys; changing included XML invalidates
cached renders.

## Responsive layout

Groups support row, column, stack and grid, padding/gap, justification and
cross-axis alignment. Grids use equal-width columns and content-height rows.
Baseline alignment uses the first text baseline and the lower edge of other
boxes. A child may apply its own alignment after automatic layout.

Outputs can choose a named layout. Reflow recalculates layout at its dimensions;
crop uses cover scaling; fit uses contain scaling; fit-blur adds a blurred cover
background. Focus determines the camera offset. Safe areas can be explicit or
use the supplied title/action/social inset presets. Social insets are renderer
presets, not live guarantees about a platform's UI. `warn` exposes messages in
`FrameRenderer.warnings` and pipeline logs; `error` stops a frame when text or
a node tagged `cta`/`logo` falls outside the chosen area; `off` disables checks.

## Boundaries and verification

3D, transform constraints, geometry-dependent transitions and additional
exporters remain outside this release. Media/text and the 2D effect/transition
backends are extended in versions 0.4 and 0.5.
Operational preflight continues to reject those features. No XSD or recorded
oracle verdict has been changed to make a fixture pass.

`test/compositor.test.js` contains pixel and numerical fixtures for affine
hierarchies, all shape/paint/blend/mask modes, modifiers, reusable structures,
layout, source fitting, safe areas and multiple render scales. The full suite
also exercises real FFmpeg output and cold/warm caches. Run `npm run check`.

The media and text decoder boundary described above is extended in version 0.4.0.
See [Media and typography — Batch 3](media-and-text.md) for video, sequences,
specialized assets, shaping and text animation.

See [Effects, transitions and colour](effects-transitions-color.md) for the v0.5 extensions.
