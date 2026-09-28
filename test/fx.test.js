import { test } from "node:test";
import assert from "node:assert/strict";
import { Surface } from "../src/render/surface.js";
import { processEffect, effectTypes } from "../src/render/fx/processor.js";
import { grade, tone } from "../src/render/fx/grade.js";
import { spatial, noise } from "../src/render/fx/spatial.js";
import {
  clamp,
  copy,
  sample,
  warp,
  gaussian,
  integrate,
  colors,
  morphology,
  mix,
} from "../src/render/fx/pixels.js";
import { native, resources } from "../src/render/fx/native.js";
import {
  transitionFrame,
  transitionWindows,
  transitionGain,
  handles,
  transitionTypes,
} from "../src/render/transitions.js";
import { shutter } from "../src/render/shutter.js";
import { MODEL } from "../src/generated/model.js";
import {
  prepareScene,
  loadScene,
  compileRuntime,
  capabilities,
} from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
const close = (a, b, e = 1e-5) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const flat = (w, h, c) => {
  const s = new Surface(w, h);
  for (let i = 0; i < s.data.length; i += 4) s.data.set(c, i);
  return s;
};
const fixture = () => {
  const s = new Surface(12, 10);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 12; x++) {
      const a = x > 0 && x < 11 && y > 0 && y < 9 ? 0.75 : 0;
      s.data.set(
        [(x / 12) * a, (y / 10) * a, (((x + y) % 3) / 3) * a, a],
        (y * 12 + x) * 4,
      );
    }
  return s;
};
const cube = "LUT_1D_SIZE 2\n0 0 0\n0.5 0.5 0.5\n";
const shader =
  "uniform float gain; vec4 effect(vec2 p){vec4 c=getFromColor(p);return vec4(c.rgb*gain,c.a);}";
const context = (s) => ({
  scale: 1,
  time: 0.5,
  frame: 12,
  fps: 24,
  source: s,
  sample: (t) => flat(s.width, s.height, [t, t, t, 1]),
  paint: (x, y) => [x / s.width, y / s.height, 0.5, 1],
  lights: [{ type: "ambient", intensity: 0.5 }],
  read: (p) => Buffer.from(p.endsWith(".cube") ? cube : shader),
  params: { gain: 0.5 },
});
const parameters = {
  radius: 3,
  size: 3,
  amount: 0.3,
  angle: 45,
  samples: 4,
  frequency: 4,
  color: "#884422",
  threshold: 0.2,
  offsetX: 2,
  offsetY: 1,
  keyColor: "#448833",
  exposure: 1,
  hue: 35,
  contrast: 1.3,
  saturation: 0.6,
  brightness: 0.1,
  lift: ".1,.2,.3",
  gamma: "1.1,1.2,1.3",
  gain: "1.3,1.2,1.1",
  slope: "1.2,1.1,1",
  offset: ".1,0,.05",
  power: "1.1,1.2,1.3",
  curve: "0,0 0.5,0.3 1,1",
};
for (const type of effectTypes)
  test(`effect ${type}: finite, premultiplied mix endpoints, immutable input, deterministic seek`, () => {
    const s = fixture(),
      original = new Float32Array(s.data),
      ctx = context(s),
      p = {
        ...parameters,
        type,
        src: type === "lut" ? "grade.cube" : "effect.glsl",
      };
    const full = processEffect(s, p, ctx),
      half = processEffect(s, { ...p, mix: 0.5 }, ctx),
      off = processEffect(s, { ...p, enabled: false }, ctx);
    assert.deepEqual(s.data, original);
    assert.deepEqual(off.data, s.data);
    for (let i = 0; i < s.data.length; i++) {
      assert.ok(Number.isFinite(full.data[i]));
      close(half.data[i], (s.data[i] + full.data[i]) / 2);
      if (i % 4 === 3) assert.ok(full.data[i] >= 0 && full.data[i] <= 1);
    }
    assert.deepEqual(processEffect(s, { ...p, mix: 0 }, ctx).data, s.data);
    processEffect(s, p, { ...ctx, time: 7, frame: 168 });
    assert.deepEqual(processEffect(s, p, ctx).data, full.data);
  });
test("catalog exactly covers the schema effect enumeration", () =>
  assert.deepEqual(
    [...effectTypes].sort(),
    [...MODEL.simpleTypes["effectType@type"].facets.enumeration].sort(),
  ));
