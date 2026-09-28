import { test } from "node:test";
import assert from "node:assert/strict";
import { Surface } from "../src/render/surface.js";
import { processEffect } from "../src/render/fx/processor.js";
import { morphology } from "../src/render/fx/pixels.js";
import { blur } from "../src/render/effects.js";
import { convertSpace } from "../src/render/color-management.js";
import { parseColor } from "../src/render/color.js";
import { Physics } from "../src/render/dynamics/physics.js";
import { field } from "../src/render/dynamics/fields.js";
import { particleStates, random } from "../src/render/dynamics/particles.js";
import { Tracking } from "../src/render/dynamics/tracking.js";
import { Compositor } from "../src/render/compositor.js";
import { FrameRenderer } from "../src/render/frame.js";
import { prepareScene } from "../src/index.js";

const node = (name, attributes = {}, children = []) => ({
  name,
  attributes,
  children,
  path: `/${name}`,
  type: name + "Type",
  loc: { line: 1, column: 1 },
  value: null,
});
const close = (a, b, e = 1e-6) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const ctx = { scale: 1, time: 0, frame: 0, fps: 24 };
const surface = (w, h, pixels) => {
  const s = new Surface(w, h);
  s.data.set(pixels);
  return s;
};

test("burst particle ids stay fixed while continuous births accrue", () => {
  const e = node(
    "particleEmitter",
    { rate: 20, lifetime: 5, speed: 10, spread: 90, seed: 3 },
    [
      node("burst", { time: 0, count: 3, repeat: 1, interval: 0.2 }),
      node("burst", { time: 0.1, count: 2 }),
    ],
  );
  const attrs = (n) => n.attributes,
    at = (t) => particleStates(e, t, attrs),
    burst = (states) => states.filter((p) => p.id >= 0x40000000);
  const a = at(0.5),
    b = at(0.9);
  assert.equal(burst(a).length, 8);
  // Each burst particle keeps its id, and hence its random direction.
  for (const p of burst(a)) {
    const q = b.find((s) => s.id === p.id);
    assert.ok(q);
    close(Math.atan2(q.vy, q.vx), Math.atan2(p.vy, p.vx));
  }
  const ids = b.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(b.some((p) => p.id < 0x40000000));
  // Document order: burst 0 repeats 0/1 then burst 1.
  assert.deepEqual(
    burst(a)
      .map((p) => p.id - 0x40000000)
      .sort((x, y) => x - y),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  // Malformed counts contribute nothing.
  const bad = node("particleEmitter", { rate: 0 }, [
    node("burst", { count: "x", repeat: "y" }),
  ]);
  assert.equal(particleStates(bad, 0, attrs).length, 0);
});

test("asset-alpha rejection draws from lanes disjoint from direction and size", () => {
  const e = node(
    "particleEmitter",
    {
      rate: 0,
      lifetime: 2,
      speed: 0,
      emitterShape: "asset-alpha",
      emitterAsset: "a",
      seed: 9,
    },
    [node("burst", { time: 0, count: 6 })],
  );
  // Only the right half of a 2x1 mask emits.
  const image = () => ({
    width: 2,
    height: 1,
    data: new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]),
  });
  const states = particleStates(e, 0.1, (n) => n.attributes, { image });
  assert.equal(states.length, 6);
  for (const p of states) {
    let attempt = 0;
    while (Math.floor(random(9, p.id, 0x10000 + attempt * 3) * 2) !== 1)
      attempt++;
    assert.equal(p.x, 1.5);
    assert.ok(attempt < 1024);
  }
});

test("attractor paths are parsed once and still steer toward the path", () => {
  const a = {
    type: "attractor-path",
    path: "M0 0 L100 0",
    strength: 5,
  };
  const f = field(a, 50, 10, 0, 0, 0);
  close(f[0], 0);
  close(f[1], -5);
  assert.deepEqual(field(a, 50, 10, 0, 0, 0), f);
  // More distinct paths than the cache holds still evaluate correctly.
  for (let i = 0; i < 70; i++) {
    const g = field({ ...a, path: `M0 ${i} L100 ${i}` }, 50, i - 10, 0, 0, 0);
    close(g[1], 5);
  }
});

