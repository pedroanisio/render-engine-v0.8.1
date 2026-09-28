# Batch 7 validation — 0.8.1

This release implements the export and operational paths below. It does **not**
claim that parsing every schema attribute certifies all feature combinations.
The remaining original-project acceptance issues are explicit in the Beta Pictoris
section; the original scene is not marked fully certified.

| Requirement | Implementation and measured evidence |
|---|---|
| B7.01 Output contract | All 15 codec families encoded by real backends; probes check codecs, independent dimensions, rational FPS, frame counts, channels and bit depth. Profile errors fail backend preflight. Two-pass, bitrate limits, alpha, audio-only, time ranges and timecodes have tests. |
| B7.02 Special outputs | Real GIF/APNG/WebP animations and PNG/JPEG/EXR/TIFF sequences. Sequence frame counts and decoded dimensions are checked. Float EXR preserves above-one samples. Alpha is checked numerically. HDR PQ has tagged HEVC output. `--output '*'` exercises independent outputs. |
| B7.03 Metadata/delivery | Metadata/chapter probes, metadata opt-out, timecode offset, HDR fields, MP4/MOV spherical flag handling; local copies, local HTTP PUT/webhook and signed-URL cloud protocol fixtures. Sequence delivery is a complete numbered-frame ZIP. Ambisonic Opus exposes the expected channel layout/mapping. Authenticated loopback SFTP is tested; live cloud account acceptance is not asserted. |
| B7.04 Stills | PNG/JPEG/WebP/AVIF decoded by libvips; width, marker timing and real formats checked. Example poster visually inspected. |
| B7.05 Cache | Existing image/font/video/native-resource invalidation fixtures retained. Cache corruption is injected and repaired. Streaming hashes, private workspaces and conservative dependency handling protect reuse. |
| B7.06 Operation | Spawn failure, broken pipe, AbortSignal, cleanup, process-group shutdown, output exclusion/stale-lock recovery, quoted paths, partial exports and shards. Old sequence members are removed only through their prior ownership manifest. |
| B7.07 Determinism/performance | Warm/cold/parallel tests compare decoded results. Bounded raster cache and disk-backed stems are exercised. Reports record elapsed time, frame counts, cache counts and versions. Container-byte equality across platforms is not promised. |
| B7.08 Coverage/certification | `capabilities --json` inventories schema contexts/attributes/enums and runtime guards. The existing libxml2 structural oracle is retained; the new render oracle separates structural, semantic and actual-render outcomes. Family-level behavioral fixtures are evidence, not an exhaustive per-attribute/per-combination certificate. |

## Test commands

`npm run check` runs strict TypeScript/checkJs and the complete Node suite, with
90% minimum lines, branches and functions. No coverage threshold has been lowered,
and no test is skipped to obtain a pass. The final run passed **642 tests, zero failures and zero skips**. Coverage was
**97.54% lines, 91.19% branches and 95.14% functions**; strict type checking passed.

`test/batch7-export.test.js` adds decoder/probe integration tests. Existing Batch
1–6 fixtures continue to exercise composition, media, native rendering, DSP,
caption timing and accessibility under the new export pipeline.

## Beta Pictoris b

The actual `beta-pic-b-complete-project.zip` and `beta-pic-b-radio.scene.xml` were
retrieved, not replaced with a synthetic scene. The resolved project contains all
required assets and passes structural/runtime preflight.

The first native render exposed a real engine defect: style lookup used the string
`undefined` as a reference and recursed into a token without an ID. That defect was
fixed, with a regression test. Bare OpenType feature tags such as `tnum, lnum` are
also accepted as enabled features.

The unmodified resolved project then fails its own `safeArea enforce="error"`
rule (`s01-tab-txt` during the entrance). That is a negative acceptance result,
not a successful render. An explicitly labeled **audit copy** changes only
safe-area/flash/contrast enforcement from `error` to `warn`; original inputs are
preserved. This copy is used to exercise the native rendering paths at 192×108,
24 fps without claiming 1080p visual certification.