test("Gaussian impulse has conserved energy, symmetry and independent colour channels", () => {
  const s = flat(17, 17, [0, 0, 0, 0]);
  s.data.set([0.5, 0.25, 0, 0.5], (8 * 17 + 8) * 4);
  const b = gaussian(s, 3);
  close(
    b.data.filter((_, i) => i % 4 === 0).reduce((a, b) => a + b),
    0.5,
  );
  close(b.data[(8 * 17 + 7) * 4], b.data[(7 * 17 + 8) * 4]);
  for (let i = 0; i < b.data.length; i += 4) {
    close(b.data[i + 1], b.data[i] / 2);
    close(b.data[i + 3], b.data[i]);
  }
  assert.deepEqual(gaussian(s, 0).data, s.data);
});
test("pixel operators and straight-alpha grading match analytical references", () => {
  const s = flat(3, 3, [0.1, 0.2, 0.3, 0.5]);
  assert.deepEqual(
    Array.from(grade(s, { type: "exposure", exposure: 1 }).data.slice(0, 4)),
    [Math.fround(0.2), Math.fround(0.4), Math.fround(0.6), 0.5],
  );
  close(grade(s, { type: "invert" }).data[0], 0.4);
  close(
    grade(s, {
      type: "cdl",
      slope: "2,2,2",
      offset: ".1,.1,.1",
      power: "2,2,2",
    }).data[0],
    0.125,
  );
  const transparent = flat(1, 1, [0, 0, 0, 0]);
  assert.deepEqual(
    grade(transparent, { type: "invert" }).data,
    transparent.data,
  );
  close(sample(s, -0.5, 0, 0), 0.05);
  close(sample(s, -3, 0, 0, true), 0.1);
  close(sample(s, 100, 100, 0), 0);
  assert.deepEqual(warp(s, (x, y) => [x, y]).data, s.data);
  assert.deepEqual(integrate(s, 1, (x, y) => [x, y]).data, s.data);
  assert.deepEqual(mix(s, s, 0.5).data, s.data);
  close(colors(s, (c, a) => [...c, a / 2]).data[0], 0.05);
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(2), 1);
  close(tone(1, "reinhard"), 0.5);
  for (const t of ["aces", "hable", "filmic"])
    assert.ok(tone(2, t) > tone(0.2, t));
  assert.throws(() => tone(1, "other"), /Unsupported/);
});
test("grading channels, scalar and triple validation, range preservation", () => {
  const s = flat(1, 1, [0.2, 0.4, 0.8, 1]);
  for (const channel of ["rgb", "red", "green", "blue", "luma", "alpha"]) {
    const o = grade(s, { type: "curves", channel, curve: "0,0 1,0.5" });
    if (channel === "alpha") close(o.data[3], 0.5);
    else if (channel === "red") close(o.data[1], 0.4);
  }
  close(grade(s, { type: "curves", curve: "0.3,0.1 0.7,0.9" }).data[0], 0.1);
  close(grade(s, { type: "curves", curve: "0.3,0.1 0.7,0.9" }).data[2], 0.9);
  for (const p of [
    { type: "curves", curve: "x" },
    { type: "curves", curve: "0,0 0,1" },
    { type: "levels", inputWhite: 0 },
    { type: "cdl", slope: "1,2" },
    { type: "cdl", power: "0,1,1" },
    { type: "unknown" },
  ])
    assert.throws(() => grade(s, p));
  close(
    grade(s, {
      type: "levels",
      inputBlack: 0,
      inputWhite: 1,
      outputBlack: 0.1,
      outputWhite: 0.9,
    }).data[0],
    0.26,
  );
  const y = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  close(
    y(grade(s, { type: "white-balance", temperature: 50, tint: 20 }).data),
    y(s.data),
  );
});
test("morphology, keys, silhouette shadows and separate blur kernels", () => {
  const s = flat(9, 9, [0, 0, 0, 0]);
  s.data.set([0.5, 0, 0, 0.5], (4 * 9 + 4) * 4);
  const ctx = context(s);
  assert.equal(
    morphology(s, 1).data.filter((v, i) => i % 4 === 3 && v > 0).length,
    5,
  );
  assert.equal(morphology(s, -1).data[(4 * 9 + 4) * 4 + 3], 0);
  const green = flat(2, 2, [0, 0.5, 0, 0.5]);
  assert.equal(
    spatial(green, { type: "chroma-key", keyColor: "#00FF00" }, context(green))
      .data[3],
    0,
  );
  const same = spatial(
    green,
    { type: "difference-key" },
    { ...context(green), source: green },
  );
  assert.equal(same.data[3], 0);
  for (const type of ["stroke", "outline"])
    for (const position of ["inside", "center", "outside"])
      assert.ok(
        spatial(s, { type, radius: 2, position }, ctx).data.every(
          Number.isFinite,
        ),
      );
  for (const type of ["drop-shadow", "inner-shadow", "inner-glow"])
    for (const compositeOriginal of ["none", "on-top", "behind"])
      assert.ok(
        spatial(
          s,
          { type, radius: 2, offsetX: 1, offsetY: 0, compositeOriginal },
          ctx,
        ).data.every(Number.isFinite),
      );
  const directional = spatial(
    s,
    { type: "directional-blur", radius: 3, samples: 9, angle: 0 },
    ctx,
  );
  assert.equal(directional.data[(3 * 9 + 4) * 4 + 3], 0);
  const lens = spatial(s, { type: "lens-blur", radius: 3, samples: 32 }, ctx);
  assert.ok(lens.data[(3 * 9 + 4) * 4 + 3] > 0);
  assert.notDeepEqual(
    spatial(s, { type: "rgb-split", offsetX: 2, offsetY: 0 }, ctx).data,
    spatial(s, { type: "chromatic-aberration", amount: 20 }, ctx).data,
  );
  assert.throws(
    () =>
      spatial(s, { type: "displacement-map" }, { ...ctx, source: undefined }),
    /source/,
  );
  assert.throws(
    () => spatial(s, { type: "difference-key" }, { ...ctx, source: undefined }),
    /source/,
  );
  assert.throws(() => spatial(s, { type: "other" }, ctx), /Unsupported/);
  close(noise(1, 1, 4), noise(1, 1, 4));
  assert.notEqual(noise(1.2, 1.3, 4), noise(1.2, 1.3, 5));
});
function renderer(body, sections = "", project = "") {
  const xml = `<scene version="1.1"><project width="16" height="8" duration="4" fps="8" background="#00000000" ${project}/><composition>${body}</composition>${sections}</scene>`;
  const p = prepareScene(xml);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => new Uint8Array() },
    1,
    p.runtime,
  );
}
const shape = (id, attrs = "", children = "") =>
  `<shape id="${id}" shape="rect" width="16" height="8" ${attrs}>${children}</shape>`;
