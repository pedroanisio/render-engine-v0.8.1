# Export and operation contract — 0.8.1

The schema remains scene-render 1.1. Rendering validates schema and runtime rules,
then checks the installed encoder and a real one-frame encode before processing
scene frames. Unsupported combinations fail; a schema-valid document is not a
promise that an arbitrary codec/container/format combination exists.

## Formats

| `codec` | Containers (first is default) | Native default pixel format |
|---|---|---|
| h264 | mp4, mov, mkv | yuv420p |
| h265 | mp4, mov, mkv | yuv420p10le |
| ffv1 | mkv | gbrp16le |
| av1 | mp4, mkv, webm | yuv420p |
| vp9 | webm, mkv, mp4 | yuv420p |
| prores | mov, mkv | yuv422p10le |
| dnxhr | mov, mxf, mkv | yuv422p |
| gif / apng / webp | respective image format; omit `container` | native image format |
| png-sequence / jpeg-sequence / exr-sequence / tiff-sequence | image2; omit `container` | native high-precision format where available |
| audio-only | wav, m4a, mp3, mkv | no video stream |

The XSD's absent/default `pixelFormat=yuv420p` selects the native default for
non-H.264 formats. An explicitly written pixel format is honored and checked
against the actual encoder. Alpha outputs require an alpha-capable codec and
pixel format: FFV1, ProRes 4444/4444XQ, VP9, GIF, APNG, WebP, PNG/TIFF/EXR sequences.
GIF transparency is binary. H.264, H.265, AV1, DNxHR and JPEG alpha are rejected.
FFV1/ProRes/VP9 alpha is checked with decoded sample fixtures, not inferred from
file extensions. Some third-party VP9 decoders do not expose the auxiliary alpha
stream; use a compatible libvpx decoder.

Width and height default independently to the selected layout/project. Explicit
values are never silently rounded to even dimensions or cropped. Chroma-subsampled
formats reject incompatible dimensions. Setting both dimensions to a different
ratio resizes the composed image to that ratio; use a layout/reframe for alternate
composition. `--scale` scales the layout/project canvas uniformly for previews.
The project pixel aspect ratio is carried as sample aspect ratio. DNxHR requires
at least 256×120; MXF additionally requires a backend-supported frame rate.

`profile`, `level`, ProRes profile, CRF/bitrate, max rate, buffer size, GOP and
B-frames reach the encoder. Bitrate takes precedence over CRF. Two-pass export is
available for H.264/H.265/VP9/AV1 with an explicit bitrate. Maximum file size
reserves 6% for overhead, subtracts the audio bitrate and derives a video budget;
a final size check blocks publication if that budget proves insufficient. It does
not truncate an encoded file to satisfy the limit.

GIF/APNG/WebP loop counts reach their respective muxers. Image sequences use a
printf path such as `frames/frame-%06d.exr`, numbered from one for each export.
They contain no audio stream; choose a separate audio-only output if required.
Audio defaults to AAC for regular movies, Opus in WebM, MP3 in MP3, and PCM in WAV
and MXF. WAV PCM follows the mix's bit depth. Explicit `audioCodec` is checked by
the backend. Ambisonic ACN/SN3D export requires `audioCodec="libopus"` in MKV/WebM;
the encoder writes mapping family 2. Unsupported implicit ambisonic conversion
is rejected.

## Time, color and metadata

Output `start/end` and CLI ranges are half-open composition intervals aligned up
to output-frame boundaries. The full project audio is mixed before trimming, so
fades, ducking, tails and normalization have the same history in partial exports.
Captions and chapter ranges are clipped/rebased. Timecode advances by the export
offset in frames: non-drop-frame (`:`) at the nominal rate, drop-frame (`;`, 29.97
and 59.94 only) with drop-frame labels. Unparsable or dropped labels are rejected. Segment concat durations are supplied explicitly to prevent
millisecond container timestamp rounding from accumulating across cuts.

Frames reach regular exporters as straight-alpha RGBA16; RGB is unassociated
before transfer encoding. Non-alpha outputs composite against black in linear
light. EXR uses planar float intermediates and retains negative and above-one
scene-linear values, rather than quantizing them through an 8-bit preview. EXR
requires auto/linear transfer. PQ uses the existing convention 1.0 = 100 nits;
HLG uses the existing scene-relative transfer. Specify suitable working/display
settings and tone mapping for the intended master.