test("particles under force fields measure layout on a grid, not per step", () => {
  const xml =
    '<scene version="1.1"><project width="40" height="40" fps="8" duration="2" background="#00000000"/><composition><particleEmitter id="e" emitterShape="point" x="5" y="20" rate="60" lifetime="2" size="2" speed="10" direction="0" spread="40" seed="4"/></composition><physics gravityY="0"><forceField id="w" type="directional" forceX="20" forceY="0"/></physics></scene>';
  const p = prepareScene(xml);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const r = new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => new Uint8Array() },
    1,
    p.runtime,
  );
  const measure = Compositor.prototype.measure;
  let calls = 0;
  Compositor.prototype.measure = function (n, ...rest) {
    if (n.name === "composition") calls++;
    return measure.call(this, n, ...rest);
  };
  try {
    const out = r.render(1);
    assert.ok(out.data.some((v) => v > 0));
  } finally {
    Compositor.prototype.measure = measure;
  }
  // ~60 particles x ~60 steps would need thousands of layout passes.
  assert.ok(calls < 400, `${calls} layout passes`);
});

test("particles take the exact transform where the emitter animates", () => {
  const xml = (animated) =>
    `<scene version="1.1"><project width="40" height="40" fps="8" duration="2" background="#00000000"/><composition><particleEmitter id="e" emitterShape="point" x="5" y="20" rate="0" lifetime="2" size="2" speed="0" direction="0"><burst time="0" count="1"/>${animated ? '<animate property="rotation"><key time="0" value="0"/><key time="2" value="90"/></animate>' : ""}</particleEmitter></composition><physics gravityY="0"><forceField id="w" type="directional" forceX="40" forceY="0"/></physics></scene>`;
  const run = (animated) => {
    const p = prepareScene(xml(animated));
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    const r = new FrameRenderer(
        p.runtime.scene,
        p.runtime.tracks,
        { read: () => new Uint8Array() },
        1,
        p.runtime,
      ),
      measure = Compositor.prototype.measure;
    let calls = 0;
    Compositor.prototype.measure = function (n, ...rest) {
      if (n.name === "composition") calls++;
      return measure.call(this, n, ...rest);
    };
    try {
      const out = r.render(1);
      assert.deepEqual(r.render(1).data, out.data);
      return { calls, out };
    } finally {
      Compositor.prototype.measure = measure;
    }
  };
  const still = run(false),
    turning = run(true);
  // The static emitter reuses grid samples; the rotating one is measured at
  // each integration instant as well (one burst particle, ~120 steps).
  assert.ok(turning.calls > still.calls + 100);
  assert.notDeepEqual(turning.out.data, still.out.data);
});

test("kinematic bodies turn the short way across +/-180 degrees", () => {
  const b = node("shape", { id: "k", width: 10, height: 10 }, [
      node("rigidBody", { type: "kinematic", shape: "box" }),
    ]),
    scene = node("scene", {}, [
      node("project", { width: 100, height: 100 }),
      node("composition", {}, [b]),
      node("physics", { gravityY: 0, fixedStep: 1 / 120 }),
    ]);
  const p = new Physics(
    scene,
    (n, t) =>
      n === b ? { ...n.attributes, rotation: 170 + t * 40 } : n.attributes,
    () => ({ width: 10, height: 10 }),
    () => Buffer.alloc(0),
  );
  let previous = p.pose(b, 0).rotation;
  for (let i = 1; i <= 20; i++) {
    const r = p.pose(b, i / 20).rotation;
    assert.ok(Math.abs(r - previous) < 5, `jump ${previous} -> ${r} at ${i}`);
    previous = r;
  }
  const d = previous - 210;
  close(d - 360 * Math.round(d / 360), 0, 1);
});

