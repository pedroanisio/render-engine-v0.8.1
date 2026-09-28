#!/usr/bin/env node
/** Bake fixed-step poses without rendering or encoding video. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadScene } from "../src/index.js";
import { compileRuntime } from "../src/eval/runtime.js";
import { prepareMedia } from "../src/media/manager.js";
import { assetPath } from "../src/media/resolve.js";
import { FrameRenderer } from "../src/render/frame.js";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("usage: node scripts/bake-physics.js scene.xml poses.json");
const file = resolve(input),
  loaded = loadScene(readFileSync(file, "utf8"));
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
// The bake source omits the cache reference, then the render source may pin its SHA-256.
const runtime = compileRuntime(loaded.scene, {
    expand: true,
    load: loadScene,
    read: (src) => readFileSync(assetPath(dirname(file), src), "utf8"),
  }),
  media = await prepareMedia(runtime.scene, { base: dirname(file) });
try {
  const renderer = new FrameRenderer(
    runtime.scene,
    runtime.tracks,
    {
      read: media.read,
      media: media.render,
      dimensions: media.dimensions,
      meshes: media.meshes,
      meshDependencies: media.dependencies,
    },
    1,
    runtime,
  );
  if (!renderer.physics) throw new Error("scene has no physics bodies");
  renderer.physics.advance(
    Math.ceil(
      (renderer.duration - renderer.physics.start) / renderer.physics.dt,
    ),
  );
  writeFileSync(
    resolve(output),
    JSON.stringify(renderer.physics.export()) + "\n",
  );
} finally {
  media.close();
}
