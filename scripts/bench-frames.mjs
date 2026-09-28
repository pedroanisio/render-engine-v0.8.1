// Per-frame render benchmark, independent of FFmpeg and process start-up.
// Usage: node scripts/bench-frames.mjs <scene.xml> [outputId] [startSeconds] [frames]
// Prints the mean render and 16-bit encode time per frame and the resident size.
import { createRenderer } from "../src/render/setup.js";

const [sceneFile, outputId = "", start = "0", count = "12"] =
  process.argv.slice(2);
if (!sceneFile) {
  console.error(
    "usage: node scripts/bench-frames.mjs <scene.xml> [outputId] [startSeconds] [frames]",
  );
  process.exit(2);
}
const { renderer, media, oa, fps } = await createRenderer({
  sceneFile,
  outputId: outputId || undefined,
});
try {
  const f0 = Math.round(Number(start) * fps),
    n = Math.max(1, Number(count));
  let render = 0,
    encode = 0,
    first = 0;
  for (let f = f0; f < f0 + n; f++) {
    const a = performance.now();
    const frame = renderer.render(f / fps);
    const b = performance.now();
    renderer.color.encode16(frame, oa.alpha === true);
    const c = performance.now();
    if (f === f0) first = b - a;
    render += b - a;
    encode += c - b;
  }
  console.log(
    `${sceneFile} ${renderer.width}x${renderer.height} frames=${n} ` +
      `render=${(render / n).toFixed(1)}ms/frame encode=${(encode / n).toFixed(1)}ms/frame ` +
      `first=${first.toFixed(0)}ms rss=${Math.round(process.memoryUsage().rss / 1048576)}MB`,
  );
} finally {
  media.close();
}
