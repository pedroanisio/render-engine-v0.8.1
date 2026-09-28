# Batch 6 — reproducible demonstration

`scene.xml` renders an 8-second, 640×360, 12 fps demonstration with synthesized
audio, level-driven music ducking, routed buses, EQ/compression/delay, normalized
stereo audio and highlighted Portuguese captions. The sounds are original test
signals, not a human voiceover. `create-audio.mjs` regenerates them without any
network dependency.

```sh
node examples/batch6/create-audio.mjs
node bin/scene-render.js render examples/batch6/scene.xml
```

Included output: `preview.mp4`, `poster.png`, Portuguese WebVTT, audio/asset
measurements and the accessibility report. The MP4 has H.264 video, AAC audio and
an embedded timed-text track. The Inter font is accompanied by its OFL license.
