# Batch 5 backend — 0.6.0

Batch 5 implementation and integration are complete for the scene-render 1.1
contract described here. The previous acceptance gaps are addressed in this
release. Batch 1–4 tests and the original 90% coverage gates remain mandatory.
See `batch5-validation.md` for the release evidence.

## Install and run

```sh
npm ci
python3 -m pip install -r requirements-media.txt
uv python install 3.11
uv venv --python 3.11 .venv-3d
uv pip install --python .venv-3d/bin/python -r requirements-3d.txt
npm run check
node bin/scene-render.js render examples/batch5/extended.xml
```

The 3D environment is separate because Blender needs NumPy 1.x, whereas the
media environment uses NumPy 2.x. `SCENE_RENDER_BLENDER_PYTHON` can select another
Python executable with the pinned dependencies. Python environments, native
binaries and `node_modules` are not included in the source ZIP.

The extended example (`examples/batch5/extended.xml`) includes a three-second
MP4, a poster, a MaterialX material, an explicitly hashed physics cache, and
the licensed font. It exercises PBR, OSL, DOF, lights, animation, particles,
deformation and rigid collision. The original unlit reference scene is
`examples/batch5/geometry.xml`; all three Batch 5 scenes now live together in
one `examples/batch5/` folder with a shared `assets/` directory.

## Geometry, cameras and materials

The original CPU rasterizer remains available for explicit unlit geometry with
shadows disabled. Cycles 4.5.0 CPU handles PBR, nested geometry, text/path
extrusion, bevel, instancing, projected 2D surfaces, DOF, panoramas and imported
animation. The runtime versions participate in output cache identity.

World coordinates are X right, Y down, Z away from an unrotated camera. One
scene unit is one pixel; the native adapter uses 100 pixels/metre. Primitives
are centred. A plane uses width/height; a sphere uses radius; a cylinder/cone
uses radius/height; capsule height is the straight section; torus depth is tube
diameter. Segments are limited to 3–256. Instances share geometry and transforms
(the XSD does not define per-instance transform arrays), with a 4096-instance
budget. Parent transforms, opacity and visibility propagate through the tree.

Perspective and orthographic cameras support clipping, target, yaw/pitch/roll,
focal length, sensor dimensions, focus distance/target, f-stop, aperture blades,
exposure, radial distortion and seeded shake. FOV is vertical; focal length uses
a sensor gate cropped to the output aspect ratio. Both sensor dimensions
participate when focalLength is supplied. Explicit FOV remains vertical. The last active camera wins unless `viewportCamera`
selects one. Shutter integration samples the scene at output FPS, including
per-node and inherited `motionBlur="off"`. Cycles draft/final quality uses 16/48
samples multiplied by `antialias3d`.

Lights include ambient/dome, directional, point, spot and rectangular/disk area
sources, environment maps, IES, colour temperature, exposure, falloff and soft
shadows. Explicit shadowMapSize/shadowBias select sparse, fixed-resolution depth
maps; the default path uses Cycles ray-traced shadows. Point/spot/area sources
use cubical depth texels and directional lights use an orthographic map. Map
size is texels per face (16–8192), independent of Cycles sample count. Bias is
a fraction of the scene depth span. Receiver-plane correction avoids slope
acne; shadowSoftness enables a nine-tap comparison filter. Maps retain layered
opacity and projected texture alpha. Per-object receiveShadow applies to local
lights and environment illumination. Environment diffuse/specular filters and
colour/temperature tint are respected. PBR includes base colour/normal/metallic-roughness/occlusion/emission/
displacement maps, alpha, UV scale, clearcoat, transmission, IOR, attenuation,
sheen, specular, anisotropy and thin-film iridescence. Dispersion uses three RGB
IOR samples, not a full spectral renderer. AO multiplies base colour. Plane
thickness adds a solidified volume; closed meshes use their geometric thickness.

`materialX` replaces the XML material parameters. MaterialX 1.39.4 standard-library
graphs, including Standard Surface and OpenPBR, compile to OSL closures. Exactly
one renderable material is required. Includes and image files are collected as
hashed dependencies. DTDs, paths outside the scene root, and custom implementation
code are rejected. Standard-library graph compilation failures are fatal.

Contiguous 3D nodes share a depth buffer. Ordinary 2D layers separate these
stacks and retain painter order; `threeD` layers participate in camera depth.
Transparent groups collapse into the surrounding stack. Isolated groups render
their children before their masks, effects, clips, blend and opacity, so those
operations include 3D descendants. Cameras nested in groups inherit transforms.
A 2D node parented to object3D is projected as a textured child plane.

`threeD` shapes, layers, groups, sequences and emitters retain their colour,
alpha, deformation, effects and X/Y rotation. Projected textures use the actual
inverse OCIO working-space transform and include deformation overflow.
Individual object3D surfaces can supply mattes or effect sources. Reframe crop,
fit and fit-blur apply to the geometry passes. Flip, cube and page-curl
transitions use geometric texture projection.

