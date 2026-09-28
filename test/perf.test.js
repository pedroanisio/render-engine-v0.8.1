import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRenderer } from "../src/render/setup.js";
import { renderEpisode } from "../src/render/pipeline.js";
import { contrastFrame } from "../src/render/accessibility.js";
import { gpuDevice, gpuFrame } from "../src/render/gpu.js";
import { gpuEncoder, videoArguments } from "../src/render/export.js";
import { spatial } from "../src/render/fx/spatial.js";
import { colors, clamp } from "../src/render/fx/pixels.js";
import { Surface } from "../src/render/surface.js";
import { encodePng } from "../src/render/image.js";

const DIR = mkdtempSync(join(tmpdir(), "scene-perf-test-"));

/** A stop-motion scene: boiling cards with shadows and text under a finishing
 * adjustment of point operations, with a contrast check. */
function scene(duration = 3, extra = "") {
  mkdirSync(join(DIR, "a"), { recursive: true });
  const card = new Surface(40, 24);
  card.fillRect(0, 0, 40, 24, [0.8, 0.75, 0.6, 1], card.bounds());
  writeFileSync(join(DIR, "a/card.png"), encodePng(card));
  copyFileSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    join(DIR, "a/font.ttf"),
  );
  writeFileSync(
    join(DIR, "scene.xml"),
    `<scene version="1.1">
  <project width="192" height="108" fps="12" duration="${duration}" seed="7" background="#D9D8D4FF"/>
  <metadata><accessibility description="cards" flashCheck="off" contrastCheck="warn" minContrast="4.5"/></metadata>
  <colorManagement workingSpace="linear-srgb" display="srgb" view="standard" toneMapping="none" bitDepth="16f"/>
  <assets>
    <font id="f" src="a/font.ttf" family="DejaVu Sans"/>
    <image id="card" src="a/card.png" width="40" height="24"/>
    <text id="t" text="Paper" width="60" height="16" size="11" fontAsset="f" color="#1E1E1CFF"/>
  </assets>
  <effects>
    <effect id="shadow" type="drop-shadow" color="#1E1E1C59" radius="4" offsetX="2" offsetY="3"/>
    <effect id="lgg" type="lift-gamma-gain" lift="0,0,0.005" gamma="1,1.1,1" gain="1,1,1.01"/>
    <effect id="grade" type="color-grade" saturation="0.95" contrast="1.04"/>
    <effect id="flicker" type="exposure" exposure="0"><expression property="exposure" seed="7">random(-0.02, 0.02)</expression></effect>
    <effect id="grain" type="film-grain" intensity="0.08" size="1.1" seed="5"/>
    <effect id="vignette" type="vignette" intensity="0.2" radius="110" softness="0.7"/>
  </effects>
  <composition>
    <group id="table" effects="shadow">
      <group id="c1" x="30" y="20" effects="shadow">
        <animate property="rotation" additive="true" extrapolateAfter="loop" timeBase="local"><key time="0" value="1" interpolation="hold"/><key time="0.1667" value="-1" interpolation="hold"/><key time="0.3333" value="1"/></animate>
        <layer id="c1-card" asset="card"/>
        <layer id="c1-txt" asset="t" x="4" y="4"/>
      </group>
      <group id="c2" x="110" y="50" effects="shadow">
        <animate property="x"><key time="0" value="110" interpolation="hold"/><key time="1" value="120"/></animate>
        <layer id="c2-card" asset="card"/>
      </group>
    </group>
    ${extra}
    <adjustment id="finish" z="100" effects="lgg grade flicker grain vignette"/>
  </composition>
  <outputs><output id="main" path="out.mp4" codec="h264" container="mp4" crf="18" preset="fast" pixelFormat="yuv420p" colorSpace="rec709" transfer="bt1886" audio="false"/></outputs>
</scene>`,
  );
  return join(DIR, "scene.xml");
}

