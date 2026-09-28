# Batch 6 validation — version 0.7.0

Validation date: 2026-09-27. Renderer cache revision: 10.

## Release gate

`npm run check` completed successfully on the final source tree:

| Check | Result |
| --- | --- |
| Strict JavaScript type checking | Passed |
| Tests | 588 passed / 0 failed / 0 skipped |
| Line coverage | 97.38% |
| Branch coverage | 91.01% |
| Function coverage | 94.88% |
| Required coverage thresholds | 90% / 90% / 90%, unchanged |

The complete existing suite remains enabled. Tests for the obsolete graph-string
implementation now verify decoded/sample-domain behavior through the new mixer.
Existing runtime automation, media timestamps, transition audio, cold/warm caches,
parallel rendering, fonts, 2D/3D, physics and native backend regressions pass.

## New evidence

- Numeric sample placement: trims, one-sample starts, negative starts, reverse,
  finite repeats, marker offsets, speed and whole-bar fitting.
- Routing: nested outputs, track and bus sidechains, post-gain detector behavior,
  silence below threshold, attack/release and graph-cycle rejection.
- DSP: all 16 effect types, exact enabled/mix bypass, filters measured against
  low/high-frequency signals, compressor/gate reduction, EQ band variants,
  stereo width, long delay echoes, reverb tails and runtime/named controls.
- Pitch: FFT measurements confirm 400 → 800 Hz for +12 semitones, 400 Hz with
  2× pitch-preserving speed and 800 Hz with resampled 2× speed.
- Channel identity: independently distinguishable channels survive 5.1, 7.1,
  7.1.4 and first/third-order ambisonic mixing. Implicit ambisonic conversion
  from a mismatched channel count fails explicitly.
- Loudness: static and dynamic normalization, independently enabled limiting,
  silence, dithering controls, PCM depth, sample rate and encoded AAC ceiling.
- Captions: SRT/VTT/ASS/TTML/ITT/SCC fixtures, CEA-608 odd parity, cache identity
  and hash rejection, timing/style inheritance, timed words, sequential timing,
  line/word/character limits, Unicode text and all thirteen presets.
- Integration: burned pixels, MP4 timed text and Portuguese language metadata,
  sidecars, audio-disabled output, arbitrary partial-frame intervals, word/cue
  rebasing, content-dependent caches and stable frames after backward seeking.
- Accessibility: missing required captions, inaudible description routes,
  general/red flash logic, low-area/low-contrast exclusions, output-space text
  contrast, warning reports and publication blocked by an error policy.

Primary test files: `test/render-audio.test.js`,
`test/render-automation.test.js`, `test/batch6-captions.test.js`,
`test/batch6-integration.test.js`, plus the existing pipeline/media/runtime suite.

## Included render

`examples/batch6/scene.xml` validates and renders with the released code. The
poster was visually inspected for typography, clipping, caption placement and
legibility. The source audio is generated locally by `create-audio.mjs`.

| Measurement | Result |
| --- | --- |
| Duration | 8.000 s |
| Picture | H.264, 640×360, 12 fps, 96 frames |
| Audio | AAC, 44,100 Hz, stereo |
| PCM master | 24-bit, 352,800 sample frames |
| Integrated loudness, encoded | −16.01 LUFS (target −16) |
| True peak, encoded | −7.59 dBTP (ceiling −1) |
| Loudness range, encoded | 2.6 LU |
| Subtitle stream | MP4 `mov_text`, Portuguese; original `pt-BR` tag retained |
| External captions | WebVTT, plus visible word highlighting |
| Flash/contrast report | No findings; passed |

The delivery contains the XML, original audio signals, generation script,
licensed font, MP4, poster, captions, audio/asset provenance and accessibility
report. Dependencies and transient render caches are excluded from the ZIP.

See `docs/audio-captions-accessibility.md` for exact algorithms, units,
normalization limits, caption cache shape and the boundary with Batch 7 exports.