test("joint break forces use the substep rate", () => {
  const rigid = (id, attrs, body) =>
    node("shape", { id, width: 10, height: 10, ...attrs }, [
      node("rigidBody", { shape: "box", mass: 1, ...body }),
    ]);
  const reaction = (substeps) => {
    const a = rigid("a", { x: 50, y: 10 }, { type: "static" }),
      b = rigid("b", { x: 50, y: 40 }, { type: "dynamic" }),
      scene = node("scene", {}, [
        node("project", { width: 100, height: 100 }),
        node("composition", {}, [a, b]),
        node("physics", { gravityY: 500, fixedStep: 1 / 60 }, [
          node("constraint", { id: "c", type: "distance", a: "a", b: "b" }),
        ]),
      ]);
    const p = new Physics(
      scene,
      (n) => n.attributes,
      () => ({ width: 10, height: 10 }),
      () => Buffer.alloc(0),
    );
    p.substeps = substeps;
    const joint = p.joints[0].joint,
      original = joint.getReactionForce.bind(joint);
    let last = 0;
    joint.getReactionForce = (invDt) => {
      const f = original(invDt);
      last = Math.hypot(f.x, f.y);
      return f;
    };
    p.pose(b, 1);
    return last;
  };
  const one = reaction(1),
    eight = reaction(8);
  assert.ok(one > 0);
  // Static load: the reaction is the hanging weight whatever the substeps.
  close(eight / one, 1, 0.05);
});

test("tonemap display operators convert the working space to linear sRGB and back", () => {
  const lin = surface(1, 1, [0.8, 0.3, 0.1, 1]),
    p = { type: "tonemap", tonemapper: "agx" },
    expected = processEffect(lin, p, { ...ctx, workingSpace: "linear-srgb" }),
    graded = processEffect(convertSpace(lin, "linear-srgb", "acescg"), p, {
      ...ctx,
      workingSpace: "acescg",
    }),
    back = convertSpace(graded, "acescg", "linear-srgb");
  for (let k = 0; k < 4; k++)
    close(Number(back.data[k]), Number(expected.data[k]), 1e-4);
});

test("gradient overlay unpremultiplies raster sources", () => {
  const s = surface(1, 1, [1, 1, 1, 1]),
    source = surface(1, 1, [0.5, 0, 0, 0.5]),
    out = processEffect(s, { type: "gradient-overlay" }, { ...ctx, source });
  assert.deepEqual(Array.from(out.data), [0.5, 0, 0, 0.5]);
  const empty = processEffect(
    s,
    { type: "gradient-map" },
    { ...ctx, source: new Surface(1, 1) },
  );
  assert.deepEqual(Array.from(empty.data), [0, 0, 0, 0]);
});

test("lighting colours go through the working-space and token-aware parsers", () => {
  const s = surface(1, 1, [1, 1, 1, 1]),
    color = (c) => c.map((v, i) => (i < 3 ? v * 2 : v)),
    tokens = (v) => (v === "brand" ? [0, 1, 0, 1] : parseColor(v)),
    run = (lightColor) =>
      Array.from(
        processEffect(
          s,
          { type: "lighting" },
          {
            ...ctx,
            color,
            parseColor: tokens,
            lights: [{ type: "ambient", color: lightColor }],
          },
        ).data,
      );
  assert.deepEqual(run("#FF0000"), [2, 0, 0, 1]);
  assert.deepEqual(run("brand"), [0, 2, 0, 1]);
  // Without context converters the light colour is used as parsed.
  assert.deepEqual(
    Array.from(
      processEffect(
        s,
        { type: "lighting" },
        { ...ctx, lights: [{ type: "ambient", color: "#FF0000" }] },
      ).data,
    ),
    [1, 0, 0, 1],
  );
});

test("posterize-time snaps float frame round-trips onto the grid", () => {
  const seen = [];
  processEffect(
    surface(1, 1, [1, 1, 1, 1]),
    { type: "posterize-time", frequency: 25 },
    {
      ...ctx,
      time: 29 / 25,
      sample: (t) => {
        seen.push(t);
        return new Surface(1, 1);
      },
    },
  );
  assert.deepEqual(seen, [29 / 25]);
});

/** Direct disk morphology of the alpha channel: the pre-optimisation reference. */
function reference(s, radius) {
  const r = Math.ceil(Math.abs(radius)),
    out = new Float64Array(s.width * s.height);
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      let v = radius < 0 ? 1 : 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= radius * radius) {
            const xx = x + dx,
              yy = y + dy,
              q =
                xx >= 0 && yy >= 0 && xx < s.width && yy < s.height
                  ? Number(s.data[(yy * s.width + xx) * 4 + 3])
                  : 0;
            v = radius < 0 ? Math.min(v, q) : Math.max(v, q);
          }
      out[y * s.width + x] = v;
    }
  return out;
}