test("effect ordering, animated mix/enabled, adjustment, group and legacy API", () => {
  const sections =
    '<effects><effect id="a" type="exposure" exposure="1"/><effect id="b" type="invert"/><effect id="c" type="glow"><animate property="mix"><key time="0" value="0"/><key time="1" value="1"/></animate></effect></effects>';
  const a = renderer(shape("s", 'fill="#808080" effects="a b"'), sections),
    b = renderer(shape("s", 'fill="#808080" effects="b a"'), sections);
  assert.notDeepEqual(a.render(0).data, b.render(0).data);
  const g = renderer(
      `<group id="g" effects="a">${shape("s", 'fill="#404040"')}</group>`,
      sections,
    ),
    adj = renderer(
      shape("s", 'fill="#404040"') + '<adjustment id="adjust" effects="a"/>',
      sections,
    );
  assert.deepEqual(g.render(0).data, adj.render(0).data);
  const glow = renderer(shape("s", 'fill="#404040" effects="c"'), sections);
  assert.notDeepEqual(glow.render(0).data, glow.render(1).data);
});
test("echo and posterize-time sample prior states before the effect; seeks do not accumulate history", () => {
  const fx =
    '<effects><effect id="e" type="echo" samples="2" frequency="2" amount="1"/><effect id="p" type="posterize-time" frequency="2"/></effects>';
  const move =
    '<animate property="x"><key time="0" value="0"/><key time="2" value="8"/></animate>';
  const r = renderer(
    '<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF" effects="e">' +
      move +
      "</shape>",
    fx,
  );
  const reference = new Float32Array(r.render(1).data);
  r.render(0);
  r.render(2);
  assert.deepEqual(r.render(1).data, reference);
  close(reference[(0 * 16 + 2) * 4 + 3], 0.5);
  close(reference[(0 * 16 + 4) * 4 + 3], 0.5);
  const p = renderer(
    '<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF" effects="p">' +
      move +
      "</shape>",
    fx,
  );
  assert.deepEqual(p.render(0.6).data, p.render(0.9).data);
});
for (const type of transitionTypes)
  test(`transition ${type}: exact endpoints, finite midpoint and deterministic samples`, () => {
    const from = fixture(),
      to = flat(12, 10, [0, 0.5, 0.5, 1]),
      read = () =>
        Buffer.from(
          "vec4 transition(vec2 p){return mix(getFromColor(p),getToColor(p),progress);}",
        );
    const a = {
        type,
        direction: "angle",
        angle: 30,
        softness: 0.2,
        color: "#FF8844",
        shader: "test.glsl",
      },
      ctx = { matte: from, read };
    assert.deepEqual(transitionFrame(from, to, a, 0, ctx).data, from.data);
    assert.deepEqual(transitionFrame(from, to, a, 1, ctx).data, to.data);
    const mid = transitionFrame(from, to, a, 0.5, ctx);
    assert.ok(mid.data.every(Number.isFinite));
    assert.deepEqual(mid.data, transitionFrame(from, to, a, 0.5, ctx).data);
  });
