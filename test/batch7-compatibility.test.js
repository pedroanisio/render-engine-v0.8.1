import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { transform, point, multiply } from "../src/render/geometry/matrix.js";
import { checkAnchorMode } from "../src/render/compatibility.js";
import { parseRenderArgs } from "../src/cli.js";
import { renderEpisode } from "../src/render/pipeline.js";
import { processRun } from "../src/render/process.js";

test("x/y place the anchor through nested, rotated, reflected transforms", () => {
  for (const rotation of [0, 30, 90, -70])
    for (const scaleX of [-2, 1, 3]) {
      const a = {
        x: 60,
        y: 40,
        anchorX: 12,
        anchorY: 8,
        rotation,
        scaleX,
        scaleY: 0.5,
        skewX: 20,
      };
      const m = transform(a, 100, 100, 100, 100);
      const p = point(m, 12, 8);
      assert.ok(Math.abs(p.x - 60) < 1e-9 && Math.abs(p.y - 40) < 1e-9);
      const parent = transform(
        { x: 25, y: 20, anchorX: 5, anchorY: 10, rotation: 90 },
        100,
        100,
        100,
        100,
      );
      const nested = point(multiply(parent, m), 12, 8),
        expected = point(parent, 60, 40);
      assert.ok(
        Math.abs(nested.x - expected.x) < 1e-9 &&
          Math.abs(nested.y - expected.y) < 1e-9,
      );
    }
  // without rotation or scale the local origin sits at x − anchorX, y − anchorY
  assert.deepEqual(
    point(
      transform({ x: 60, y: 40, anchorX: 12, anchorY: 8 }, 100, 100, 100, 100),
      0,
      0,
    ),
    { x: 48, y: 32 },
  );
  // % anchors and positions resolve against the parent box (200 × 100)
  const p = point(
    transform(
      { x: "50%", y: "50%", anchorX: "10%", anchorY: "20%" },
      200,
      100,
      200,
      100,
    ),
    20,
    20,
  );
  assert.deepEqual(p, { x: 100, y: 50 });
});

test("the removed pivot anchor mode is rejected; position is a no-op", () => {
  const position = parseRenderArgs(["x.xml", "--anchor-mode", "position"]);
  assert.equal(position.ok, true);
  assert.equal(position.options.anchorMode, undefined);
  assert.equal(parseRenderArgs(["x.xml", "--anchor-mode", "pivot"]).ok, false);
  assert.equal(parseRenderArgs(["x.xml", "--anchor-mode", "guess"]).ok, false);
  assert.throws(() => checkAnchorMode("pivot"), /no longer supported/);
  assert.throws(() => checkAnchorMode("guess"), /no longer supported/);
  checkAnchorMode(undefined);
  checkAnchorMode("position");
});

test("anchors place x/y in decoded pixels, workers and stills; pivot mode is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anchors-")),
    file = join(dir, "scene.xml");
  writeFileSync(
    file,
    `<scene version="1.1"><project width="64" height="48" fps="4" duration="1" background="#000000FF"/><output id="main" path="out.mkv" codec="ffv1" audio="false"><poster path="poster.png" time="0" width="64"/></output><composition><group id="g" x="20" y="10" anchorX="20" anchorY="10"><shape id="red" shape="rect" x="8" y="8" width="8" height="8" fill="#FF0000FF"><animate property="x"><key time="0" value="8"/><key time="1" value="16"/></animate></shape></group></composition></scene>`,
  );
  const bytes = (f) =>
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      f,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);
  await assert.rejects(
    renderEpisode({ sceneFile: file, anchorMode: "pivot" }),
    /no longer supported/,
  );
  const first = await renderEpisode({ sceneFile: file });
  const expected = bytes(first.video);
  assert.ok(first.rendered > 0);
  // the group's anchor (20,10) lands on x/y (20,10): its origin is the frame's
  assert.ok(expected[(10 * 64 + 10) * 3] > 200);
  assert.equal(expected[(10 * 64 + 30) * 3], 0);
  const still = await sharp(first.posters[0]).removeAlpha().raw().toBuffer();
  assert.ok(still[(10 * 64 + 10) * 3] >= 254);
  const parallel = await renderEpisode({
    sceneFile: file,
    anchorMode: "position",
    jobs: 2,
    work: join(dir, "parallel"),
  });
  assert.deepEqual(bytes(parallel.video), expected);
  assert.equal(
    JSON.parse(readFileSync(parallel.video + ".assets.json")).compatibility,
    undefined,
  );
  const warm = await renderEpisode({ sceneFile: file, anchorMode: "position" });
  assert.equal(warm.rendered, 0);
  assert.deepEqual(bytes(warm.video), expected);
});

test("graceful subprocess cancellation lets a worker complete its owned cleanup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "worker-cleanup-")),
    marker = join(dir, "cleaned");
  const controller = new AbortController();
  const script = `const fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[1],'clean');process.exit(0)});console.log('ready');setInterval(()=>{},1000);`;
  await assert.rejects(
    processRun(process.execPath, ["-e", script, marker], {
      signal: controller.signal,
      graceful: true,
      onStdout: () => controller.abort(),
    }),
  );
  assert.equal(readFileSync(marker, "utf8"), "clean");
});

test("multi-output returns each result and rejects colliding paths before any export", async () => {
  const dir = mkdtempSync(join(tmpdir(), "output-set-")),
    file = join(dir, "scene.xml");
  const source = `<scene version="1.1"><project width="32" height="32" fps="2" duration="0.5"/><output id="a" codec="ffv1" path="a.mkv" audio="false"/><output id="b" codec="h264" path="b.mp4" audio="false"/><composition/></scene>`;
  writeFileSync(file, source);
  const result = await renderEpisode({ sceneFile: file, outputId: "*" });
  assert.equal(result.outputs.length, 2);
  assert.deepEqual(
    result.outputs.map((r) => r.video),
    [join(dir, "a.mkv"), join(dir, "b.mp4")],
  );
  for (const output of result.outputs)
    assert.equal(
      JSON.parse(readFileSync(output.video + ".assets.json")).metrics.frames,
      1,
    );
  writeFileSync(file, source.replace("b.mp4", "a.mkv"));
  await assert.rejects(
    renderEpisode({ sceneFile: file, outputId: "*" }),
    /distinct paths/,
  );
});