/** @param {string} file @param {boolean} cache */
async function digests(file, cache, frames = 36) {
  process.env.SCENE_RENDER_LAYER_CACHE = cache ? "1" : "0";
  const { renderer, media, fps } = await createRenderer({ sceneFile: file });
  delete process.env.SCENE_RENDER_LAYER_CACHE;
  try {
    const out = [];
    for (let f = 0; f < frames; f++) {
      const m = contrastFrame(renderer, f / fps);
      out.push(
        createHash("sha256")
          .update(renderer.color.encode16(m.picture, false))
          .update(JSON.stringify(m.contrast))
          .digest("hex"),
      );
    }
    return { out, cached: renderer.layerCache?.size ?? 0 };
  } finally {
    media.close();
  }
}

test("layer cache reproduces uncached frames and contrast masks exactly", async () => {
  const file = scene();
  const on = await digests(file, true),
    off = await digests(file, false);
  assert.deepEqual(on.out, off.out);
  assert.ok(on.cached > 0, "cache holds layers");
  assert.equal(off.cached, 0);
});

test("clock-driven children keep a subtree out of the layer cache", async () => {
  const file = scene(
    1,
    `<layer id="anim" asset="t" x="10" y="80"><textAnimator preset="fade-in" presetDuration="0.5" stagger="0"/></layer>`,
  );
  const on = await digests(file, true, 12),
    off = await digests(file, false, 12);
  assert.deepEqual(on.out, off.out);
});

test("vignette fast path equals the per-pixel colour callback", () => {
  const s = new Surface(37, 23);
  for (let i = 0; i < s.data.length; i += 4) {
    const a = (i / 4) % 5 === 0 ? 0 : (i / 4) % 3 === 0 ? 0.5 : 1;
    s.data.set([0.3 * a, 0.6 * a, 0.9 * a, a], i);
  }
  const p = {
      type: "vignette",
      intensity: 0.4,
      threshold: 0.5,
      softness: 0.3,
      colorValue: [0.1, 0.2, 0.3, 1],
    },
    fast = spatial(s, p, { scale: 1, time: 0, frame: 0 });
  const cx = s.width / 2 - 0.5,
    cy = s.height / 2 - 0.5,
    slow = colors(s, (c, _a, x, y) => {
      const d = Math.hypot((x - cx) / (s.width / 2), (y - cy) / (s.height / 2)),
        v = clamp((d - 0.5) / 0.3) * 0.4;
      return c.map((q, k) => q * (1 - v) + Number(p.colorValue[k]) * v);
    });
  assert.deepEqual(fast.data, slow.data);
});

test("GPU tail matches the CPU finish within float32 rounding", async (t) => {
  const gpu = await gpuDevice();
  if (!gpu) return t.skip("no WebGPU device");
  const file = scene();
  const cpu = await createRenderer({ sceneFile: file }),
    dev = await createRenderer({ sceneFile: file });
  try {
    let worst = 0,
      ratio = 0;
    for (let f = 0; f < 24; f++) {
      const m = contrastFrame(cpu.renderer, f / cpu.fps),
        a = cpu.renderer.color.encode16(m.picture, false),
        g = await gpuFrame(dev.renderer, gpu, f / cpu.fps, false, true);
      assert.ok(g, "frame is GPU-eligible");
      assert.equal(
        dev.renderer.renderDeferred(f / cpu.fps, false)?.tail.length,
        5,
      );
      const u = new Uint16Array(a.buffer, a.byteOffset, a.length / 2),
        v = new Uint16Array(
          g.bytes.buffer,
          g.bytes.byteOffset,
          g.bytes.length / 2,
        );
      for (let i = 0; i < u.length; i++)
        worst = Math.max(worst, Math.abs(Number(u[i]) - Number(v[i])));
      const expected = new Map(m.contrast);
      assert.deepEqual(
        (g.contrast ?? []).map(([id]) => id),
        m.contrast.map(([id]) => id),
      );
      for (const [id, r] of g.contrast ?? [])
        ratio = Math.max(ratio, Math.abs(r / Number(expected.get(id)) - 1));
    }
    assert.ok(worst <= 64, `16-bit difference ${worst}`);
    assert.ok(ratio < 1e-3, `contrast ratio difference ${ratio}`);
  } finally {
    cpu.media.close();
    dev.media.close();
  }
});

