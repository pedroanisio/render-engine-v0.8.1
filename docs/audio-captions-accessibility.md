# Batch 6 — audio, captions and accessibility

Version 0.7.0 · renderer cache revision 10.

| Plan | Implementation |
| --- | --- |
| B6.01 | Sample-clock placement, marker offsets, trims, reverse, speed, pitch preservation, finite repeats, BPM/bar fitting, embedded video/layer audio and runtime controls. |
| B6.02 | Track → bus → bus → master routing, gain/pan/mute, effects on every stage, configurable PCM format and independently enabled master limiter. |
| B6.03 | Post-processing track/bus sidechains, measured level threshold, attack/release envelopes, cycle rejection. |
| B6.04 | All 16 schema audio-effect types, EQ bands, wet/dry mix, enable controls, runtime automation and retained effect tails. |
| B6.05 | Five fade curves, existing transition envelopes, integrated/dynamic loudness, true-peak measurement/limiting, silence and frame/sample-aligned partial exports. |
| B6.06 | SRT, VTT, ASS, TTML, ITT and SCC imports; verified transcription caches; burned, sidecar and MP4 embedded captions; styles, presets, timed words, speakers, placement, safe area, z and pagination. |
| B6.07 | Required captions, audible description checks, description metadata, flash/contrast reports and configurable warning/error behavior. |

## Audio clock and routing

`mixAudio(scene, assetOf, duration, runtime?)` returns interleaved Float32 PCM,
format information and post-processing stems. `finishAudio` writes integer PCM
and measures BS.1770 integrated loudness, loudness range and true peak.
These replace the internal FFmpeg-string `mixGraph` API.

Track order is trim → reverse → speed → repeat/fit → sample placement and fade →
gain/pan/ducking → ordered effects. A bus sums its incoming tracks and buses,
then applies its own controls and effects. Only nodes without a destination feed
the master. References are resolved independent of document order. Routing,
ducking and effect sidechains share one dependency graph; cycles, including
disconnected cycles, are errors. Sidechain detectors read post-effect,
post-fader stems, so an inaudible source does not trigger ducking.

All positions are rounded once to the nearest sample. Negative starts are
cropped at project zero. `startMarker` adds the resolved marker time to `start`.
`loop=N` means the first play plus N repeats; no implicit infinite loop.
`speed<0` reverses, as does `reverse=true`; using both still reverses once.
With `preservePitch=true`, Rubber Band changes tempo while retaining pitch.
With `preservePitch=false`, source-rate conversion changes tempo and pitch.
Embedded video tracks retain the existing source-time/remapping/transition
contract, now at the mix's requested rate and channel count.

`fitToDuration=true` requires asset BPM and at least one complete bar. A bar is
`60 / BPM × beatsPerBar`, adjusted by speed; four beats is the default.
The largest whole-bar source interval is repeated and trimmed at project end.
It does not infer tempo, compose a musical ending or time-stretch to a new BPM.

Gain, volume and pan use the Batch 1 runtime on every sample. Pan is a
constant-power balance on the first stereo pair; other channels retain their
identity. Mono sources duplicate at unity into stereo. Multichannel conversion
uses FFmpeg's channel matrix. Ambisonic input must already have the requested
ACN/SN3D channel count; arbitrary mono/stereo sources are not spatially encoded.

The mixer accepts 8–192 kHz, 1–16 channels and 16/24/32-bit signed integer PCM.
Named layouts validate their channel count: mono, stereo, 5.1, 7.1, 7.1.4,
first-order and third-order ambisonics. The manifest records the logical layout.
The selected output codec still must support the requested format; this batch
does not add new video containers or ambisonic container metadata (Batch 7).
The offline mixer enforces a 200-million-sample per-node allocation ceiling.

## Ducking and dynamics

For each sample the detector takes the maximum absolute amplitude across all
referenced channels/stems. A 10 ms peak-release hold avoids carrier-frequency
chatter. A level above `duckThreshold` targets `10^(duckAmount/20)`; otherwise
it targets unity. `duckAttack` and `duckRelease` are one-pole time constants in
seconds. Multiple sources combine by maximum level, not summed scheduled spans.

Compressor, gate, limiter and de-esser use a linked-channel peak detector.
Attack/release are seconds, thresholds and makeup gains are dB, knee is dB and
ratio is an input/output slope. The master true-peak limiter is separate from
the sample-domain `audioEffect type="limiter"`.

## DSP contract