The visual review found two further defects: grain ignored its intensity/size,
and fully invisible nodes participated in safe-area/contrast checks. Both were
fixed, with grain regression coverage. The original one-second diagnostic and its
reports are retained under `examples/batch7/beta-pictoris/pre-fix/`; those warnings describe
the earlier implementation and must not be read as current acceptance results.

The anchor mismatch is now addressed by explicit `--anchor-mode position`.
It positions the anchor at x/y (`T(x,y) R skew S T(-anchor)`). The default remains
`pivot`, preserving existing Batch 2 projects. The setting reaches workers,
stills, cache keys and output reports. It currently supports 2D scenes without
physics, deformation or transform constraints; incompatible scenes fail before
frames. Analytic matrices, actual decoded pixels, stills and sequential/parallel
comparisons cover both conventions.

The complete 7,012-frame, 31-segment timeline was regenerated with renderer 13 and
position anchors, then decoded and checked against SHA-256 receipts. The updated
192×108 H.264 proxy contains the native full-project audio mix, timed captions,
metadata and chapters. The audio request was compared byte-for-byte with the
retained native mix request before reuse. The final movie was decoded and its
7,012 frames independently counted.

`position-5s.png` and four later samples show the compatible composition;
`reference-5s.png` is produced by the original Python renderer. That reference is
approximate: it omits the XML finishing stack (including grain and grading), uses
Pillow typography and approximates shadows/transitions. Matching its pixels by
ignoring declared XML effects would hide a difference. These differences are
explicit, and the reference is not used as an exact pixel oracle for those effects.

The original strict safe-area rule still rejects the author's layout. The audit
copy retains its explicit warning policy. No source scene rules were silently
relaxed by the engine, and the proxy is not a 1080p editorial/accessibility approval.

## Executable certification gate

`npm run certify` executes the full typecheck/test suite and records only explicit
behavioral evidence emitted after assertions succeed. It inventories the document
root and every unique schema attribute/enum, identifies missing positive/negative
evidence, and pins source/test hashes in `docs/conformance-report.json`. Exit codes
are 0 for complete certification, 1 for a suite failure and 2 for incomplete
behavioral evidence. Passing parsing, test names, code coverage, or a broad family
fixture never automatically certifies individual attributes.

The current evidence inventory is intentionally stricter than the earlier family
coverage claims. The current registry contains 3,249 unique attribute/enum items: 38 have both
positive and negative behavioral evidence, 70 have positive evidence, and 39 have
negative evidence. The remaining 3,211 are individually listed in the report.
This is the explicit evidence registry, not a count of implemented features.
Missing evidence means an item is not individually certified;
it does not, by itself, mean the feature is absent. Full B7.08 remains open until
all required evidence and original-project acceptance are closed.

Additional integration tests verify all ProRes profiles in real streams, GOP and
B-frame behavior, faststart atom ordering, metadata preservation/opt-out, transfer
and primaries math, still quality, explicit unsupported output options, multi-output
result enumeration/path collision, worker cleanup and real key-authenticated SFTP.
The SFTP fixture is loopback-only and changes no host accounts. Install its pinned
dependency with `python3 -m venv .venv-test` followed by
`.venv-test/bin/pip install -r requirements-test.txt`; alternatively set
`SCENE_RENDER_TEST_PYTHON` to a Python with that dependency installed.

## Example and reproducibility

`examples/batch7/scene.xml` generates a 3-second 640×360 MP4, a 320×180 animated
WebP, a 1-second FFV1 alpha master, one float EXR frame and four still formats.
All use existing local licensed Inter bytes; no provider/network generation is
required. It is intentionally silent.

Reproduction requires the dependencies documented in the Batch 3–6 backend
contracts plus FFmpeg/ffprobe and libvips encoders. The supplied reports include
the exact FFmpeg/native version information from this environment. Source schema
SHA-256 remains `3d0ecb499bc682ab69405a7f57dccfe1a659abbc3dbcb5a33897a17e28b3c603`.
