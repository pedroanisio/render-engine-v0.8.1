#!/usr/bin/env node
/** Isolated audio job: synchronous DSP/native tools cannot block parent cancellation. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileRuntime } from "../src/eval/runtime.js";
import { mixAudio, finishAudio } from "../src/render/audio.js";
import { videoAudio } from "../src/media/audio.js";
import { assetPath } from "../src/media/resolve.js";
import { createAudioAnalysis } from "../src/render/audio-analysis.js";
import { accessibilityRequirements } from "../src/render/accessibility.js";
const file = process.argv[2];
if (!file) throw new Error("Missing audio request");
const request = JSON.parse(readFileSync(file, "utf8"), (_k, v) =>
  v && typeof v === "object" && "$bigint" in v ? BigInt(v.$bigint) : v,
);
const { scene, base, work, duration, parameters, tracks, output, start, end } =
  request;
/** @type {Record<string,string>} */
const reads = request.reads ?? {};
const runtime = compileRuntime(scene, {
  parameters,
  // Data sources were read (and hashed) by the parent; the worker never reads files.
  read: (/** @type {string} */ path) => {
    if (!Object.hasOwn(reads, path))
      throw new Error(`audio worker has no data for ${path}`);
    return String(reads[path]);
  },
  audioAmplitude: createAudioAnalysis(scene, base),
});
const assets = new Map(
  /** @type {import('../src/xsd/validate.js').ValidNode[]} */ (
    scene.children.find(
      (/** @type {import('../src/xsd/validate.js').ValidNode} */ n) =>
        n.name === "assets",
    )?.children ?? []
  ).map((a) => [String(a.attributes.id), a]),
);
const embedded = videoAudio(runtime.scene, runtime, base, work);
const mixed = mixAudio(
  embedded.scene,
  (id) => ({
    path:
      embedded.paths.get(id) ??
      assetPath(base, String(assets.get(id)?.attributes.src)),
    audioStream: Number(assets.get(id)?.attributes.audioStream ?? 0),
    timelineAudio: assets.get(id)?.name === "video",
  }),
  duration,
  runtime,
  join(work, "audio-stems"),
);
const master = scene.children
  .find(
    (/** @type {import('../src/xsd/validate.js').ValidNode} */ n) =>
      n.name === "audioMix",
  )
  ?.children.find(
    (/** @type {import('../src/xsd/validate.js').ValidNode} */ n) =>
      n.name === "master",
  );
const finished = finishAudio(mixed, master, work);
const accessibility = accessibilityRequirements(
  scene,
  tracks,
  mixed,
  output,
  start,
  end,
);
writeFileSync(
  join(work, "audio-result.json"),
  JSON.stringify({ finished, accessibility }),
);
