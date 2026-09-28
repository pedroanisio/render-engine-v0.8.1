import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScene, compileRuntime, timecode } from "../src/index.js";
import { EVALUATION_BUDGET } from "../src/eval/runtime.js";
import { compileAnimations } from "../src/eval/track.js";
import { clocks } from "../src/eval/clock.js";
import { motionPath, parameterPoint } from "../src/eval/path.js";
import { shutter } from "../src/render/shutter.js";
import { audioAutomation } from "../src/render/automation.js";
import { Surface } from "../src/render/surface.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const close = (a, b, e = 1e-6) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
/** @param {string} body @param {{fps?:string,sections?:string,composition?:string}} [o] */
function load(body, o = {}) {
  const r = loadScene(
    `<scene version="1.1"><project width="32" height="32" duration="10" fps="${o.fps ?? "25"}"/>${o.sections ?? ""}<composition>${o.composition ?? `<shape id="s" shape="rect" width="10" height="10">${body}</shape>`}</composition></scene>`,
  );
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  return r.scene;
}
const runtime = (body, o) => compileRuntime(load(body, o));
const get = (r, prop, t = 0, id = "s") => r.value(r.ids.get(id), prop, t);

test("nested prop() fan-out is memoized per evaluation", () => {
  // Each level reads the previous one four times: 4^12 evaluations without memoization.
  let shapes = `<shape id="n0" shape="rect" width="1" height="1" x="1"/>`;
  for (let i = 1; i <= 12; i++)
    shapes += `<shape id="n${i}" shape="rect" width="1" height="1"><expression property="x">(prop("n${i - 1}.x")+prop("n${i - 1}.x")+prop("n${i - 1}.x")+prop("n${i - 1}.x"))/4</expression></shape>`;
  const r = compileRuntime(load("", { composition: shapes }));
  const started = performance.now();
  assert.equal(get(r, "x", 1, "n12"), 1);
  assert.ok(performance.now() - started < 2000);
  // The memo does not leak across top-level calls with different inputs.
  assert.equal(get(r, "x", 2, "n12"), 1);
});

test("deep smoothed link chains fail with a clear budget error", () => {
  let shapes = `<shape id="l0" shape="rect" width="1" height="1"><expression property="x">time</expression></shape>`;
  for (let i = 1; i <= 5; i++)
    shapes += `<shape id="l${i}" shape="rect" width="1" height="1"><link property="x" source="l${i - 1}.x" smoothing="${0.1 * i + 0.013 * i * i}"/></shape>`;
  const r = compileRuntime(load("", { composition: shapes }));
  assert.ok(Number.isFinite(Number(get(r, "x", 5, "l2"))));
  assert.throws(() => get(r, "x", 5, "l5"), /evaluation budget exceeded/);
  assert.equal(EVALUATION_BUDGET, 100000);
  // A failed evaluation resets the budget for the next call.
  assert.ok(Number.isFinite(Number(get(r, "x", 5, "l1"))));
});

test("frame is snapped to the integer frame grid and random() is keyed by frame index", () => {
  const r = runtime(
    '<expression property="x">frame</expression><expression property="y">random()</expression>',
  );
  assert.equal(get(r, "x", 29 / 25), 29);
  assert.equal(get(r, "y", 29 / 25), get(r, "y", 29.4 / 25));
  assert.notEqual(get(r, "y", 29 / 25), get(r, "y", 28 / 25));
});

test("random() streams differ per node and property unless a seed is explicit", () => {
  const two = `<shape id="a" shape="rect" width="1" height="1"><expression property="x">random()</expression><expression property="y">random()</expression></shape><shape id="b" shape="rect" width="1" height="1"><expression property="x">random()</expression><expression property="y" seed="7">random()</expression><expression property="rotation" seed="7">random()</expression></shape>`;
  const r = compileRuntime(load("", { composition: two }));
  const ax = get(r, "x", 1, "a"),
    ay = get(r, "y", 1, "a"),
    bx = get(r, "x", 1, "b");
  assert.notEqual(ax, ay);
  assert.notEqual(ax, bx);
  assert.equal(get(r, "y", 1, "b"), get(r, "rotation", 1, "b"));
  // Deterministic across compilations.
  assert.equal(get(compileRuntime(load("", { composition: two })), "x", 1, "a"), ax);
});