test("transition handles keep both adjacent shots live; masks and nested clocks still apply", () => {
  const body =
    shape("a", 'start="0" end="2" fill="#FF0000"') +
    shape("b", 'start="2" end="4" fill="#0000FF"') +
    '<transition from="a" to="b" type="crossfade" duration="1" curve="linear"/>';
  const r = renderer(body);
  const s = r.render(2);
  close(s.data[0], 0.5);
  close(s.data[2], 0.5);
  close(s.data[3], 1);
  close(r.render(1.5).data[0], 1);
  close(r.render(2.5).data[2], 1);
  for (const alignment of ["start", "end"]) {
    const q = renderer(
      body.replace('curve="linear"', `curve="linear" alignment="${alignment}"`),
    );
    close(q.render(alignment === "start" ? 2.5 : 1.5).data[0], 0.5);
  }
  const q = renderer(`<group id="g" timeScale="2">${body}</group>`);
  close(q.render(1).data[0], 0.5);
  const single = renderer(
    shape("a", 'start="1" end="3" fill="#FFFFFF"') +
      '<transition to="a" type="crossfade" duration="1" curve="linear"/>',
  );
  close(single.render(1).data[3], 0.5);
  assert.deepEqual(r.render(2).data, s.data);
});
test("transition masks, directions, error paths and audio amplitudes", () => {
  const a = flat(4, 4, [1, 0, 0, 1]),
    b = flat(4, 4, [0, 0, 1, 1]);
  const half = transitionFrame(a, b, { type: "crossfade" }, 0.5);
  close(half.data[0], 0.5);
  close(half.data[2], 0.5);
  const dip = transitionFrame(
    a,
    b,
    { type: "dip-to-color", color: "#00FF00" },
    0.5,
  );
  assert.deepEqual([...dip.data.slice(0, 4)], [0, 1, 0, 1]);
  for (const direction of ["left", "right", "up", "down"])
    for (const p of [0.25, 0.75])
      assert.ok(
        transitionFrame(
          a,
          b,
          { type: "wipe", direction, softness: 0 },
          p,
        ).data.every(Number.isFinite),
      );
  for (const p of [0, 0.2, 0.5, 0.9, 1]) {
    close(
      transitionGain(p, "equal-power", true) ** 2 +
        transitionGain(p, "equal-power", false) ** 2,
      1,
    );
    close(
      transitionGain(p, "crossfade", true) +
        transitionGain(p, "crossfade", false),
      1,
    );
    for (const incoming of [true, false])
      assert.ok([0, 1].includes(transitionGain(p, "cut", incoming)));
    assert.equal(transitionGain(p, "none", true), 1);
  }
  assert.throws(() => transitionFrame(a, b, { type: "luma" }, 0.5), /matte/);
  assert.throws(
    () => transitionFrame(a, b, { type: "shader" }, 0.5),
    /readable/,
  );
  assert.throws(
    () => transitionFrame(a, b, { type: "unknown" }, 0.5),
    /Unsupported/,
  );
});
test("shutter integrates analytic time, phase, adaptive constancy and per-node flags", () => {
  const sample = (t) => flat(1, 1, [t, t, t, 1]);
  close(
    shutter(
      1,
      10,
      {
        shutterAngle: 360,
        shutterPhase: 0,
        motionBlurSamples: 8,
        adaptiveMotionBlur: false,
      },
      sample,
    ).data[0],
    1.05,
  );
  close(shutter(1, 10, { shutterAngle: 0 }, sample).data[0], 1);
  close(shutter(1, 10, { motionBlurSamples: 1 }, sample).data[0], 1);
  assert.deepEqual(
    shutter(1, 10, { motionBlurSamples: 16 }, () =>
      flat(1, 1, [0.5, 0.5, 0.5, 1]),
    ).data,
    flat(1, 1, [0.5, 0.5, 0.5, 1]).data,
  );
  const moving =
    '<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF"><animate property="x"><key time="0" value="0"/><key time="1" value="16"/></animate></shape>';
  const crisp = renderer(moving),
    blur = renderer(
      moving,
      "",
      'motionBlur="true" shutterAngle="360" motionBlurSamples="8" adaptiveMotionBlur="false"',
    );
  assert.notDeepEqual(crisp.render(0.5).data, blur.render(0.5).data);
  assert.deepEqual(
    renderer(
      moving.replace('id="s"', 'id="s" motionBlur="off"'),
      "",
      'motionBlur="true"',
    ).render(0.5).data,
    crisp.render(0.5).data,
  );
  const before = new Float32Array(blur.render(0.5).data);
  blur.render(1);
  assert.deepEqual(blur.render(0.5).data, before);
});
test("invalid native dependencies, missing inputs and unsupported effects fail explicitly", () => {
  const s = fixture(),
    ctx = context(s);
  for (const p of [
    { type: "other" },
    { type: "echo", frequency: 0 },
    { type: "lut" },
    { type: "shader" },
  ])
    assert.throws(() => processEffect(s, p, ctx));
  for (const type of ["echo", "posterize-time", "pixel-motion-blur"])
    assert.throws(
      () => processEffect(s, { type }, { ...ctx, sample: undefined }),
      /sampler/,
    );
  for (const type of ["gradient-map", "gradient-overlay"])
    assert.throws(
      () =>
        processEffect(
          s,
          { type },
          { ...ctx, paint: undefined, source: undefined },
        ),
      /requires/,
    );
  assert.throws(
    () => processEffect(s, { type: "lighting" }, { ...ctx, lights: [] }),
    /lights/,
  );
  for (const src of ["../escape.cube", "/abs.cube", "x:$BAD"])
    assert.throws(() => resources(src, () => Buffer.from("")), /unsafe/);
  assert.throws(() => native(s, { kind: "other" }));
});