## Imported animation

Named glTF/FBX/USD clips use local object time, `animationSpeed` and
`animationOffset`. Blender evaluates the imported hierarchy, armature and skin,
then bakes the requested timestamp into geometry. `morphWeights` overrides morph
animation; its length must match the imported target count. glTF material
variants select their named material mappings. Unknown clips, variants and
incorrect morph counts fail rather than falling back silently.

Static glTF/GLB, FBX, USD/USDZ, OBJ, PLY and STL use native imports without
requiring animation flags. Imported slots, material bindings, UVs and evaluated
hierarchies survive baking. Other Assimp geometry retains transforms, UVs and
per-face material indices; common diffuse/emissive/opacity/roughness/metallic/
normal-map properties map to Principled materials. Explicit XML materials
override imported slots. Source-engine shaders outside portable material models
are subject to the source importer’s conversion rules.

USD dependencies include shader asset attributes and animated asset values,
not just composition references. Referenced textures and UDIM tiles are checked
against the scene root, copied into the native job and hashed for cache identity.
USD stage axis and units are handled consistently with scene coordinates.

## Deformation and constraints

Ordered modifiers implement bend, twist, wave, squash/stretch, bulge/pinch,
spherize, ripple, turbulence, corner-pin, mesh-warp, puppet and skin. Corner-pin
uses a homography. Mesh-warp controls are row-major displacements. Puppet uses
moving least-squares affine deformation: position pins interpolate displaced
anchors, bend pins supply orientation handles, and starch pins retain local
shape around fixed handles. Skin uses
inverse bind matrices and linear blend skinning, with either automatic distance
weights or a JSON weight file:

```json
{"rows":24,"cols":24,"weights":[[{"bone":"arm","weight":1}]]}
```

The example above shows one vertex only; the file must contain one weight array
for every grid vertex. The render tessellation is 24–96 rows/columns, or the soft
body grid. Colour and masks use the same warp before ordered effects.
Automatic layout, alignment and safe-area bounds use the evaluated mesh extent
while the source box remains unchanged. Projected planes include the union of
the authored and deformed extents so overflow pixels survive texture capture.

Transform constraints cover copy components, parent, look-at, distance, path and
tracking, with influence and offsets. Two-bone IK is attached to a skeleton;
`point` names the tip bone and `target` names the goal node. Dependency cycles
and singular transforms fail explicitly.

## Physics, fields and particles

Planck 1.4.2 provides deterministic fixed-step rigid simulation. Body types,
box/circle/capsule/path/polygon/alpha-hull shapes, mass, damping, friction,
restitution, sensors, collision groups, bullet handling, activation and fixed
rotation are implemented. Concave path outlines are triangulated; an alpha hull
uses pixels at alpha >= 0.5. Parent rotation/scale/anchor transforms are baked
into collision geometry and solved poses are converted back to local space.

Gravity is expressed in metres/s² with +Y up, as specified by the XSD; default
negative gravity therefore moves objects down the screen. Authored positions,
body velocities and field accelerations use screen coordinates in pixels,
pixels/s and pixels/s². `pixelsPerMeter` converts the solver quantities.
Bounds can be none, frame or floor.

Cloth/jelly/rope use mass points and distance constraints, pin selections,
damping, pressure and optional point self-collision. Pins follow animated
parents. Stiffness determines additional solver substeps; a requirement above
4096 substeps is rejected. This is a 2D mass-spring simulation, not a volumetric
finite-element or triangle-mesh cloth solver.

Seven fields and eight joint types are implemented. Field intervals and
body/particle filters apply. Joints support motors, limits, damping, stiffness
and break force. Slider limits use the schema's `minAngle`/`maxAngle` slots as
translation distances in pixels; hinge/motor angles are degrees.

Simulation stores fixed-step pose checkpoints and interpolates requested times.
Seeking backwards reads checkpoints; extending a loaded cache replays the solver
from its initial state. Cache identity includes semantic scene data, collision
geometry, tracking bytes and solver version. Optional SHA-256 is checked.

```sh
# Bake a source scene without a physics/@cache reference:
node scripts/bake-physics.js source.xml poses.json
# Then set physics/@cache and optionally physics/@cacheSha256 in the render scene.
```

The simulation budget is two million body/tick records. Fixed step is bounded to
1/2000–1 second; solver iterations to 100. Cache files are data inputs and are
never silently overwritten during rendering.

