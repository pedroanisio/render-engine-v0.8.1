import { test } from "node:test";
import assert from "node:assert/strict";
import { Physics } from "../src/render/dynamics/physics.js";
import { field } from "../src/render/dynamics/fields.js";
import {
  particleStates,
  particleAttributes,
  random,
} from "../src/render/dynamics/particles.js";
import { deformPoint, skinPoint } from "../src/render/dynamics/deform.js";
import {
  Tracking,
  parseTracking,
  sampleTracking,
} from "../src/render/dynamics/tracking.js";
import { Constraints } from "../src/render/dynamics/constraints.js";
import { prepareScene } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
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
const make = (
  bodies = [],
  physics = { gravityY: 0, fixedStep: 1 / 120 },
  children = [],
) =>
  node("scene", {}, [
    node("project", { width: 100, height: 100 }),
    node("composition", {}, bodies),
    node("physics", physics, children),
  ]);
const rigid = (id, attrs = {}, body = {}) =>
  node("shape", { id, width: 10, height: 10, ...attrs }, [
    node("rigidBody", {
      type: "dynamic",
      shape: "box",
      mass: 1,
      linearDamping: 0,
      angularDamping: 0,
      ...body,
    }),
  ]);
const sim = (scene) =>
  new Physics(
    scene,
    (n) => n.attributes,
    (n) => ({
      width: Number(n.attributes.width ?? 10),
      height: Number(n.attributes.height ?? 10),
    }),
    () => Buffer.from("{}"),
  );
function render(body, sections = "", assets = "") {
  const p = prepareScene(
    `<scene version="1.1"><project width="64" height="48" duration="3" fps="8" background="#00000000"/>${assets}<composition>${body}</composition>${sections}</scene>`,
  );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => new Uint8Array() },
    1,
    p.runtime,
  );
}
test("fixed-step rigid motion has analytic acceleration, interpolated samples and independent seek order", () => {
  const b = rigid("b", {}, { velocityX: 10 });
  const scene = make([b], {
    gravityY: -1,
    fixedStep: 0.1,
    pixelsPerMeter: 100,
  });
  const a = sim(scene);
  close(a.pose(b, 1).x, 10);
  close(a.pose(b, 1).y, 55);
  close(a.pose(b, 0.5).y, 15);
  close(a.pose(b, 0.55).y, 18);
  assert.deepEqual(a.pose(b, 0.3), sim(scene).pose(b, 0.3));
  assert.equal(a.export().poses.b.length, 11);
});
test("collision, sensors, restitution, groups, activation, fixed rotation and shapes", () => {
  for (const shape of ["box", "circle", "capsule", "polygon", "path"]) {
    const b = rigid(
        "b",
        { x: 5, y: 5 },
        {
          shape,
          path: "M0 0 L10 0 L10 10 L0 10Z",
          velocityY: 20,
          angularVelocity: 50,
          fixedRotation: true,
        },
      ),
      ground = rigid(
        "floor",
        { y: 30, width: 80, height: 10 },
        { type: "static" },
      );
    const s = sim(make([b, ground]));
    const p = s.pose(b, 1);
    assert.ok(p.y < 21, shape);
    close(p.rotation, 0);
  }
  const b = rigid("b", { x: 0, y: 0 }, { velocityY: 30, sensor: true }),
    ground = rigid("floor", { y: 20, width: 80 }, { type: "static" });
  close(sim(make([b, ground])).pose(b, 1).y, 30);
  const excluded = rigid(
    "b",
    {},
    { velocityY: 30, collisionGroup: 2, collidesWith: "2" },
  );
  close(sim(make([excluded, ground])).pose(excluded, 1).y, 30);
  const delayed = rigid("b", {}, { velocityX: 20, activateAt: 0.5 });
  const s = sim(make([delayed]));
  close(s.pose(delayed, 0.4).x, 0);
  close(s.pose(delayed, 1).x, 10, 0.2);
  assert.throws(() => sim(make([rigid("b", {}, { mass: 0 })])), /positive/);
  assert.throws(
    () => sim(make([rigid("b", {}, { shape: "nonsense" })])),
    /unsupported/,
  );
  assert.throws(() => sim(make([], { fixedStep: 1e-6 })), /budget/);
});
for (const type of [
  "spring",
  "distance",
  "pin",
  "rope",
  "hinge",
  "slider",
  "weld",
  "motor",
])
  test(`physics ${type} joint constrains a driven body`, () => {
    const a = rigid("a", { x: 20, y: 20 }, { type: "static" }),
      b = rigid("b", { x: 40, y: 20 }, { velocityX: 20 });
    const c = node("constraint", {
      id: "c",
      type,
      a: "a",
      b: "b",
      x: 20,
      y: 20,
      restLength: 20,
      stiffness: 50,
      damping: 0.4,
      motorSpeed: 15,
      maxForce: 100,
      minAngle: -10,
      maxAngle: 10,
    });
    const s = sim(make([a, b], { gravityY: 0, fixedStep: 1 / 120 }, [c]));
    const result = s.pose(b, 0.5);
    assert.ok(Object.values(result).every(Number.isFinite));
    assert.ok(s.world.getJointCount() > 0);
    if (type === "distance" || type === "rope")
      assert.ok(Math.hypot(result.x - 20, result.y - 20) <= 21);
  });
