import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadScene, compileRuntime } from "../src/index.js";
import { writeEnvelope, audioAutomation } from "../src/render/automation.js";
import { mixAudio } from "../src/render/audio.js";
import { createAudioAnalysis } from "../src/render/audio-analysis.js";
import { instanceTime } from "../src/eval/clock.js";
import { parameterPoint } from "../src/eval/path.js";
import { svgPathProperties } from "svg-path-properties";
const close = (a, b, e = 1e-5) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
test("gain and pan envelopes multiply the actual track and bus samples", () => {
  const dir = mkdtempSync(join(tmpdir(), "scene-auto-"));
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.1:s=48000:d=0.1",
      "-ac",
      "1",
      join(dir, "source.wav"),
    ]);
    const loaded = loadScene(
      '<scene version="1.1"><project width="2" height="2" duration="0.1" fps="30"/><assets><audio id="a" src="source.wav" duration="0.1" channels="1"/></assets><composition/><audioMix><bus id="b"><animate property="volume"><key time="0" value="0.5"/></animate></bus><audioTrack id="t" asset="a" bus="b" start="0"><animate property="volume"><key time="0" value="0"/><key time="0.1" value="1"/></animate><animate property="pan"><key time="0" value="-1"/></animate></audioTrack></audioMix></scene>',
    );
    assert.ok(loaded.ok, JSON.stringify(loaded.diagnostics));
    const rt = compileRuntime(loaded.scene),
      result = mixAudio(
        rt.scene,
        () => ({ path: join(dir, "source.wav") }),
        0.1,
        rt,
      );
    const bytes = Buffer.from(result.pcm.buffer);
    assert.equal(
      audioAutomation(rt, dir)(
        rt.scene.children.find((n) => n.name === "audioMix").children[0],
        0,
        0.1,
      ).endsWith(".wav"),
      true,
    );
    assert.equal(
      audioAutomation(rt, dir)(rt.scene.children[0], 0, 0.1),
      undefined,
    );
    const index = 2400;
    close(bytes.readFloatLE(index * 8), 0.1 * 0.5 * 0.5 * Math.SQRT2, 1e-4);
    close(bytes.readFloatLE(index * 8 + 4), 0);
    assert.ok(bytes.readFloatLE(4000 * 8) > bytes.readFloatLE(1000 * 8));
    const rms = createAudioAnalysis(rt.scene, dir);
    close(rms("t", 0.05, "all"), 0.1, 1e-4);
    assert.equal(rms("t", -1, "all"), 0);
    assert.equal(rms("a", 0, "all"), 0);
    assert.throws(() => rms("missing", 1, "all"), /unknown audio source/);
    assert.throws(() => rms("a", 1, "invalid"), /unknown audio band/);
    for (const band of ["low", "mid", "high"])
      assert.ok(Number.isFinite(rms("a", 0.05, band)));
    const envelope = writeEnvelope(join(dir, "e.wav"), 0.01, (t) => [t, 1]);
    const wav = readFileSync(envelope);
    assert.equal(wav.readUInt16LE(20), 3);
    close(wav.readFloatLE(44 + 240 * 8), 0.005);
    assert.throws(
      () => writeEnvelope(join(dir, "bad.wav"), 1e9, () => [0, 0]),
      /RIFF/,
    );
    assert.throws(
      () => writeEnvelope(join(dir, "bad.wav"), 0.01, () => [NaN, 0]),
      /non-finite/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("source clocks clamp, loop, reverse and reject invalid intervals", () => {
  assert.equal(instanceTime({ start: 2, speed: 2 }, 3, 4), 2);
  assert.equal(instanceTime({ loop: 1 }, 5, 4), 1);
  assert.equal(instanceTime({ loop: 1 }, 9, 4), 4);
  assert.equal(instanceTime({ reverse: true }, 1, 4), 3);
  assert.equal(instanceTime({ speed: -1 }, 1, 4), 3);
  assert.equal(instanceTime({}, -1, 4), 0);
  assert.throws(() => instanceTime({ clipIn: 5 }, 1, 4), /invalid/);
});
test("parameter-space SVG traversal handles lines, cubic, quadratic, elliptical arcs and empty paths", () => {
  for (const [path, expected] of [
    ["M0 0 L10 0", { x: 5, y: 0 }],
    ["M0 0 Q0 10 10 10", { x: 2.5, y: 7.5 }],
    ["M0 0 C0 10 10 10 10 0", { x: 5, y: 7.5 }],
    ["M0 0", { x: 0, y: 0 }],
  ]) {
    const p = parameterPoint(new svgPathProperties(path), 0.5);
    close(p.x, expected.x);
    close(p.y, expected.y);
  }
  for (const path of [
    "M0 0 A10 10 0 0 1 20 0",
    "M0 0 A10 5 30 1 0 40 0",
    "M0 0 A0 10 0 0 1 20 0",
  ]) {
    const p = parameterPoint(new svgPathProperties(path), 1);
    close(p.x, 20 === Number(path.split(" ").at(-2)) ? 20 : 40, 1e-5);
    close(p.y, 0, 1e-5);
  }
});