All ten particle presets and six emitter shapes are supported, including sprite
atlases, rate/bursts, preroll, lifetime/velocity/size/rotation variance, curves,
fields, drag, turbulence, gravity, collision/bounce, colour, opacity, blending
and effects. Random streams depend on seed, birth ID and property lane. Burst
particles take IDs from a separate range fixed by burst order, repeat and index,
so they keep their random streams as continuous births accrue; asset-alpha
rejection sampling uses its own lanes. Particle
simulation is evaluated from birth, so seek order is independent. Maximum
budgets: 100,000 particles, 200,000 births, 600 seconds and four million integration
steps per sample. Burst allocations enforce the same birth budget. When
maxParticles is exceeded, the newest living particles win.

Particle collision uses continuous circle-versus-fixture contact, including
radius, convex decompositions, rotated polygons and circles. Conservative
advancement samples historical fixed-step poses, transfers translational and
angular collider velocity, and avoids tunnelling through thin walls. Sensors
are excluded and activation times apply. Animated emitter transforms, field
vectors and composition clocks are converted consistently between local and
world coordinates. The emitter's world transform is measured on a 1/120 s grid
and reused across a grid cell whose two ends agree (exact for static and
piecewise-static transforms); otherwise each integration instant is measured.
A render followed by a backward seek reproduces its pixels.

Kinematic bodies turn the short way toward their animated angle, so rotation
crossing ±180° stays continuous. Joint `breakForce` compares the reaction force
of the last solver substep, which is independent of the substep count.

## Tracking and 360

Tracking reads JSON, CSV, Nuke .chan, After Effects, Mocha corner-pin and binary or
ASCII FBX. Time offsets and hashes are enforced. Named point collections support
point, planar, face and mask landmark attachment. FBX retains source timestamps
and resamples at project FPS, with Euler angles kept continuous from frame to
frame rather than wrapping at ±180°. Stabilization uses footage clip/speed/remap
time and a symmetric 17-sample smoothing window; rotation is averaged as offsets
wrapped to ±180° from the current angle.

Panorama layouts are equirectangular, cubemap, equiangular cubemap and fisheye 180.
Stereo is mono, top-bottom or left-right, with IPD in metres. Cube atlases use six
square faces in a 3x2 grid: right/left/up, then down/front/back, for each eye.
`scene360` sets the output dimensions; output width scales them proportionally.
Project mode equirectangular supplies a panorama without a scene360 element;
viewport mode selects the perspective camera view.

All panorama MP4s contain Spherical Video V2 `st3d`/`sv3d` metadata in the visual
sample entry. Equirectangular exports also retain compatible V1 UUID metadata.
Cubemap, EAC and fisheye use compressed mesh projections that match the renderer’s
actual face orientation and per-eye UVs. Meshes contain CRC32, inward winding and
standard stereo layout flags. Equirectangular uses the standard `equi` box.

Injection replaces existing metadata, is idempotent, preserves codec data and
updates both 32-bit and 64-bit chunk offsets when needed. Fast-start and ordinary
MP4s retain identical decoded pixels. A `.projection.json` sidecar is also kept
for applications that do not read spherical metadata. Playback support for mesh
projections depends on the player.

## Integration evidence

| Former gap | Implemented and covered |
| --- | --- |
| Composition | Depth stacks, 2D interleaving, parented planes, group masks/effects/opacity, crop/fit/fit-blur. |
| Lighting | Authored map resolution/bias, receiver-plane correction, PCF, environment receiver overrides and light filters. |
| Import | Static native material/UV slots; Assimp material mapping; audited USD texture dependencies. |
| Deformation | Mesh-derived automatic layout/safe-area bounds, projected overflow and MLS puppet handles. |
| Particles | Swept radius, rotating/moving fixtures, relative velocity, historical poses and backward seek. |
| Projection | Embedded V2 meshes for cubemap/EAC/fisheye, compatible stereo, CRC and MP4 remux checks. |
| Colour | Custom OCIO inverse conversion for projected textures, without display grading. |

## Verification and numerical contract

Tests include analytical camera/depth checks, fixed-step acceleration, collisions,
parent transforms, cache replay, all fields/joints/presets/modifiers, tracking
formats, actual glTF clips/morphs/variants/skinning, MaterialX/OpenPBR compilation,
physical materials/lights, fonts/extrusion, DOF/shake, 2.5D, stereo/panoramas,
shutter sampling and MP4 metadata preserving decoded frames. Cycles renders are
compared within 1e-5 floating-point tolerance across processes; bitwise native
pixel identity is not promised across CPUs or library builds.

Shadow maps use primary-surface visibility and filtered depth comparisons;
ray-traced default shadows retain Cycles’ full light-path evaluation. The two
algorithms are not expected to produce pixel-identical shadows. Puppet and soft
body solvers are numerical mesh approximations, with the budgets documented above.

References:
- https://github.com/google/spatial-media/blob/master/docs/spherical-video-rfc.md
- https://github.com/google/spatial-media/blob/master/docs/spherical-video-v2-rfc.md
- https://github.com/blender/blender/blob/main/intern/cycles/kernel/camera/projection.h