Output primaries, transfer and range are converted/tagged. H.265 accepts `maxCLL`,
`maxFALL` and x265 `G(...)B(...)R(...)WP(...)L(...)` mastering metadata. Other codecs
reject these static-HDR fields rather than falsely claiming to write them.
Camera-log/ACES encodings and DCI-P3 gamma 2.6 lack matching standard container
transfer tags and are left untagged (linear encodings are tagged `linear`); sample
encoding remains declared in the accompanying assets manifest.

Metadata embedding includes standard metadata attributes, custom `<meta>` values,
asset credits/licenses and `kind="chapter"` markers as chapters where supported by the container.
`embedMetadata=false` removes metadata/chapter mapping. Containers with limited
tag dictionaries cannot retain arbitrary keys; the JSON assets manifest remains
the authoritative provenance record. MP4/MOV spherical boxes honor
`sphericalMetadata`; other containers require that flag to be false for panorama
outputs. This is a documented backend limitation, not certified spherical support
for every container.

Posters/thumbnails use real PNG, JPEG, WebP or AVIF encoders, composition time plus
optional marker offset, requested width and quality. They are sRGB display stills,
not HDR master replacements. PNG quality controls compression; lossy encoders use
quality 1–100 derived from the schema's 0–1 value. Alpha survives capable formats;
JPEG is flattened on black.

## Delivery

Destinations run after a locally verified export. File copies install through a
sibling temporary plus rename. HTTP PUT streams the file; webhook POST sends a
JSON receipt containing filename and byte count. S3, GCS and Azure Blob use signed
upload URLs supplied by a credential profile; Azure adds `x-ms-blob-type: BlockBlob`.
SFTP uses OpenSSH batch mode, strict host-key checking and an optional key file.
An existing trusted host entry and remote directory are required. Sequence
destinations receive one deterministic ZIP containing all numbered frames.

`credentials="production"` resolves the environment variable
`SCENE_RENDER_PROFILE_production`, containing JSON such as:

```json
{"resource":"s3://bucket/key", "url":"https://signed-upload-endpoint", "headers":{"Authorization":"..."}}
```

If the signed endpoint differs from the XML URI, `resource` must exactly match
the XML URI; a credential profile cannot silently redirect a different target.
A profile that carries `headers` must also bind its destination through `url`,
`resource` (the exact XML URI) or `origin` (the XML URI's origin); credential
headers are never sent to an unbound URI taken from the scene XML.
For SFTP use `{"keyFile":"/private/path/to/key"}`. No password, key contents or
signed URL belongs in XML. Credential objects are never written into render
manifests. HTTP delivery has a 60-second timeout and rejects redirects. Live cloud
accounts and SFTP servers are not required by the test suite; HTTP protocol tests
use a local server. Signing/refreshing cloud URLs is the caller's responsibility.
A delivery failure is reported even if the local artifact was completed; rerun
uses verified visual caches and retries delivery.

## Cache, resources and cancellation

Visual intermediates are FFV1/16-bit, or float NUT for EXR. Keys include scene,
expanded includes/data/variants, renderer/native/FFmpeg version, geometry/FPS,
the selected output's id and full attribute set (alpha, colour space/transfer,
burnt-in captions and every other output choice), representation, and resource
hashes. Each shot's key covers the images its layers and particle emitters
(`sprite`, `emitterAsset`) draw, plus those of any track matte it references. Videos, sequences, fonts, LUTs, meshes, maps,
generated assets and simulation dependencies enter the dependency audit. Simple
image-only shots invalidate independently; complex/temporal dependencies and
fonts deliberately invalidate conservatively. Every reused segment must match
its streaming SHA-256 integrity receipt. A failed or truncated intermediate never
becomes a successful cache hit.

Runs have isolated temporary directories. Output locks prevent concurrent writers
to the same final path, with stale-PID recovery on the same host/PID namespace.
A lock file without a readable owner (a crash between creating and writing it)
is treated as stale after 10 seconds. Recovery is serialised through a sibling
`.reap` lock and re-checks staleness before removing anything, so concurrent
recoverers cannot delete a lock another renderer has just taken; releasing only
removes a lock that is still the renderer's own, and tolerates it being gone.
These are not distributed locks across machines or isolated PID namespaces.
Publication copies onto the target filesystem and then renames atomically; each
sequence member is atomic, while a sequence as a whole is not a filesystem
transaction. The final manifest is the completion evidence. Frames from a previous longer export are removed only when the prior manifest
identifies them as owned members of that sequence; unrelated files are preserved.