test("breakable joints and frame bounds", () => {
  const a = rigid("a", {}, { type: "static" }),
    b = rigid("b", { x: 20 }, { velocityX: 500 });
  const s = sim(
    make([a, b], { gravityY: 0, fixedStep: 1 / 120 }, [
      node("constraint", {
        id: "c",
        type: "distance",
        a: "a",
        b: "b",
        restLength: 20,
        breakForce: 0,
      }),
    ]),
  );
  s.pose(b, 0.5);
  assert.ok(s.broken.has("c"));
  const moving = rigid("m", { x: 50, y: 50 }, { velocityX: 200, bullet: true });
  assert.ok(
    sim(make([moving], { bounds: "frame", gravityY: 0 })).pose(moving, 1).x <
      91,
  );
});
for (const kind of ["jelly", "cloth", "rope"])
  test(`soft ${kind}: pins, shape deformation and replay`, () => {
    const b = node(
      "shape",
      { id: "soft", x: 10, y: 10, width: 20, height: 20 },
      [
        node("softBody", {
          kind,
          mass: 1,
          rows: 3,
          cols: 3,
          pin: "left",
          stiffness: 20,
          damping: 0.1,
          pressure: kind === "jelly" ? 2 : 0,
          selfCollision: true,
        }),
      ],
    );
    const scene = make([b], {
      gravityY: -1,
      fixedStep: 1 / 120,
      pixelsPerMeter: 100,
    });
    const s = sim(scene),
      result = s.softGeometry(b, 0.5);
    close(result.points[0].x, 10);
    close(result.points[0].y, 10);
    assert.ok(result.points.at(-1).y > 10);
    assert.deepEqual(result.points, sim(scene).softGeometry(b, 0.5).points);
    assert.deepEqual(
      s.softGeometry(b, 0.2).points,
      sim(scene).softGeometry(b, 0.2).points,
    );
  });
test("physics checkpoint cache hash, rejection and replay", () => {
  const b = rigid("b", {}, { velocityX: 10 }),
    scene = make([b]),
    s = sim(scene);
  s.pose(b, 1);
  const cache = s.export();
  const cached = structuredClone(scene);
  cached.children.at(-1).attributes.cache = "cache.json";
  const c = new Physics(
    cached,
    (n) => n.attributes,
    () => ({ width: 10, height: 10 }),
    () => Buffer.from(JSON.stringify(cache)),
  );
  assert.deepEqual(c.pose(cached.children[1].children[0], 0.5), s.pose(b, 0.5));
  assert.throws(
    () =>
      new Physics(
        cached,
        (n) => n.attributes,
        () => ({ width: 10, height: 10 }),
        () => Buffer.from("{}"),
      ),
    /stale/,
  );
});
for (const type of [
  "directional",
  "wind",
  "radial",
  "vortex",
  "turbulence",
  "drag",
  "attractor-path",
])
  test(`field ${type} is deterministic and observes temporal/radius limits`, () => {
    const a = {
      type,
      strength: 10,
      forceX: 3,
      forceY: 4,
      scale: 5,
      path: "M0 0 L10 0",
      seed: 4,
      start: 1,
      end: 3,
      radius: 50,
    };
    const v = field(a, 3, 4, 1, 2, 2);
    assert.ok(v.every(Number.isFinite));
    assert.deepEqual(v, field(a, 3, 4, 1, 2, 2));
    assert.deepEqual(field(a, 3, 4, 1, 2, 0), [0, 0]);
    assert.deepEqual(field(a, 60, 0, 0, 0, 2), [0, 0]);
  });