| Effect | Controls and algorithm |
| --- | --- |
| `eq` | Ordered RBJ biquads from `<band>`: peak, low/high shelf, high/low pass, notch; frequency Hz, gain dB, Q. |
| `highpass`, `lowpass` | Second-order Butterworth-style biquad, `frequency` Hz. |
| `telephone` | Cascaded 300 Hz high pass and 3400 Hz low pass. |
| `compressor` | Linked peak detector, threshold, ratio, soft knee, attack/release and makeup gain. |
| `limiter` | Infinite compression ratio with attack/release and makeup gain. |
| `gate` | Downward expansion below threshold, ratio, knee, attack/release and makeup gain. |
| `de-esser` | High-pass detector/band at `frequency` (6000 Hz if absent), dynamics settings and `amount` of band attenuation. |
| `delay` | Fractional delay, `time` seconds, feedback 0–1. Long delays are retained up to project duration. |
| `reverb` | Four feedback combs with incommensurate delay lengths, controlled by `roomSize`. An algorithmic reverb, not an impulse-response convolution. |
| `chorus` | Fractional delay modulated by a sinusoid; time seconds, frequency Hz, amount/depth and feedback. Stereo modulation differs by phase. |
| `pitch-shift` | Rubber Band pitch ratio `2^(semitones/12)` at unchanged duration. |
| `noise-reduction` | FFmpeg FFT denoising; amount maps to 0–48 dB reduction, threshold to noise floor (clamped to the backend's −80…−20 dB range). |
| `stereo-width` | Mid/side scaling of the first stereo pair; width 0 is mono, 1 unchanged. |
| `gain` | dB gain. |
| `distortion` | Amount blends the dry signal with a normalized tanh waveshaper; gain applies afterward. Amount zero is an exact bypass. |

Every effect has enabled and linear wet/dry mix. Stateful processors continue
through silence, preserving tails until project end. Native scalar controls run
per sample. Spectral pitch/denoise controls are sent every 128 samples, with the
backend's analysis-window latency/response. Named `<param name="…" value="…"/>`
controls use the documented controls for that effect; unknown names fail.
No network DSP or inference service is used. FFmpeg must include Rubber Band,
FFT denoising, loudnorm and alimiter.

Fade curves are linear, sine/equal-power, log10(1+9t), (10^t−1)/9 and cubic
smoothstep. Fade-out reaches zero at the last source sample. Audio transitions
continue to use the existing visual transition clock and cut/crossfade/
equal-power policies.

## Loudness and output synchronization

Integrated normalization measures the full project using FFmpeg's BS.1770/EBU
R128 implementation, applies a static gain to the requested LUFS, then limits
true peaks. Dynamic normalization uses `loudnorm` with a 7 LU LRA target (the
schema has no separate LRA target attribute). The independent `limiter=true`
path works with `normalize="none"`. The limiter runs at four times the mix rate
and compensates its lookahead latency. Supported normalization targets are
−70…−5 LUFS and −9…0 dBTP. A ceiling can prevent a high requested LUFS from
being reached; measured results are recorded rather than claiming a target hit.
Silence is reported as null LUFS/true peak, avoiding infinities in JSON.

Triangular dither is applied at integer PCM export unless `dither=false`.
The final encoded AAC is measured again; when a requested limiter/normalizer
ceiling is exceeded, the mux is repeated with enough attenuation to enforce it.
`*.assets.json` contains pre/post PCM and final encoded measurements, sample
count, layout and bit depth. AAC is a lossy delivery format and has no PCM bit
depth; `bitDepth` controls the intermediate/master WAV.

Partial exports insert boundaries at `ceil(from × fps)` and `ceil(to × fps)`.
The audio is processed from project zero, then cut, preserving DSP state and
normalization. Cue AND word times are clipped and rebased to the same interval.

## Captions

Imports normalize into the same cue/word representation before rendering.
SRT/VTT support cue timing, WebVTT voice/position settings and timestamp words;
ASS supports dialogue timing, common text styles, alignment and karaoke runs;
TTML/ITT support inherited timing/styles, regions, frame/tick clocks, parallel
and sequential containers, line breaks and timed spans. SCC uses FFmpeg's
CEA-608 decoder against the frozen source bytes. Source and font bytes are
included in cache keys. XML text styles override imported source styles.

Transcription is deterministic cache consumption. Supply `transcribe`, `cache`
and the SHA-256 of the exact cache bytes:

```json
{"version":1,"track":"voiceTrack","cues":[{"start":0,"end":1,"text":"Hello","words":[{"start":0,"end":1,"text":"Hello"}]}]}
```

Missing/mismatched caches fail explicitly. Automatic speech recognition is not
invoked. Audio generation is outside this batch.

- `mode="burn"` draws captions; `sidecar` writes WebVTT; `both` does both.
- `output@burnCaptions` explicitly selects the burned track.
- `output@captions` selects and embeds timed-text tracks in MP4, in addition to
  their declared sidecar behavior. There is no invented `mode="embed"` value.
- Sidecars use `video.<track-id>.<language>.vtt`, avoiding language collisions.
  MP4 language metadata uses three-letter codes; the original BCP-47 tag is
  retained in the subtitle handler name.
- Styles use the existing font shaping engine. Presets include classic, boxed
  line/word, one-word, karaoke/highlight, pop, fade, bounce, slide, typewriter,
  enlarge and none. Word emphasis applies bold weight. Without explicit word
  timings, word animation divides the cue duration equally among tokens.
- Caption placement is in output coordinates after reframe. Safe-area bounds
  constrain layout; captions participate in the composition's z ordering.
- Character limits count Unicode code points. Word and line limits paginate,
  preserving all text; timed pagination follows word boundaries. Very long words
  split into bounded chunks. WebVTT output retains the resulting line breaks.
- `profanityFilter` uses a deterministic English/Portuguese word list; it is not
  an arbitrary-language moderation model. Its exact list is in `captions.js`.

## Accessibility

`requireCaptions` requires a selected, nonempty cue in the exported interval.
`audioDescription` must resolve to an audible track/asset with an audible route
and final mix, and the output must contain audio. The description is included
in the output metadata and accessibility report.

Flash checking decodes the final video, analyzes general luminance and saturated
red opposing transitions, and counts flashes in sliding one-second windows.
Its reference viewing geometry is a 10-degree viewport one third of picture
width/height, with a 25% affected-area threshold. Analysis uses a 192-pixel-wide
area-resampled picture; the report records frame count and viewing assumption.
It is an automated diagnostic under that geometry, not a viewing-condition-
independent certification.

Contrast checking compares core text/caption pixels against a second render
with text suppressed, after reframe, composition and display transform. Caption
boxes remain in the background render. Occlusions, translucent text, glyph
outlines and heavily processed text may need manual inspection; the report
identifies the affected node and measured minimum ratio.

`off` disables a check, `warn` records/logs findings, and `error` writes the
report and prevents the temporary video from replacing the final output.
Reports are recomputed even when video segments come from cache.

References: [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html),
[WCAG three flashes or below threshold](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold).