test("driven list-typed properties survive revalidation", () => {
  const r = runtime(
    '<animate property="dash"><key time="0" value="4 4"/><key time="10" value="8 8"/></animate><motionPath path="M0 0 L10 0"/>',
  );
  assert.deepEqual(get(r, "dash", 5), [6, 6]);
  const e = runtime('<expression property="dash">[1, 2.5]</expression>');
  assert.deepEqual(get(e, "dash", 5), [1, 2.5]);
});

test("sequence children without end fill the remaining parent duration", () => {
  const scene = load("", {
    composition:
      '<sequence id="q" start="2" end="10" timeGap="1"><shape id="a" shape="rect" width="1" height="1" end="3"/><shape id="b" shape="rect" width="1" height="1" start="1"/></sequence>',
  });
  const spans = clocks(scene).spans;
  const b = [...spans].find(([n]) => n.attributes.id === "b")?.[1];
  assert.equal(b?.start, 2 + 3 + 1 + 1);
  assert.equal(b?.end, 10);
  assert.throws(
    () =>
      clocks(
        load("", {
          composition:
            '<sequence id="q" start="0" end="4"><shape id="a" shape="rect" width="1" height="1" end="4"/><shape id="b" shape="rect" width="1" height="1"/></sequence>',
        }),
      ),
    /positive duration/,
  );
});

test("non-finite key times, marker times, beat offsets and timeOffset are rejected", () => {
  const keys = compileAnimations(
    load('<animate property="x"><key time="NaN" value="0"/><key time="1" value="1"/></animate>'),
  );
  assert.match(keys.diagnostics.map((d) => d.message).join(), /key time must be finite/);
  assert.throws(
    () => clocks(load("", { sections: '<markers><marker id="m" time="INF"/></markers>' })),
    /marker m time must be finite/,
  );
  assert.throws(
    () => clocks(load("", { sections: '<markers><beatGrid bpm="60" offset="NaN"/></markers>' })),
    /offset must be finite/,
  );
  assert.throws(
    () =>
      clocks(
        load("", {
          composition: '<group id="g" timeOffset="-INF"><shape id="s" shape="rect" width="1" height="1"/></group>',
        }),
      ),
    /timeOffset must be finite/,
  );
});

test("vector and unit-length tracks honour easing, hold, steps and linear extrapolation holds", () => {
  const t = (extra, k0 = "", prop = "x", a = "10%", b = "50%") =>
    compileAnimations(
      load(
        `<animate property="${prop}" ${extra}><key time="0" value="${a}" ${k0}/><key time="4" value="${b}"/></animate>`,
      ),
    ).tracks.get("s")?.[0];
  assert.equal(t("", 'interpolation="hold"')?.valueAt(3), "10%");
  assert.equal(t("", 'interpolation="linear"')?.valueAt(2), "30%");
  assert.equal(t('defaultInterpolation="quad-in"')?.valueAt(2), "20%");
  assert.equal(t("", 'interpolation="steps" steps="2"')?.valueAt(3), "30%");
  assert.deepEqual(
    t('defaultInterpolation="step"', "", "dash", "0 0", "4 8")?.valueAt(3),
    [0, 0],
  );
  assert.deepEqual(t("", 'easeOut="0.5,0"', "dash", "0 0", "4 8")?.valueAt(4), [4, 8]);
  // Discrete strings still switch exactly at the next key.
  assert.equal(
    t('defaultInterpolation="linear"', "", "shape", "rect", "ellipse")?.valueAt(3.9),
    "rect",
  );
  // Linear extrapolation is numeric only; other values hold rather than loop.
  const lin = t('extrapolateBefore="linear" extrapolateAfter="linear"');
  assert.equal(lin?.valueAt(7), "50%");
  assert.equal(lin?.valueAt(-3), "10%");
});