test("particle births, bursts, variance, curves and deterministic seeking", () => {
  const e = node(
    "particleEmitter",
    {
      id: "e",
      rate: 10,
      lifetime: 2,
      speed: 10,
      direction: 0,
      emitterShape: "point",
      seed: 42,
      size: 4,
      sizeEnd: 8,
    },
    [node("burst", { time: 0, count: 2, repeat: 1, interval: 0.5 })],
  );
  const a = particleStates(e, 1, (n) => n.attributes);
  assert.equal(a.length, 14);
  assert.deepEqual(
    a,
    particleStates(e, 1, (n) => n.attributes),
  );
  assert.ok(a.some((p) => p.size > 4));
  assert.ok(a.some((p) => Math.abs(p.x - 10) < 0.01));
  assert.notEqual(random(1, 2, 3), random(1, 2, 4));
  const fading = node(
    "particleEmitter",
    {
      rate: 0,
      lifetime: 1,
      lifetimeVariance: 0.2,
      speed: 20,
      speedVariance: 10,
      size: 4,
      sizeVariance: 2,
      rotationVariance: 15,
      angularVelocity: 10,
      angularVelocityVariance: 2,
      turbulence: 3,
      drag: 1,
      orientToVelocity: true,
      gravityY: 5,
    },
    [node("burst", { time: 0, count: 10 })],
  );
  assert.equal(particleStates(fading, 2, (n) => n.attributes).length, 0);
  assert.equal(particleStates(fading, 0.5, (n) => n.attributes).length, 10);
});
for (const shape of ["point", "rect", "ellipse", "line", "path", "asset-alpha"])
  test(`particle emitter ${shape} consumes geometry`, () => {
    const e = node(
      "particleEmitter",
      {
        rate: 0,
        lifetime: 2,
        speed: 0,
        emitterShape: shape,
        emitterPath: "M0 0 L10 10",
        emitterWidth: 10,
        emitterHeight: 10,
        emitterAsset: "a",
      },
      [node("burst", { time: 0, count: 4 })],
    );
    const states = particleStates(e, 0.1, (n) => n.attributes, {
      image: () => ({
        width: 1,
        height: 1,
        data: new Float32Array([1, 1, 1, 1]),
      }),
    });
    assert.equal(states.length, 4);
    assert.ok(
      states.every((p) => p.x >= 0 && p.x <= 10 && p.y >= 0 && p.y <= 10),
    );
  });
for (const preset of [
  "smoke",
  "sparks",
  "dust",
  "rain",
  "snow",
  "confetti",
  "fire",
  "bubbles",
  "bokeh",
  "glitter",
])
  test(`particle ${preset} renders and honours explicit overrides`, () => {
    const r = render(
      `<particleEmitter id="p" preset="${preset}" x="32" y="24" rate="0" speed="0" direction="0" lifetime="2" size="10"><burst time="0" count="2"/></particleEmitter>`,
    );
    const a = r.render(0.5);
    assert.ok(
      a.data.some((v) => v > 0),
      preset,
    );
    r.render(1);
    assert.deepEqual(r.render(0.5).data, a.data);
    const e = node("particleEmitter", { preset, speed: 0 });
    e.specifiedAttributes = ["speed"];
    assert.equal(particleAttributes(e, e.attributes).speed, 0);
  });
