/** Deterministic particle births and fixed-step trajectories in emitter-local pixels. */
import { motionPath } from "../../eval/path.js";
import { easing } from "../../eval/curves.js";
import { noise } from "../fx/spatial.js";
import { field } from "./fields.js";
import { Surface } from "../surface.js";
import { raster } from "../three/raster.js";
import { Compositor } from "../compositor.js";
import { collideParticle } from "./particle-collision.js";
import { inverse, point } from "../geometry/matrix.js";
import { frameIndex } from "../../eval/frames.js";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
const presets = {
  smoke: {
    speed: 25,
    lifetime: 4,
    size: 12,
    sizeEnd: 60,
    color: "#77777790",
    colorEnd: "#AAAAAA00",
    opacityEnd: 0,
    drag: 0.3,
    turbulence: 14,
  },
  sparks: {
    speed: 220,
    lifetime: 0.8,
    size: 2,
    shape: "streak",
    trail: 15,
    color: "#FFCE65",
    gravityY: 180,
    opacityEnd: 0,
    spread: 65,
  },
  dust: {
    speed: 8,
    lifetime: 5,
    size: 2,
    color: "#DCCBA080",
    turbulence: 4,
    opacityEnd: 0,
  },
  rain: {
    speed: 600,
    direction: 90,
    lifetime: 1.5,
    size: 1,
    shape: "streak",
    trail: 24,
    color: "#AACCFF80",
  },
  snow: {
    speed: 35,
    direction: 90,
    lifetime: 6,
    size: 4,
    color: "#FFFFFF",
    turbulence: 14,
    drag: 0.1,
  },
  confetti: {
    speed: 120,
    direction: -90,
    lifetime: 3,
    size: 6,
    shape: "square",
    gravityY: 100,
    angularVelocity: 160,
    angularVelocityVariance: 100,
    spread: 80,
  },
  fire: {
    speed: 65,
    lifetime: 1.3,
    size: 14,
    sizeEnd: 2,
    color: "#FFAF30C0",
    colorEnd: "#D0200000",
    turbulence: 24,
    opacityEnd: 0,
    spread: 25,
  },
  bubbles: {
    speed: 25,
    lifetime: 5,
    size: 8,
    sizeEnd: 12,
    color: "#BBEFFF60",
    turbulence: 5,
  },
  bokeh: {
    speed: 5,
    lifetime: 5,
    size: 20,
    color: "#EACCAA60",
    opacityEnd: 0,
    sizeEnd: 40,
  },
  glitter: {
    speed: 10,
    lifetime: 2,
    size: 3,
    color: "#FFFAC0",
    turbulence: 4,
    opacityEnd: 0,
  },
};
/** First burst particle id; continuous births (at most 200000) stay below it. */
const BURST_IDS = 0x40000000;
/** First random lane of asset-alpha rejection attempts, clear of the per-particle lanes 0-10. */
const ASSET_LANES = 0x10000;
/** Samples per second of the emitter transform grid used by force fields and collisions. */
const GRID = 120;
/** Stable independent random streams; no call-order-dependent RNG state.
 * @param {number} seed @param {number} id @param {number} lane */