test("timecode counts nominal-rate frames and supports drop-frame", () => {
  const ntsc = 30000 / 1001;
  assert.equal(timecode("00:00:01:00", 25), 1);
  close(timecode("00:00:01:00", ntsc), 1.001, 1e-12);
  close(timecode("00:00:00:29", ntsc), 29 / ntsc, 1e-12);
  assert.throws(() => timecode("00:00:00:30", ntsc), /non-drop-frame/);
  // Drop-frame: 00:01:00;02 is frame 1800; ten-minute boundaries keep ;00.
  close(timecode("00:01:00;02", ntsc), 1800 / ntsc, 1e-12);
  close(timecode("00:10:00;00", ntsc), 17982 / ntsc, 1e-12);
  close(timecode("01:00:00;00", ntsc), 107892 / ntsc, 1e-9);
  close(timecode("00:01:00;04", 60000 / 1001), 3600 / (60000 / 1001), 1e-12);
  assert.throws(() => timecode("00:01:00;01", ntsc), /dropped/);
  assert.throws(() => timecode("00:01:00;01", 30), /requires 30000\/1001/);
  assert.throws(() => timecode("00:00:00;40", ntsc), /invalid drop-frame/);
  assert.throws(() => timecode("bad", 25), /invalid non-drop-frame/);
});

test("motion paths parse compact arc flags; smooth and relative segments are normalized", () => {
  const compact = motionPath("M0 0 a5 5 0 0110 10");
  close(compact.getTotalLength(), motionPath("M0 0 a5 5 0 0 1 10 10").getTotalLength());
  assert.deepEqual(motionPath("M0 0 A0 5 0 0 1 10 0").getParts()[0]?.details, ["L", 10, 0]);
  const smooth = motionPath("m0 0 c10 0 10 10 20 10 s10 10 20 10 q10 10 20 0 t20 0");
  assert.deepEqual(
    smooth.getParts().map((p) => p.details[0]),
    ["C", "C", "Q", "Q"],
  );
  const end = parameterPoint(smooth, 0.5);
  close(end.x, 40);
  close(end.y, 20);
  for (const [bad, message] of [
    ["M0 0 a5 5 0 2 0 10 0", /arguments/],
    ["M0 0 L1 2 #", /text/],
    ["M0 0 L", /arguments/],
    ["5 5", /command/],
    ["#", /text/],
    ["M0 0 Z 5 5", /command/],
    ["", /empty/],
  ])
    assert.throws(() => motionPath(bad), message);
});

test("single-sample shutter samples the window centre", () => {
  /** @param {number} t */
  const sample = (t) => {
    const s = new Surface(1, 1);
    s.data[0] = t;
    return s;
  };
  close(shutter(1, 10, { motionBlurSamples: 1 }, sample).data[0], 1);
  close(
    shutter(1, 10, { motionBlurSamples: 1, shutterPhase: 0, shutterAngle: 360 }, sample)
      .data[0],
    1.05,
  );
  close(
    shutter(1, 10, { motionBlurSamples: 2, shutterPhase: 0, shutterAngle: 360, adaptiveMotionBlur: false }, sample)
      .data[0],
    1.05,
  );
});

test("audio automation clamps pan and follows animated mute", () => {
  const scene = loadScene(
    `<scene version="1.1"><project width="8" height="8" duration="1" fps="25"/><assets><audio id="a" src="a.wav" duration="1" channels="1"/></assets><composition/><audioMix><audioTrack id="t" asset="a" start="0" pan="4"><animate property="mute"><key time="0" value="false"/><key time="0.5" value="true"/></animate></audioTrack></audioMix></scene>`,
  );
  assert.ok(scene.ok, JSON.stringify(!scene.ok && scene.diagnostics));
  const r = compileRuntime(scene.scene);
  const dir = mkdtempSync(join(tmpdir(), "review-eval-"));
  try {
    const file = audioAutomation(r, dir)(r.ids.get("t"), 0, 1);
    assert.ok(file);
    const data = readFileSync(String(file)).subarray(44);
    // Hard right at unity: left 0, right sqrt2*sin(pi/2) = sqrt2.
    close(data.readFloatLE(0), 0);
    close(data.readFloatLE(4), Math.SQRT2);
    close(data.readFloatLE(30000 * 8 + 4), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