for (const type of [
  "bend",
  "twist",
  "wave",
  "squash",
  "stretch",
  "bulge",
  "pinch",
  "spherize",
  "ripple",
  "turbulence",
  "mesh-warp",
  "puppet",
  "corner-pin",
])
  test(`deform ${type} is finite and changes geometry`, () => {
    const a = {
      type,
      amount: 0.3,
      frequency: 2,
      phase: 0.2,
      rows: 2,
      cols: 2,
      seed: 5,
      corners: [0, 0, 110, 0, 90, 100, 0, 100],
    };
    const controls =
      type === "puppet"
        ? [{ restX: 50, restY: 50, x: 10, y: 5, amount: 1 }]
        : [{ row: 0, col: 0, x: 10, y: 10 }];
    const p = { x: 25, y: 30 },
      q = deformPoint(p, a, 100, 100, controls);
    assert.ok(Number.isFinite(q.x + q.y));
    assert.notDeepEqual(q, p, type);
    assert.deepEqual(q, deformPoint(p, a, 100, 100, controls));
  });
test("skin bind matrices, explicit weights and bone hierarchy", () => {
  const a = node("bone", { id: "root", x: 0, y: 0, length: 10 }),
    b = node("bone", { id: "tip", parent: "root", x: 10, y: 0, length: 10 });
  const skeleton = node("skeleton", { id: "s" }, [a, b]);
  assert.deepEqual(
    skinPoint({ x: 5, y: 0 }, skeleton, (n) => n.attributes),
    { x: 5, y: 0 },
  );
  const p = skinPoint(
    { x: 5, y: 0 },
    skeleton,
    (n) => ({ ...n.attributes, rotation: 90 }),
    [{ bone: "root", weight: 1 }],
  );
  close(p.x, 0);
  close(p.y, 5);
  assert.throws(
    () =>
      skinPoint({ x: 1, y: 0 }, skeleton, (n) => n.attributes, [
        { bone: "root", weight: -1 },
      ]),
    /weight/,
  );
});
test("deformed raster and soft body are visible through compositor", () => {
  const r = render(
    '<shape id="s" shape="rect" x="10" y="10" width="20" height="20" fill="#FF0000"><deform><modifier type="corner-pin" corners="0 0 30 0 20 20 0 20"/></deform></shape>',
  );
  assert.ok(r.render(0).data.some((v) => v));
  const s = render(
    '<shape id="s" shape="rect" x="10" y="10" width="20" height="20"><softBody rows="3" cols="3" pin="top"/></shape>',
    '<physics gravityY="-1"/>',
  );
  assert.notDeepEqual(s.render(0.5).data, s.render(0).data);
  const p = render(
    '<shape id="s" shape="rect" x="10" y="10" width="10" height="10"><rigidBody velocityX="10"/></shape>',
    '<physics gravityY="0"/>',
  );
  assert.notDeepEqual(p.render(0.5).data, p.render(0).data);
});
test("tracking adapters interpolate real values and reject malformed content", () => {
  for (const [format, text] of [
    ["json", '[{"time":0,"x":0,"y":0},{"time":1,"x":10,"y":20}]'],
    ["csv", "time,x,y\n0,0,0\n1,10,20"],
    ["nuke", "0 0 0 0 0 0 0\n24 10 20 0 0 0 0"],
    [
      "after-effects",
      "Adobe After Effects Keyframe Data\nUnits Per Second 24\nPosition\n0 0 0\n24 10 20",
    ],
    ["mocha", "0 0 0 0 0 0 0 0 0\n24 10 20 20 20 20 30 10 30"],
  ]) {
    const keys = parseTracking(text, format, 24);
    close(sampleTracking(keys, 0.5).x, 5);
  }
  assert.throws(() => parseTracking("time,x\n0,NaN", "csv", 24), /invalid/);
  assert.throws(
    () => parseTracking('[{"time":0},{"time":0}]', "json", 24),
    /duplicate/,
  );
});
test("transform constraints cover local/world position, rotation, scale, paths, distances and tracking", () => {
  const target = node("shape", {
    id: "target",
    x: 20,
    y: 10,
    rotation: 40,
    scaleX: 2,
    scaleY: 3,
  });
  for (const type of [
    "parent",
    "look-at",
    "copy-position",
    "copy-rotation",
    "copy-scale",
    "copy-transform",
    "distance",
    "follow-path",
  ]) {
    const item = node("shape", { id: "a", x: 0, y: 0 }, [
      node("transformConstraint", {
        type,
        target: "target",
        path: "M0 0 L10 10",
        progress: 0.5,
        autoOrient: true,
        minDistance: 30,
        maxDistance: 40,
        influence: 1,
      }),
    ]);
    const scene = make([target, item]),
      c = new Constraints(
        scene,
        (n) => n.attributes,
        new Tracking(scene, () => new Uint8Array(), 24),
      ),
      result = c.attributes(item, 0);
    assert.ok(Number.isFinite(result.x + result.y));
    if (type === "copy-position") {
      close(result.x, 20);
      close(result.y, 10);
    }
    if (type === "follow-path") {
      close(result.x, 5);
      close(result.rotation, 45);
    }
  }
  const track = node("trackData", {
      id: "track",
      src: "track.json",
      format: "json",
      footage: "video",
    }),
    item = node("layer", { id: "a", asset: "video", stabilize: true }, [
      node("transformConstraint", { type: "track", target: "track" }),
    ]),
    scene = make([item]);
  scene.children.push(node("tracking", {}, [track]));
  const tracking = new Tracking(
      scene,
      () => Buffer.from('[{"time":0,"x":0},{"time":1,"x":10}]'),
      24,
    ),
    constraints = new Constraints(scene, (n) => n.attributes, tracking);
  close(constraints.attributes(item, 0.5).x, 5);
});
test("two-bone IK reaches target and bend direction changes elbow", () => {
  const target = node("shape", { id: "goal", x: 10, y: 10 }),
    root = node("bone", { id: "root", length: 10 }),
    tip = node("bone", { id: "tip", parent: "root", x: 10, length: 10 }),
    constraint = node("transformConstraint", {
      type: "ik",
      target: "goal",
      point: "tip",
      influence: 1,
      bendPositive: true,
    }),
    skeleton = node("skeleton", { id: "rig" }, [root, tip, constraint]),
    scene = make([target, skeleton]),
    c = new Constraints(
      scene,
      (n) => n.attributes,
      new Tracking(scene, () => new Uint8Array(), 24),
    );
  close(c.attributes(root, 0).rotation, 0);
  close(c.attributes(tip, 0).rotation, 90);
  constraint.attributes.bendPositive = false;
  close(c.attributes(root, 0).rotation, 90);
  close(c.attributes(tip, 0).rotation, -90);
});
test("parented rigid bodies bake rotation, scale, anchors and return equivalent local poses", () => {
  const b = rigid(
    "child",
    { x: 4, y: 6, scaleX: 2, scaleY: 1.5, anchorX: 3, anchorY: 2 },
    { shape: "circle", velocityX: 10 },
  );
  const group = node(
    "group",
    { id: "parent", x: 20, y: 10, rotation: 30, scaleX: 2, scaleY: 2 },
    [b],
  );
  const p = sim(make([group]));
  const local = p.renderPose(b, 0);
  for (const key of ["x", "y", "scaleX", "scaleY"])
    close(local[key], b.attributes[key]);
  close(local.rotation, 0);
  assert.ok(p.pose(b, 1).x > p.pose(b, 0).x);
  const explicit = rigid("ref", { x: 4, y: 6, parent: "parent" }),
    q = sim(make([node("group", { id: "parent", x: 20, y: 10 }), explicit]));
  close(q.pose(explicit, 0).x, 24);
  close(q.renderPose(explicit, 0).x, 4);
});
test("kinematic bodies and soft pins follow parent animation in world coordinates", () => {
  const b = rigid("k", {}, { type: "kinematic" }),
    g = node("group", { id: "g", x: 5 }, [b]),
    scene = make([g]);
  const p = new Physics(
    scene,
    (n, t) => (n === g ? { ...n.attributes, x: 5 + t * 10 } : n.attributes),
    () => ({ width: 10, height: 10 }),
    () => Buffer.alloc(0),
  );
  close(p.pose(b, 1).x, 15);
  const cloth = node("shape", { id: "cloth", x: 3, width: 10, height: 10 }, [
    node("softBody", {
      kind: "cloth",
      rows: 3,
      cols: 3,
      pin: "top",
      mass: 1,
      stiffness: 10,
      selfCollision: true,
    }),
  ]);
  const s = sim(
    make([node("group", { id: "parent", x: 20, rotation: 90 }, [cloth])]),
  );
  close(s.softGeometry(cloth, 0).points[0].x, 20);
  close(s.softGeometry(cloth, 0).points[0].y, 3);
  assert.ok(
    s.softGeometry(cloth, 0.2).points.every((p) => Number.isFinite(p.x)),
  );
});
test("particle collisions bounce both axes and selected fields change trajectories", () => {
  const n = node(
    "particleEmitter",
    {
      seed: 2,
      rate: 0,
      emitterShape: "point",
      velocityX: 20,
      velocityY: 0,
      speed: 20,
      direction: 0,
      spread: 0,
      lifetime: 3,
      collide: true,
      bounce: 1,
      gravityY: 0,
      size: 1,
    },
    [node("burst", { time: 0, count: 1 })],
  );
  const attrs = (n) => n.attributes,
    box = { x: 5, y: -5, width: 5, height: 10 };
  const a = particleStates(n, 0.6, attrs, { colliders: [box] });
  assert.ok(a[0].vx < 0);
  const y = { ...n, attributes: { ...n.attributes, direction: 90 } },
    vertical = particleStates(y, 0.6, attrs, {
      colliders: [{ x: -5, y: 5, width: 10, height: 5 }],
    });
  assert.ok(vertical[0].vy < 0);
  const f = node("forceField", {
      id: "wind",
      type: "directional",
      forceX: 20,
      forceY: 0,
      affects: "particles",
    }),
    still = {
      ...n,
      attributes: { ...n.attributes, collide: false, forceFields: ["wind"] },
    };
  assert.ok(
    particleStates(still, 0.3, attrs, { fields: [f] })[0].vx >
      particleStates(still, 0.3, attrs)[0].vx,
  );
  assert.deepEqual(
    particleStates(
      { ...still, attributes: { ...still.attributes, forceFields: ["other"] } },
      0.3,
      attrs,
      { fields: [f] },
    ),
    particleStates(still, 0.3, attrs),
  );
});
test("field filters, tracking point interpolation and AE channels preserve values", () => {
  for (const type of [
    "directional",
    "wind",
    "radial",
    "vortex",
    "drag",
    "turbulence",
    "attractor-path",
  ]) {
    const a = {
      type,
      path: "M0 0L10 0",
      strength: 4,
      forceX: 2,
      forceY: 3,
      scale: 1,
      seed: 9,
      radius: 10,
      start: 1,
      end: 3,
    };
    assert.deepEqual(field(a, 20, 0, 1, 1, 2), [0, 0]);
    assert.deepEqual(field(a, 0, 0, 1, 1, 0), [0, 0]);
    assert.ok(field(a, 3, 2, 1, 1, 2).every(Number.isFinite));
  }
  const keys = parseTracking(
    "Adobe After Effects 8.0 Keyframe Data\nUnits Per Second 10\nScale\n0 100 200\n10 200 400\nRotation\n0 0\n10 90\nUpper Left\n0 1 2\n10 3 4\nUpper Right\n0 10 20\n10 30 40\nLower Right\n0 50 60\n10 70 80\nLower Left\n0 15 16\n10 17 18",
    "mocha",
    24,
  );
  close(sampleTracking(keys, 0.5).scaleX, 1.5);
  close(sampleTracking(keys, 0.5).rotation, 45);
  assert.deepEqual(sampleTracking(keys, 0.5, "0"), { x: 2, y: 3 });
  assert.throws(() => sampleTracking(keys, 0.5, "missing"), /absent/);
});
test("deformation rejects singular data and skin weights are applied through the compositor", () => {
  assert.throws(
    () => deformPoint({ x: 1, y: 2 }, { type: "unsupported" }, 10, 10),
    /unknown/,
  );
  assert.throws(
    () => deformPoint({ x: 1, y: 2 }, { type: "stretch", amount: -1 }, 10, 10),
    /singular/,
  );
  const b = node("bone", { id: "b", length: 10 }),
    sk = node("skeleton", { id: "sk" }, [b]);
  assert.throws(
    () =>
      skinPoint({ x: 1, y: 2 }, sk, (n) => n.attributes, [
        { bone: "b", weight: -1 },
      ]),
    /invalid skin weight/,
  );
  const p = prepareScene(
    '<scene version="1.1"><project width="48" height="32" fps="8" duration="2" background="#00000000"/><composition><skeleton id="sk" weights="weights.json"><bone id="b" length="12"><animate property="rotation"><key time="0" value="0"/><key time="1" value="25"/></animate></bone></skeleton><shape id="s" shape="rect" x="12" y="8" width="16" height="10" fill="#FFFFFF"><deform><modifier type="skin" skeleton="sk"/></deform></shape></composition></scene>',
  );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const weights = {
    rows: 24,
    cols: 24,
    weights: Array.from({ length: 576 }, () => [{ bone: "b", weight: 1 }]),
  };
  const r = new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => Buffer.from(JSON.stringify(weights)) },
    1,
    p.runtime,
  );
  assert.notDeepEqual(r.render(0).data, r.render(1).data);
  const bad = new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => Buffer.from(JSON.stringify({ ...weights, rows: 2 })) },
    1,
    p.runtime,
  );
  assert.throws(() => bad.render(0), /grid mismatch/);
});
test("physics alpha geometry, floor bounds, force filters and malformed caches fail concretely", () => {
  const image = { width: 2, height: 2, data: new Float32Array(16).fill(1) },
    b = rigid("hull", {}, { shape: "convex-hull" }),
    scene = make([b], { gravityY: -1, bounds: "floor", fixedStep: 0.01 });
  const p = new Physics(
    scene,
    (n) => n.attributes,
    () => ({ width: 10, height: 10 }),
    () => Buffer.alloc(0),
    () => image,
  );
  assert.ok(p.pose(b, 2).y <= 91);
  assert.throws(() => sim(scene), /image provider/);
  const target = rigid("body"),
    f = node("forceField", {
      id: "f",
      type: "directional",
      forceX: 100,
      forceY: 0,
      affects: "bodies",
    }),
    a = sim(make([target], { gravityY: 0 }, [f]));
  assert.ok(a.pose(target, 0.5).x > 10);
  assert.throws(() => a.advance(3000000), /budget/);
  assert.throws(() => sim(make([rigid("bad", {}, { mass: 0 })])), /positive/);
  assert.throws(
    () => sim(make([rigid("bad", {}, { shape: "bad" })])),
    /unsupported/,
  );
  assert.throws(() => sim(make([rigid("bad")], { fixedStep: 2 })), /budget/);
});
test("cache added to an authored XML scene preserves simulation identity and pixels", () => {
  const xml =
    '<scene version="1.1"><project width="32" height="32" fps="8" duration="1" background="#00000000"/><composition><shape id="b" shape="rect" width="8" height="8" fill="#FF0000"><rigidBody velocityX="10"/></shape></composition><physics gravityY="0"/></scene>';
  const a = prepareScene(xml);
  assert.ok(a.ok);
  const first = new FrameRenderer(
    a.runtime.scene,
    a.runtime.tracks,
    { read: () => Buffer.alloc(0) },
    1,
    a.runtime,
  );
  const expected = first.render(0.5),
    bytes = Buffer.from(JSON.stringify(first.physics.export()));
  const b = prepareScene(
    xml.replace(
      '<physics gravityY="0"/>',
      '<physics gravityY="0" cache="poses.json"/>',
    ),
  );
  assert.ok(b.ok);
  const cached = new FrameRenderer(
    b.runtime.scene,
    b.runtime.tracks,
    { read: () => bytes },
    1,
    b.runtime,
  );
  assert.deepEqual(cached.render(0.5).data, expected.data);
  assert.deepEqual(cached.render(0.8).data, first.render(0.8).data);
});