test("morphology matches direct disk evaluation, with and without a zero-region hint", () => {
  const W = 23,
    H = 17,
    s = new Surface(W, H);
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 4; y < 13; y++)
    for (let x = 5; x < 18; x++) {
      const a = rand() < 0.3 ? 0 : rand(),
        j = (y * W + x) * 4;
      s.data.set([a * rand(), a * rand(), a * rand(), a], j);
    }
  const hinted = new Surface(W, H);
  hinted.data.set(s.data);
  hinted.bbox = { x0: 5, y0: 4, x1: 18, y1: 13 };
  for (const radius of [0, 0.5, 1, 1.5, 2.3, 4, -0.5, -1, -1.5, -2.3, -4])
    for (const input of [s, hinted]) {
      const out = morphology(input, radius),
        want = reference(s, radius);
      for (let i = 0; i < W * H; i++) {
        close(Number(out.data[i * 4 + 3]), Number(want[i]), 1e-7);
        const old = Number(s.data[i * 4 + 3]);
        if (old)
          for (let k = 0; k < 3; k++)
            close(
              Number(out.data[i * 4 + k]),
              (Number(s.data[i * 4 + k]) * Number(want[i])) / old,
              1e-6,
            );
      }
    }
  // A radius beyond the diagonal saturates rather than scanning further.
  const huge = morphology(s, 1e6),
    max = Math.max(...reference(s, 40));
  for (let i = 0; i < W * H; i++)
    close(Number(huge.data[i * 4 + 3]), max, 1e-7);
  assert.ok(morphology(s, -1e6).data.every((v) => v === 0));
});

test("dilation spreads the covering neighbour's colour instead of black", () => {
  const s = new Surface(5, 1);
  s.data.set([0.5, 0.25, 0, 0.5], 2 * 4);
  const out = morphology(s, 2);
  for (let x = 0; x < 5; x++)
    assert.deepEqual(
      Array.from(out.data.slice(x * 4, x * 4 + 4)),
      [0.5, 0.25, 0, 0.5],
    );
  // Erosion keeps each surviving pixel's own colour and never borrows.
  assert.ok(morphology(s, -1).data.every((v) => v === 0));
});

test("glow blur treats samples outside the surface as transparent", () => {
  const v = new Float32Array(16 * 16).fill(1),
    b = blur(v, 16, 16, 4);
  assert.ok(Number(b[0]) < 0.6);
  close(Number(b[8 * 16 + 8]), 1, 1e-5);
  // A blur wider than the surface still keeps the borders transparent.
  const narrow = blur(new Float32Array([1, 1]), 2, 1, 20);
  assert.ok(Number(narrow[0]) < 0.2);
});

test("stabilize averages rotation on the circle across +/-180 degrees", () => {
  const keys = [];
  for (let i = -8; i <= 8; i++)
    keys.push({ time: i / 8, x: 0, rotation: i % 2 ? -179 : 179 });
  const scene = node("scene", {}, [
      node("tracking", {}, [
        node("trackData", {
          id: "t",
          src: "t.json",
          format: "json",
          footage: "video",
        }),
      ]),
    ]),
    tracking = new Tracking(scene, () => Buffer.from(JSON.stringify(keys)), 24),
    r = tracking.stabilize("video", 0, 1);
  close(r.rotation, 16 / 17);
  close(r.x, 0);
  close(r.scaleX, 1);
});

test("tracking rotation interpolates the short way across ±180°", async () => {
  const { sampleTracking } = await import("../src/render/dynamics/tracking.js");
  const keys = [
    { time: 0, rotation: 170, x: 0 },
    { time: 1, rotation: -170, x: 10 },
  ];
  const mid = sampleTracking(/** @type {any} */ (keys), 0.5);
  assert.ok(
    Math.abs(Math.abs(mid.rotation) - 180) < 1e-9,
    String(mid.rotation),
  );
  assert.equal(mid.x, 5);
});
