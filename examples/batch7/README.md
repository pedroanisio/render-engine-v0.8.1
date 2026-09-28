# Batch 7 integration example

Run `node bin/scene-render.js render examples/batch7/scene.xml --output '*'`.
Four independent outputs demonstrate H.264/MP4, animated WebP, FFV1 alpha and a
scene-linear float EXR frame. The main output also creates PNG, JPEG, WebP and
AVIF stills. The design, geometry and animation are authored in XML. Inter is
included under its accompanying SIL Open Font License. This is a silent export
fixture; it does not contain narration.

[`beta-pictoris/`](beta-pictoris/) is a separate, unrelated package nested in
this folder: diagnostic evidence for an external science-explainer video, not
a feature demo, and not runnable here (its project assets are not bundled).
See its own README before treating anything in it as current acceptance
evidence.