export function random(seed, id, lane) {
  let x =
    (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(lane + 1, 0x85ebca6b)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
/** @param {Node} node @param {Record<string,any>} a */
export function particleAttributes(node, a) {
  const out = { ...a };
  const preset = /** @type {Record<string,Record<string,any>>} */ (presets)[
    String(a.preset)
  ];
  for (const [key, value] of Object.entries(preset ?? {}))
    if (
      !node.specifiedAttributes?.includes(key) &&
      !node.children.some((c) => c.attributes.property === key)
    )
      out[key] = value;
  return out;
}
/** @typedef {{width:number,height:number,data:Float32Array}} Image */
/** @param {Node} node @param {number} time @param {(n:Node,t:number)=>Record<string,any>} attributes @param {{fields?:Node[],image?:(id:string)=>Image,colliders?:{x:number,y:number,width:number,height:number}[],acceleration?:(a:Record<string,any>,x:number,y:number,vx:number,vy:number,t:number)=>number[],collision?:(start:{x:number,y:number},velocity:{x:number,y:number},radius:number,t:number,dt:number,bounce:number)=>{x:number,y:number,vx:number,vy:number}}} [context] */
export function particleStates(node, time, attributes, context = {}) {
  const a = particleAttributes(node, attributes(node, time)),
    start = Number(a.start ?? 0) - Number(a.preroll ?? 0),
    dt = 1 / 120;
  const seed = Number(BigInt(String(a.seed ?? 0)) & 0xffffffffn),
    max = Number(a.maxParticles ?? 10000);
  if (max > 100000 || time - start > 600)
    throw new Error("particle count/time budget exceeded");
  /** @type {{time:number,id:number}[]} */ const births = [];
  let count = 0,
    carry = 0;
  const end = Math.min(time, Number(a.end ?? time));
  for (let t = start; t < end; t += dt) {
    const width = Math.min(dt, end - t),
      rate = Number(particleAttributes(node, attributes(node, t)).rate ?? 10),
      next = carry + rate * width;
    for (let k = 1; k <= Math.floor(next + 1e-10); k++) {
      births.push({
        time: t + (k - carry) / Math.max(rate, 1e-10),
        id: count++,
      });
      if (count > 200000) throw new Error("particle birth budget exceeded");
    }
    carry = next - Math.floor(next + 1e-10);
  }
  // Burst ids live in their own namespace, fixed by document order, burst
  // index, repeat and j, so they do not shift as continuous births accrue.
  let burstBase = BURST_IDS;
  for (const burst of node.children.filter((n) => n.name === "burst")) {
    const b = attributes(burst, time),
      n = Math.max(0, Math.ceil(Number(b.count ?? 0)) || 0),
      repeats = Math.max(0, Math.floor(Number(b.repeat ?? 0)) || 0);
    for (let repeat = 0; repeat <= repeats; repeat++) {
      const t =
        Number(a.start ?? 0) +
        Number(b.time ?? 0) +
        repeat * Number(b.interval ?? 0);
      if (t > time) break;
      if (count + n > 200000) throw new Error("particle birth budget exceeded");
      count += n;
      for (let j = 0; j < n; j++)
        births.push({ time: t, id: burstBase + repeat * n + j });
    }
    burstBase += (repeats + 1) * n;
  }
  births.sort((a, b) => a.time - b.time || a.id - b.id);
  /** @type {Array<{x:number,y:number,vx:number,vy:number,size:number,rotation:number,age:number,life:number,q:number,id:number}>} */ const states =
    [];
  let integration = 0;
  const shape = String(a.emitterShape ?? "rect"),
    path = shape === "path" ? motionPath(String(a.emitterPath)) : undefined;
  const asset =
    shape === "asset-alpha"
      ? context.image?.(String(a.emitterAsset))
      : undefined;
  if (shape === "asset-alpha" && !asset)
    throw new Error("asset-alpha emitter requires an image");
  for (const birth of births) {
    const initial = particleAttributes(node, attributes(node, birth.time)),
      rnd = (/** @type {number} */ lane) => random(seed, birth.id, lane),
      life = Math.max(
        1e-6,
        Number(initial.lifetime ?? 1) +
          (rnd(0) * 2 - 1) * Number(initial.lifetimeVariance ?? 0),
      ),
      age = time - birth.time;
    if (age < 0 || age >= life) continue;
    let x = 0,
      y = 0;
    const w = Number(initial.emitterWidth ?? 0),
      h = Number(initial.emitterHeight ?? 0);
    if (shape === "rect") {
      x = rnd(1) * w;
      y = rnd(2) * h;
    } else if (shape === "ellipse") {
      const r = Math.sqrt(rnd(1)),
        theta = rnd(2) * Math.PI * 2;
      x = w / 2 + ((Math.cos(theta) * w) / 2) * r;
      y = h / 2 + ((Math.sin(theta) * h) / 2) * r;
    } else if (shape === "line") {
      x = rnd(1) * w;
      y = rnd(1) * h;
    } else if (path) {
      const p = path.getPointAtLength(path.getTotalLength() * rnd(1));
      x = p.x;
      y = p.y;
    } else if (asset) {
      let accepted = false;
      for (let attempt = 0; attempt < 1024; attempt++) {
        const lane = ASSET_LANES + attempt * 3,
          px = Math.floor(rnd(lane) * asset.width),
          py = Math.floor(rnd(lane + 1) * asset.height);
        if (
          rnd(lane + 2) < Number(asset.data[(py * asset.width + px) * 4 + 3])
        ) {
          x = ((px + 0.5) / asset.width) * (w || asset.width);
          y = ((py + 0.5) / asset.height) * (h || asset.height);
          accepted = true;
          break;
        }
      }
      if (!accepted) continue;
    }
    const angle =
        ((Number(initial.direction ?? -90) +
          ((rnd(6) * 2 - 1) * Number(initial.spread ?? 0)) / 2) *
          Math.PI) /
        180,
      speed =
        Number(initial.speed ?? 100) +
        (rnd(7) * 2 - 1) * Number(initial.speedVariance ?? 0);
    let vx = Math.cos(angle) * speed,
      vy = Math.sin(angle) * speed;
    for (let t = birth.time; t < time - 1e-10; t += dt) {
      if (++integration > 4000000)
        throw new Error("particle integration budget exceeded");
      const h = Math.min(dt, time - t),
        live = particleAttributes(node, attributes(node, t));
      let ax = Number(live.gravityX ?? 0),
        ay = Number(live.gravityY ?? 0),
        scale = Number(live.turbulenceScale ?? 100),
        turbulence = Number(live.turbulence ?? 0);
      ax += turbulence * (2 * noise(x / scale + t, y / scale, seed) - 1);
      ay += turbulence * (2 * noise(x / scale, y / scale + t, seed + 1) - 1);
      for (const f of context.fields ?? []) {
        const fa = attributes(f, t);
        if (
          fa.affects === "bodies" ||
          (a.forceFields && !a.forceFields.includes(fa.id))
        )
          continue;
        const acceleration = context.acceleration
          ? context.acceleration(fa, x, y, vx, vy, t)
          : field(
              fa,
              x + Number(live.x ?? 0),
              y + Number(live.y ?? 0),
              vx,
              vy,
              t,
            );
        ax += Number(acceleration[0]);
        ay += Number(acceleration[1]);
      }
      const damping = Math.exp(-Number(live.drag ?? 0) * h);
      vx = (vx + ax * h) * damping;
      vy = (vy + ay * h) * damping;
      const oldX = x,
        oldY = y;
      x += vx * h;
      y += vy * h;
      if (live.collide && context.collision) {
        const q = (t - birth.time) / life,
          size = Math.max(
            0,
            Number(initial.size ?? 4) +
              (rnd(8) * 2 - 1) * Number(initial.sizeVariance ?? 0),
          ),
          radius =
            (size +
              (Number(live.sizeEnd ?? size) - size) *
                easing(String(live.sizeCurve ?? "linear"))(q)) /
            2,
          hit = context.collision(
            { x: oldX, y: oldY },
            { x: vx, y: vy },
            radius,
            t,
            h,
            Number(live.bounce ?? 0.3),
          );
        x = hit.x;
        y = hit.y;
        vx = hit.vx;
        vy = hit.vy;
      }
      if (live.collide)
        for (const box of context.colliders ?? []) {
          const px = x + Number(live.x ?? 0),
            py = y + Number(live.y ?? 0);
          if (
            px >= box.x &&
            px <= box.x + box.width &&
            py >= box.y &&
            py <= box.y + box.height
          ) {
            const bounce = Number(live.bounce ?? 0.3);
            if (
              oldY + Number(live.y ?? 0) < box.y ||
              oldY + Number(live.y ?? 0) > box.y + box.height
            ) {
              vy = -vy * bounce;
              y = oldY;
            } else {
              vx = -vx * bounce;
              x = oldX;
            }
          }
        }
    }
    const q = age / life,
      size0 = Math.max(
        0,
        Number(initial.size ?? 4) +
          (rnd(8) * 2 - 1) * Number(initial.sizeVariance ?? 0),
      ),
      size =
        size0 +
        (Number(a.sizeEnd ?? size0) - size0) *
          easing(String(a.sizeCurve ?? "linear"))(q);
    const rotation =
      Number(initial.rotation0 ?? 0) +
      (rnd(9) * 2 - 1) * Number(initial.rotationVariance ?? 0) +
      age *
        (Number(initial.angularVelocity ?? 0) +
          (rnd(10) * 2 - 1) * Number(initial.angularVelocityVariance ?? 0)) +
      (a.orientToVelocity ? (Math.atan2(vy, vx) * 180) / Math.PI : 0);
    states.push({ x, y, vx, vy, size, rotation, age, life, q, id: birth.id });
    if (states.length > max) states.shift();
  }
  return states;
}
/** @param {Node} node @param {import('../frame.js').FrameRenderer} host @param {import('../geometry/matrix.js').Matrix} matrix @param {(spec:string,x:number,y:number)=>number[]} paint */
export function renderParticles(node, host, matrix, paint) {
  const span = host.runtime?.timeline.spans.get(node),
    offset = span?.composition(0) ?? 0,
    rate = (span?.composition(1) ?? 1) - offset,
    time = span?.composition(host.time) ?? host.time;
  const attrs = (/** @type {Node} */ n, /** @type {number} */ t) =>
      host.rawAttributes(n, rate ? (t - offset) / rate : host.time),
    a = particleAttributes(node, attrs(node, time));
  const image = (/** @type {string} */ id) => {
    const asset = host.assets.get(id);
    if (!asset) throw new Error("unknown particle image");
    return host.io.media ? host.io.media(asset, host, node) : host.image(asset);
  };
  const fixtures = host.physics?.particleColliders() ?? [],
    matrices = new Map();
  /** @param {number} global @returns {import('../geometry/matrix.js').Matrix} */
  const exact = (global) => {
    if (global === host.time) return matrix;
    if (matrices.has(global)) return matrices.get(global);
    const before = host.time;
    try {
      host.time = global;
      const c = new Compositor(host);
      c.measure(
        host.composition,
        [host.scale, 0, 0, host.scale, 0, 0],
        Number(
          host.scene.children.find((n) => n.name === "project")?.attributes
            .width,
        ),
        Number(
          host.scene.children.find((n) => n.name === "project")?.attributes
            .height,
        ),
      );
      const m = c.world(node);
      matrices.set(global, m);
      return m;
    } finally {
      host.time = before;
    }
  };
  // Every particle steps from its own birth time, so step instants rarely
  // repeat and a full layout pass per instant is prohibitive. Matrices are
  // measured on a 1/120 s grid; where both ends of a grid cell agree the
  // transform is taken as constant across the cell (exact for static and
  // piecewise-static transforms), otherwise the instant is measured exactly.
  const matrixAt = (/** @type {number} */ local) => {
    const global = rate ? (local - offset) / rate : host.time;
    if (global === host.time) return matrix;
    const i = frameIndex(local, GRID),
      m0 = exact((i / GRID - offset) / rate),
      m1 = exact(((i + 1) / GRID - offset) / rate);
    return m0.every((v, k) => v === m1[k]) ? m0 : exact(global);
  };
  const states = particleStates(node, time, attrs, {
    fields: host.scene.children
      .find((n) => n.name === "physics")
      ?.children.filter((n) => n.name === "forceField"),
    image,
    acceleration: (fa, x, y, vx, vy, t) => {
      const m = matrixAt(t),
        inv = inverse(m);
      if (!inv) throw new Error("singular particle transform");
      const p = point(m, x, y),
        s = host.scale,
        f = field(
          fa,
          p.x / s,
          p.y / s,
          (m[0] * vx + m[2] * vy) / s,
          (m[1] * vx + m[3] * vy) / s,
          rate ? (t - offset) / rate : host.time,
        );
      return [
        (inv[0] * Number(f[0]) + inv[2] * Number(f[1])) * s,
        (inv[1] * Number(f[0]) + inv[3] * Number(f[1])) * s,
      ];
    },
    collision: host.physics
      ? (start, velocity, radius, t, dt, bounce) => {
          const m0 = matrixAt(t),
            m1 = matrixAt(t + dt),
            inv = inverse(m1);
          if (!inv) throw new Error("singular particle transform");
          const scale = host.scale,
            from = point(m0, start.x, start.y),
            to = point(
              m1,
              start.x + velocity.x * dt,
              start.y + velocity.y * dt,
            ),
            carried = point(m1, start.x, start.y),
            frameV = {
              x: (carried.x - from.x) / dt / scale,
              y: (carried.y - from.y) / dt / scale,
            },
            v = {
              x: (to.x - from.x) / dt / scale,
              y: (to.y - from.y) / dt / scale,
            },
            colliders = fixtures.map((c) => ({
              ...c,
              activateAt: Number(c.activateAt ?? 0) * rate + offset,
              pose: (/** @type {number} */ local) =>
                c.pose(rate ? (local - offset) / rate : host.time),
            })),
            steps = Math.max(
              1,
              Math.ceil(
                dt /
                  Math.max(1e-12, Math.abs(rate || 1)) /
                  (host.physics?.dt ?? dt),
              ),
            ),
            radiusWorld =
              (radius *
                Math.max(Math.hypot(m1[0], m1[1]), Math.hypot(m1[2], m1[3]))) /
              scale;
          let hit = { x: from.x / scale, y: from.y / scale, vx: v.x, vy: v.y };
          for (let i = 0; i < steps; i++)
            hit = collideParticle(
              colliders,
              hit,
              { x: hit.vx, y: hit.vy },
              radiusWorld,
              t + (i * dt) / steps,
              dt / steps,
              bounce,
            );
          const p = point(inv, hit.x * scale, hit.y * scale),
            vx = hit.vx - frameV.x,
            vy = hit.vy - frameV.y;
          return {
            ...p,
            vx: (inv[0] * vx + inv[2] * vy) * scale,
            vy: (inv[1] * vx + inv[3] * vy) * scale,
          };
        }
      : undefined,
  });
  const atlas =
    a.shape === "sprite"
      ? host.color.input(image(String(a.sprite)))
      : undefined;
  const disc = new Surface(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      let alpha = Math.max(0, Math.min(1, 16 - Math.hypot(x - 15.5, y - 15.5)));
      if (a.preset === "bubbles")
        alpha *= Math.max(0, Math.min(1, Math.hypot(x - 15.5, y - 15.5) - 12));
      if (a.preset === "smoke" || a.preset === "bokeh" || a.preset === "fire")
        alpha *= Math.max(0, 1 - Math.hypot(x - 15.5, y - 15.5) / 16);
      disc.data.set([alpha, alpha, alpha, alpha], (y * 32 + x) * 4);
    }
  /** @type {import('../three/raster.js').Face[]} */ const faces = [];
  for (const p of states) {
    const from = paint(String(a.color ?? "#FFFFFF"), p.x, p.y),
      to = paint(String(a.colorEnd ?? a.color ?? "#FFFFFF"), p.x, p.y),
      q = easing(String(a.colorCurve ?? "linear"))(p.q);
    let alpha = Number(from[3]) + (Number(to[3]) - Number(from[3])) * q;
    alpha *= 1 + (Number(a.opacityEnd ?? 1) - 1) * p.q;
    if (a.preset === "glitter")
      alpha *= 0.25 + 0.75 * Math.sin(p.age * 20 + p.id) ** 2;
    const c = [0, 1, 2].map(
      (k) => (Number(from[k]) + (Number(to[k]) - Number(from[k])) * q) * alpha,
    );
    c.push(alpha);
    const angle =
        a.shape === "streak"
          ? Math.atan2(p.vy, p.vx)
          : (p.rotation * Math.PI) / 180,
      cx = Math.cos(angle),
      sy = Math.sin(angle),
      w =
        a.shape === "streak" ? Math.max(p.size, Number(a.trail ?? 0)) : p.size,
      h = p.size;
    const cols = Number(a.spriteCols ?? 1),
      rows = Number(a.spriteRows ?? 1),
      frame = frameIndex(p.age, Number(a.spriteFps ?? 0)) % (cols * rows),
      u0 = atlas ? (frame % cols) / cols : 0,
      v0 = atlas ? Math.floor(frame / cols) / rows : 0,
      du = atlas ? 1 / cols : 1,
      dv = atlas ? 1 / rows : 1;
    const vertices = [
      [-0.5, -0.5, 0, 0],
      [-0.5, 0.5, 0, 1],
      [0.5, 0.5, 1, 1],
      [0.5, -0.5, 1, 0],
    ].map((v) => {
      const x = Number(v[0]) * w,
        y = Number(v[1]) * h,
        pos = point(matrix, p.x + x * cx - y * sy, p.y + x * sy + y * cx);
      return {
        p: /** @type {[number,number,number]} */ ([pos.x, pos.y, 1]),
        uv: /** @type {[number,number]} */ ([
          u0 + Number(v[2]) * du,
          v0 + Number(v[3]) * dv,
        ]),
      };
    });
    faces.push({
      vertices,
      color: c,
      texture: atlas ?? (a.shape === "disc" ? disc : undefined),
      doubleSided: true,
    });
  }
  return raster(host.width, host.height, faces, {
    near: 0.1,
    far: 2,
    focal: 1,
    ortho: 1,
    cx: 0,
    cy: 0,
  });
}