import {
  ColorPipeline,
  convertRGB,
  convertSpace,
  encodeTransfer,
  transferOf,
} from "../src/render/color-management.js";
import { linearize } from "../src/media/color.js";
import { mediaTime } from "../src/media/clock.js";
const colorScene = (attributes = "", children = "", output = "") => {
  const p = loadScene(
    `<scene version="1.1"><project width="16" height="8" fps="24" duration="1"/><colorManagement ${attributes}>${children}</colorManagement><output id="out" path="out.mp4" codec="h264" container="mp4" ${output}/><composition/></scene>`,
  );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return p.scene;
};
test("working primaries roundtrip, transfer encoding, HDR and alpha are numerically preserved", () => {
  for (const space of Object.keys(
    JSON.parse(
      new TextDecoder().decode(
        readFileSync(
          new URL("../src/media/color-tables.json", import.meta.url),
        ),
      ),
    ).matrices,
  )) {
    const a = [0.2, 0.4, 0.6],
      b = convertRGB(convertRGB(a, "linear-srgb", space), space, "linear-srgb");
    for (let k = 0; k < 3; k++) close(a[k], b[k], 2e-5);
  }
  for (const transfer of [
    "srgb",
    "linear",
    "gamma22",
    "gamma26",
    "bt1886",
    "pq",
    "hlg",
    "acescct",
    "logc3",
  ])
    for (const x of [0.02, 0.18, 0.8])
      close(linearize(encodeTransfer(x, transfer), transfer), x, 2e-5);
  assert.equal(transferOf("acescct"), "acescct");
  assert.equal(transferOf("dci-p3"), "gamma26");
  assert.equal(transferOf("rec709"), "bt1886");
  assert.throws(() => convertRGB([1, 1, 1], "unknown", "srgb"), /Unknown/);
  const s = flat(1, 1, [0.1, 0.2, 0.3, 0.5]);
  const converted = convertSpace(
    convertSpace(s, "linear-srgb", "acescct", false, true),
    "acescct",
    "linear-srgb",
    true,
    false,
  );
  for (let i = 0; i < 4; i++) close(s.data[i], converted.data[i], 2e-5);
  const r = renderer(
    shape("s", 'fill="#FFFFFF" effects="e"'),
    '<effects><effect id="e" type="exposure" exposure="2"/></effects>',
  );
  close(r.render(0).data[0], 4);
});
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
test("ordered looks, working precision, display validation and output transfer", () => {
  const s = flat(2, 1, [0.123456, 0.2, 0.3, 0.5]);
  for (const bitDepth of ["8", "16", "16f", "32f"]) {
    const c = new ColorPipeline(
        colorScene(`bitDepth="${bitDepth}" exposure="1" workingSpace="acescg"`),
        () => new Uint8Array(),
      ),
      out = c.finish(c.input(s));
    assert.ok(out.data.every(Number.isFinite));
    close(out.data[3], 0.5);
  }
  const c = new ColorPipeline(
    colorScene(
      'bitDepth="32f" looks="a b"',
      '<look id="a" space="linear-srgb" slope="2,2,2"/><look id="b" space="linear-srgb" offset="0.1,0.1,0.1"/>',
    ),
    () => new Uint8Array(),
  );
  close(c.finish(s).data[0], s.data[0] * 2 + 0.05);
  const mixLook = new ColorPipeline(
    colorScene(
      'bitDepth="32f" looks="a"',
      '<look id="a" space="linear-srgb" src="grade.cube" mix="0.5"/>',
    ),
    () => Buffer.from(cube),
  );
  close(mixLook.finish(s).data[0], s.data[0] * 0.75);
  const p = new ColorPipeline(
    colorScene('display="display-p3" bitDepth="32f"'),
    () => new Uint8Array(),
  );
  assert.equal(p.encode(p.finish(s)).length, 6);
  assert.throws(
    () =>
      new ColorPipeline(
        colorScene('view="missing"'),
        () => new Uint8Array(),
      ).finish(s),
    /requires ocioConfig/,
  );
  const input = structuredClone(colorScene('bitDepth="32f"'));
  input.children.find((n) => n.name === "colorManagement").attributes.looks = [
    "bad",
  ];
  assert.throws(
    () => new ColorPipeline(input, () => new Uint8Array()).finish(s),
    /Unknown look/,
  );
  const linear = new ColorPipeline(
    colorScene('bitDepth="32f"', "", 'transfer="linear"'),
    () => new Uint8Array(),
  );
  close(linear.encode(s)[0], Math.round(s.data[0] * 255), 1);
});
test("AgX, ACES 2, Filmic and PQ EETF use distinct measured display transforms", () => {
  const s = flat(1, 1, [1, 1, 1, 1]),
    agx = grade(s, { type: "tonemap", tonemapper: "agx" }),
    filmic = grade(s, { type: "tonemap", tonemapper: "filmic" });
  close(encodeTransfer(agx.data[0], "srgb"), 0.7709787488, 2e-5);
  close(encodeTransfer(filmic.data[0], "srgb"), 0.8072379231, 2e-5);
  for (const toneMapping of [
    "none",
    "aces",
    "aces2",
    "agx",
    "filmic",
    "reinhard",
  ]) {
    const c = new ColorPipeline(
      colorScene(`toneMapping="${toneMapping}" bitDepth="32f"`),
      () => new Uint8Array(),
    );
    assert.ok(c.finish(s).data.every(Number.isFinite));
  }
  close(tone(100, "pq-to-sdr"), 1, 1e-4);
  assert.ok(tone(0.001, "pq-to-sdr") <= 0.001001);
});
test("OCIO config resolves actual FileTransforms, preserves alpha and rejects escaping resources", () => {
  const config = `ocio_profile_version: 2\nsearch_path: luts\nroles: {scene_linear: linear-srgb, default: linear-srgb}\ndisplays:\n  srgb:\n    - !<View> {name: standard, colorspace: display}\ncolorspaces:\n  - !<ColorSpace>\n    name: linear-srgb\n    family: input\n    bitdepth: 32f\n    isdata: false\n    allocation: uniform\n  - !<ColorSpace>\n    name: display\n    family: output\n    bitdepth: 32f\n    isdata: false\n    allocation: uniform\n    from_scene_reference: !<FileTransform> {src: gain.cube, interpolation: linear}\n`;
  const files = { "config.ocio": config, "luts/gain.cube": cube },
    read = (p) => {
      if (!(p in files)) throw new Error(`Missing ${p}`);
      return Buffer.from(files[p]);
    };
  assert.deepEqual(
    [...resources("config.ocio", read).keys()],
    ["config.ocio", "luts/gain.cube"],
  );
  const pipeline = new ColorPipeline(
      colorScene('ocioConfig="config.ocio" bitDepth="32f"'),
      read,
    ),
    s = flat(1, 1, [0.2, 0.3, 0.4, 0.5]),
    result = pipeline.finish(s);
  close(result.data[3], 0.5);
  close(encodeTransfer(result.data[0] / 0.5, "srgb"), 0.2, 2e-5);
  assert.throws(
    () =>
      resources("bad.ocio", () => Buffer.from(config.replace("luts", "/tmp"))),
    /unsafe/,
  );
  assert.throws(
    () =>
      resources("file.clf", () =>
        Buffer.from('<Reference path="/etc/example"/>'),
      ),
    /unsafe/,
  );
  assert.throws(
    () =>
      resources("file.clf", () =>
        Buffer.from('<Reference path="a.clf" basePath="outside"/>'),
      ),
    /local/,
  );
  const cycle = resources("a.clf", () =>
    Buffer.from('<Reference path="a.clf"/>'),
  );
  assert.equal(cycle.size, 1);
  assert.throws(
    () =>
      resources(
        "a.cube",
        () => Buffer.from(""),
        new Map(
          Array.from({ length: 128 }, (_, i) => [String(i), Buffer.from("")]),
        ),
      ),
    /128/,
  );
});
test("LUT .cube, CLF, 3DL and GLSL uniforms produce reference pixels", () => {
  const s = flat(2, 2, [0.2, 0.4, 0.6, 1]),
    dir = mkdtempSync(join(tmpdir(), "fx-luts-"));
  try {
    writeFileSync(join(dir, "a.cube"), cube);
    execFileSync("python3", [
      "-c",
      `import PyOpenColorIO as o,sys\nc=o.Config.CreateRaw();p=c.getProcessor(o.FileTransform(src=sys.argv[1]));open(sys.argv[2],'w').write(p.createGroupTransform().write('Academy/ASC Common LUT Format'))`,
      join(dir, "a.cube"),
      join(dir, "a.clf"),
    ]);
    const identity3dl =
      "0 256 512 768 1023\n" +
      [0, 1024, 2048, 3072, 4095]
        .flatMap((r) =>
          [0, 1024, 2048, 3072, 4095].flatMap((g) =>
            [0, 1024, 2048, 3072, 4095].map((b) => `${r} ${g} ${b}`),
          ),
        )
        .join("\n") +
      "\n";
    writeFileSync(join(dir, "a.3dl"), identity3dl);
    for (const file of ["a.cube", "a.clf"]) {
      const out = processEffect(
        s,
        { type: "lut", src: file },
        { ...context(s), read: (p) => readFileSync(join(dir, p)) },
      );
      close(out.data[0], 0.1);
      close(out.data[2], 0.3);
    }
    const out = processEffect(
      s,
      { type: "lut", src: "a.3dl" },
      { ...context(s), read: (p) => readFileSync(join(dir, p)) },
    );
    close(out.data[0], 0.2, 1e-4);
    const gl = processEffect(s, { type: "shader", src: "a.glsl" }, context(s));
    close(gl.data[0], 0.1);
    close(gl.data[3], 1);
    assert.throws(() =>
      processEffect(
        s,
        { type: "shader", src: "a.glsl" },
        { ...context(s), params: { missing: 1 } },
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("media handles extend trim bounds, including reverse playback", () => {
  close(
    mediaTime({ clipIn: 1, clipOut: 3, transitionHandle: true }, -0.5, 4),
    0.5,
  );
  close(
    mediaTime({ clipIn: 1, clipOut: 3, transitionHandle: true }, 2.5, 4),
    3.5,
  );
  close(
    mediaTime(
      { clipIn: 1, clipOut: 3, transitionHandle: true, reverse: true },
      -0.5,
      4,
    ),
    3.5,
  );
  close(mediaTime({ clipIn: 1, clipOut: 3, transitionHandle: true }, -2, 4), 0);
});

import { renderEpisode } from "../src/render/pipeline.js";
import { encodePng } from "../src/render/image.js";
import { videoAudio } from "../src/media/audio.js";
test("temporal adjustment reads the preceding backdrop, including reordered samples", () => {
  const r = renderer(
    '<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF"><animate property="x"><key time="0" value="0"/><key time="2" value="8"/></animate></shape><adjustment id="a" effects="e"/>',
    '<effects><effect id="e" type="echo" samples="2" frequency="2" amount="1"/></effects>',
  );
  const a = new Float32Array(r.render(1).data);
  close(a[2 * 4 + 3], 0.5);
  close(a[4 * 4 + 3], 0.5);
  r.render(0);
  assert.deepEqual(r.render(1).data, a);
});
test("segmented render, resumed cache and shards retain transition pixels and LUT dependency hashes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fx-render-"));
  try {
    writeFileSync(
      join(dir, "plate.png"),
      encodePng(flat(32, 18, [0.2, 0.3, 0.4, 1])),
    );
    writeFileSync(join(dir, "look.cube"), cube);
    const xml = `<scene version="1.1"><project width="32" height="18" fps="4" duration="2"/><output id="out" path="out.mp4" codec="h264" container="mp4" audio="false"/><assets><image id="p" src="plate.png" width="32" height="18"/></assets><composition><group id="a" start="0" end="1"><layer id="x" asset="p" effects="grade"/></group><group id="b" start="1" end="2"><shape id="s" shape="rect" width="32" height="18" fill="#FF0000"/></group><transition from="a" to="b" duration="1" curve="linear" type="crossfade"/></composition><effects><effect id="grade" type="lut" src="look.cube" space="linear-srgb"/></effects></scene>`;
    writeFileSync(join(dir, "scene.xml"), xml);
    const opts = { sceneFile: join(dir, "scene.xml") };
    const initial = await renderEpisode(opts);
    assert.equal(initial.rendered, 2);
    const rgb = () =>
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        join(dir, "out.mp4"),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
    const first = rgb();
    assert.equal((await renderEpisode(opts)).cached, 2);
    await renderEpisode({ ...opts, work: join(dir, "sharded"), shard: [1, 2] });
    await renderEpisode({ ...opts, work: join(dir, "sharded"), shard: [0, 2] });
    const assembled = await renderEpisode({
      ...opts,
      work: join(dir, "sharded"),
    });
    assert.equal(assembled.cached, 2);
    assert.deepEqual(rgb(), first);
    writeFileSync(join(dir, "look.cube"), "LUT_1D_SIZE 2\n0 0 0\n1 1 1\n");
    assert.equal((await renderEpisode(opts)).rendered, 2);
    assert.notDeepEqual(rgb(), first);
    const manifest = JSON.parse(
      readFileSync(join(dir, "out.mp4.assets.json"), "utf8"),
    );
    assert.equal(manifest.effectResources[0].src, "look.cube");
    assert.match(manifest.effectResources[0].sha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("embedded audio follows transition handles and equal-power amplitude at the visual midpoint", () => {
  const dir = mkdtempSync(join(tmpdir(), "fx-audio-"));
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=16x16:r=4:d=4",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.25|0.25:s=48000:d=4",
      "-c:v",
      "libx264",
      "-c:a",
      "pcm_f32le",
      "-shortest",
      join(dir, "source.mkv"),
    ]);
    const xml = `<scene version="1.1"><project width="16" height="16" fps="4" duration="4"/><assets><video id="v" src="source.mkv" width="16" height="16" fps="4" duration="4" hasAudio="true"/></assets><composition><layer id="a" asset="v" start="0" end="2" clipIn="1" clipOut="3"/><layer id="b" asset="v" start="2" end="4" clipIn="1" clipOut="3"/><transition from="a" to="b" type="crossfade" duration="1" curve="linear" audio="equal-power"/></composition></scene>`;
    const p = prepareScene(xml);
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    const baked = videoAudio(
      p.runtime.scene,
      p.runtime,
      dir,
      join(dir, "work"),
    );
    assert.equal(baked.paths.size, 2);
    for (const path of baked.paths.values()) {
      const wav = readFileSync(path);
      close(
        wav.readFloatLE(44 + Math.floor(2 * 48000) * 8),
        0.25 / Math.SQRT2,
        0.0001,
      );
      assert.ok(wav.readFloatLE(44 + Math.floor(1.75 * 48000) * 8) > 0);
      assert.ok(wav.readFloatLE(44 + Math.floor(2.25 * 48000) * 8) > 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { nativeInfo, uniformValue } from "../src/render/fx/native.js";
test("native identities and typed shader uniforms are stable and validated", () => {
  assert.equal(nativeInfo(false).OpenColorIO, "2.5.1");
  assert.deepEqual(nativeInfo(false), nativeInfo(false));
  assert.ok(nativeInfo(true).renderer);
  assert.deepEqual(nativeInfo(true), nativeInfo(true));
  assert.equal(uniformValue("true"), true);
  assert.equal(uniformValue("false"), false);
  assert.equal(uniformValue("0.5"), 0.5);
  assert.deepEqual(uniformValue("[1, 2, 3]"), [1, 2, 3]);
  assert.throws(() => uniformValue("oops"), /invalid/);
});
test("overlay and fill have distinct alpha semantics; numeric budgets fail explicitly", () => {
  const s = flat(1, 1, [0.2, 0, 0, 0.5]);
  const p = { color: "#00FF0080", amount: 0.5 };
  close(grade(s, { ...p, type: "fill" }).data[3], (0.5 * 128) / 255);
  close(grade(s, { ...p, type: "color-overlay" }).data[3], 0.5);
  assert.ok(grade(s, { ...p, type: "color-overlay" }).data[0] > 0);
  assert.throws(
    () => processEffect(s, { type: "blur", samples: 257 }, context(s)),
    /budget/,
  );
  assert.throws(
    () => processEffect(s, { type: "blur", radius: Infinity }, context(s)),
    /finite/,
  );
  assert.throws(
    () => processEffect(s, { type: "exposure", exposure: 10000 }, context(s)),
    /non-finite/,
  );
});
test("animated motion blur toggles and group inheritance use the evaluated node state", () => {
  const move =
      '<animate property="x"><key time="0" value="0"/><key time="1" value="16"/></animate>',
    toggle =
      '<animate property="motionBlur"><key time="0" value="off"/><key time="0.5" value="on"/></animate>';
  const body = `<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF">${move}${toggle}</shape>`,
    r = renderer(
      body,
      "",
      'shutterAngle="360" motionBlurSamples="8" adaptiveMotionBlur="false"',
    );
  const crisp = renderer(body.replace(toggle, ""));
  assert.deepEqual(r.render(0.25).data, crisp.render(0.25).data);
  assert.notDeepEqual(r.render(0.5).data, crisp.render(0.5).data);
  assert.deepEqual(
    renderer(
      `<group id="g" motionBlur="off">${body.replace(toggle, "")}</group>`,
      "",
      'motionBlur="true"',
    ).render(0.5).data,
    crisp.render(0.5).data,
  );
});
test("adjustment shutter samples its backdrop and gradient-map accepts a paint source", () => {
  const body =
    '<shape id="s" shape="rect" width="2" height="2" fill="#FFFFFF" motionBlur="off"><animate property="x"><key time="0" value="0"/><key time="1" value="16"/></animate></shape><adjustment id="a" effects="e" motionBlur="on"/>';
  const r = renderer(
    body,
    '<effects><effect id="e" type="exposure" exposure="0"/></effects>',
    'shutterAngle="360" motionBlurSamples="8" adaptiveMotionBlur="false"',
  );
  const data = r.render(0.5).data;
  assert.ok(data.some((v, i) => i % 4 === 3 && v > 0 && v < 1));
  const xml =
    '<scene version="1.1"><project width="8" height="8" fps="4" duration="1"/><paints><linearGradient id="p" dither="false"><stop offset="0" color="#000000"/><stop offset="1" color="#FF0000"/></linearGradient></paints><composition><shape id="s" shape="rect" width="8" height="8" fill="#FFFFFF" effects="e"/></composition><effects><effect id="e" type="gradient-map" source="p"/></effects></scene>';
  const q = prepareScene(xml);
  assert.ok(q.ok, JSON.stringify(q.diagnostics));
  const f = new FrameRenderer(
    q.runtime.scene,
    q.runtime.tracks,
    { read: () => new Uint8Array() },
    1,
    q.runtime,
  );
  assert.ok(f.render(0).data[0] > 0.9);
  assert.equal(f.render(0).data[1], 0);
});
test("full fragment main and raw display bypass have explicit semantics", () => {
  const s = flat(1, 1, [0.2, 0.4, 0.6, 1]);
  const out = native(s, {
    kind: "shader",
    shader:
      "in vec2 uv; uniform sampler2D from; out vec4 result; void main(){result=texture(from,uv)*vec4(0.5,1,1,1);}",
  });
  close(out.data[0], 0.1);
  close(out.data[3], 1);
  const raw = new ColorPipeline(
    colorScene('view="raw" toneMapping="agx" bitDepth="32f"'),
    () => new Uint8Array(),
  );
  assert.deepEqual(raw.finish(s).data, s.data);
});
test("display selection keeps the public Surface in linear sRGB until output encoding", () => {
  const s = flat(1, 1, [0.2, 0.3, 0.4, 1]),
    pipeline = new ColorPipeline(
      colorScene(
        'display="display-p3" bitDepth="32f"',
        "",
        'colorSpace="display-p3"',
      ),
      () => new Uint8Array(),
    );
  assert.deepEqual(pipeline.finish(s).data, s.data);
  const rgb = convertRGB([0.2, 0.3, 0.4], "linear-srgb", "display-p3"),
    encoded = pipeline.encode(s);
  for (let k = 0; k < 3; k++)
    close(encoded[k], Math.round(encodeTransfer(rgb[k], "srgb") * 255), 1);
});