test("GPU encoder maps CRF and presets, and yields to the CPU where NVENC cannot encode", () => {
  const nvenc = { encoder: "h264_nvenc", pixel: "yuv420p", identity: "test" },
    args = videoArguments(
      { codec: "h264", container: "mp4", crf: 18, preset: "slow" },
      24,
      2,
      1920,
      1080,
      nvenc,
    );
  const after = (/** @type {string} */ flag) => args[args.indexOf(flag) + 1];
  assert.equal(after("-c:v"), "h264_nvenc");
  assert.equal(after("-rc"), "constqp");
  assert.equal(after("-qp"), "21");
  assert.equal(after("-preset"), "p7");
  assert.equal(after("-bf"), "3");
  assert.ok(!args.includes("-threads") && !args.includes("-crf"));
  const rate = videoArguments(
    { codec: "h264", container: "mp4", bitrate: 5000000, bFrames: 0 },
    24,
    2,
    1920,
    1080,
    nvenc,
  );
  assert.equal(rate[rate.indexOf("-rc") + 1], "vbr");
  assert.ok(!rate.includes("-b_ref_mode"));
  assert.equal(
    gpuEncoder({ codec: "h264", container: "mp4" }, "cpu"),
    undefined,
  );
  assert.equal(
    gpuEncoder({ codec: "h264", container: "mp4", twoPass: true }, "auto"),
    undefined,
  );
  assert.equal(
    gpuEncoder({ codec: "h264", container: "mp4" }, "auto", 64, 48),
    undefined,
  );
  assert.throws(
    () => gpuEncoder({ codec: "prores", container: "mov" }, "gpu"),
    /No GPU encoder/,
  );
});

test("direct segments split long shots, run in parallel, cache chunks and contrast", async () => {
  const file = scene(12);
  const work = join(DIR, "work");
  rmSync(work, { recursive: true, force: true });
  const report = () =>
    JSON.parse(readFileSync(join(DIR, "out.mp4.accessibility.json"), "utf8"));
  const first = await renderEpisode({
    sceneFile: file,
    work,
    threads: 2,
    log: () => {},
  });
  const chunks = readdirSync(join(work, "segments")).filter((f) =>
    f.endsWith(".mkv"),
  );
  // 12 s at 12 fps split into segments of at most 10 s.
  assert.equal(chunks.length, 2);
  assert.equal(first.rendered, 2);
  assert.equal(
    readdirSync(join(work, "segments")).filter((f) =>
      f.endsWith(".contrast.json"),
    ).length,
    2,
  );
  const frames = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v",
      "-show_entries",
      "stream=nb_read_frames,codec_name",
      "-of",
      "csv=p=0",
      first.video,
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(frames, "h264,144");
  const findings = report().findings;
  const warm = await renderEpisode({
    sceneFile: file,
    work,
    threads: 2,
    log: () => {},
  });
  assert.equal(warm.rendered, 0);
  assert.equal(warm.cached, 2);
  assert.deepEqual(report().findings, findings);
  // Without cached measurements the report measures the frames itself.
  for (const f of readdirSync(join(work, "segments")))
    if (f.endsWith(".contrast.json")) rmSync(join(work, "segments", f));
  await renderEpisode({ sceneFile: file, work, threads: 1, log: () => {} });
  assert.deepEqual(report().findings, findings);
});

test("--gpu off keeps CPU frames and encoding under separate cache keys", async () => {
  const file = scene(2);
  const work = join(DIR, "work-off");
  rmSync(work, { recursive: true, force: true });
  await renderEpisode({
    sceneFile: file,
    work,
    gpu: "off",
    threads: 1,
    log: () => {},
  });
  const off = readdirSync(join(work, "segments")).filter((f) =>
    f.endsWith(".mkv"),
  );
  await renderEpisode({
    sceneFile: file,
    work,
    gpu: "auto",
    threads: 1,
    log: () => {},
  });
  const all = readdirSync(join(work, "segments")).filter((f) =>
    f.endsWith(".mkv"),
  );
  const gpu =
    (await gpuDevice()) ??
    gpuEncoder({ codec: "h264", container: "mp4" }, "auto", 192, 108);
  assert.equal(all.length, gpu ? off.length * 2 : off.length);
});