The raster cache uses a 128 MiB LRU budget. Production audio stems spill to disk
with a 128 MiB in-memory cache; active mix/DSP buffers still require memory
proportional to project duration and channels. The existing 200-million-sample
per-buffer limit remains. Canvas/output budgets are 32 megapixels; jobs are 1–32.
Threads are 1–32: `--threads N` renders the frames of each segment on N worker
threads, each holding its own renderer and decoded media, and feeds them to the
segment encoder in order; by default a render of at least 24 frames uses half the
cores, at most four and no more renderers than free memory holds, shard processes
use one, and `--threads 1` selects the serial path. Frames do not depend on
rendering order, so segment digests are identical either way. Workers build
their renderer from the exact scene bytes and include/data text the pipeline
hashed, never from a later read of the disk. `--jobs` passes list and object
parameters to shard processes as JSON. External processes (shards, encoders)
have no implicit time limit; they run until finished or cancelled. FFprobe results are
cached in the OS temp directory (`scene-render-probe-cache.json`), keyed by the
absolute path, size, modification time and ffprobe version.
Work storage must have room for lossless intermediates and audio stems.

`renderEpisode({signal})` and CLI SIGINT/SIGTERM cancel active encoding/audio
process groups and clean owned temporaries. Audio DSP runs in an isolated process
so synchronous DSP and its native children do not block parent cancellation.
A synchronous native visual call can finish its current bounded operation before
the parent handles cancellation. Spawn errors, broken pipes and encoder failures
reject the render; diagnostics keep bounded stderr. Each final movie is decoded
and its frame count checked before publication. Animated WebP uses libvips because
the installed FFmpeg cannot decode animated WebP.

The reproducibility guarantee is decoded pixels/PCM for fixed renderer, libraries,
platform and seed, not identical bytes of a container with implementation-specific
UIDs or metadata. The assets report records backend versions, settings and elapsed
seconds/frame counts/cache counts. Do not compare throughput across different
preview scales or native backends without recording those differences.

## Commands and evidence

```sh
node bin/scene-render.js render scene.xml --output '*'
node bin/scene-render.js capabilities --json
node scripts/render-oracle.js scene.xml --output main --from 0 --to 2
npm run check
```

The capabilities manifest enumerates schema contexts, every attribute and its enum
values, and the runtime declaration/guard status. It explicitly does not label a
field certified merely because it parses. The render oracle records structural,
semantic and actual export verdicts separately. See `batch7-validation.md` for
measured evidence and outstanding certification limits.

## Compatibility and evidence updates

`--anchor-mode pivot` (default) retains the established transform convention.
`--anchor-mode position` places a 2D anchor at x/y, including animated values.
It is explicit and recorded in the report/cache; it is never inferred from an
input filename. Physics/deformation/constraints/3D scenes reject this compatibility
mode. Both modes are checked analytically and against decoded frame/still pixels.

Multi-output calls return `outputs` for every individual export, aggregate stills
and captions, and retain `video` as the last output for API compatibility. Duplicate
final paths are rejected before export. The render oracle reports every output.
Worker stderr is bounded and the first failure cancels siblings. Worker SIGTERM
allows owned cleanup before a timed forced termination fallback.

Explicit options unavailable for a codec (such as a GIF CRF/preset, ProRes level,
or sequence audio) fail preflight. Schema defaults remain format-specific defaults.
Range-based maximum-size budgets use encoded duration. Output reports now retain
all requested output attributes in addition to effective encoder arguments.

SFTP profiles may set `knownHostsFile` alongside `keyFile`; strict host verification
is mandatory. Remote upload names are unique before atomic rename, and quoted paths
are exercised against an authenticated loopback SFTP server. Malformed credential
profiles fail without including their secret contents in diagnostics.

The exhaustive evidence gate is `npm run certify`; the checked-in report enumerates
missing per-attribute/enum proof rather than promoting parsing to certification.
