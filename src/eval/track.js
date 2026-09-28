/**
 * Typed keyframe tracks with deterministic random-access evaluation.
 *
 * Every curve is resolved when the scene is compiled, so evaluation at a frame
 * is a binary search plus one closed-form call, with typed interpolation and compile-time diagnostics for invalid combinations.
 */
import { Codes, diagnostic } from '../diagnostics.js';
import { MODEL } from '../generated/model.js';
import { clocks } from './clock.js';
import { propertyValue, interpolate, simple, spring } from './value.js';
import { cubicBezier, easing, UnsupportedCurve } from './curves.js';

/** @typedef {import('../xsd/validate.js').ValidNode} SceneNode */
/** @typedef {import('../diagnostics.js').Diagnostic} Diagnostic */
/** @typedef {{ property: string, additive: boolean, keyTimes: readonly number[], timeAt(t:number):number, valueAt(t: number): import('./value.js').Value }} Track */

class TrackError extends Error {
  /** @param {import('../diagnostics.js').DiagnosticCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** @param {number} a @param {number} m */
const mod = (a, m) => ((a % m) + m) % m;

/**
 * @param {SceneNode} key
 * @param {string} curve
 * @returns {(u: number) => number}
 */
function segmentCurve(key, curve) {
  if (curve === 'spring')
    return (u) =>
      spring(
        u,
        Number(key.attributes.stiffness),
        Number(key.attributes.damping),
        Number(key.attributes.mass),
      );
  if (curve === 'tcb') return (u) => u;
  if (curve === 'step' || curve === 'hold') return () => 0;
  if (curve === 'steps') {
    const n = key.attributes.steps;
    if (typeof n !== 'number')
      throw new TrackError(Codes.ANIM_VALUE, 'steps interpolation needs key/@steps');
    return key.attributes.stepPosition === 'start'
      ? (u) => Math.min(1, Math.ceil(u * n) / n)
      : (u) => Math.floor(u * n) / n;
  }
  if (curve === 'cubic-bezier') {
    const b = key.attributes.bezier;
    const p = typeof b === 'string' ? b.split(',').map(Number) : [];
    if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) {
      throw new TrackError(
        Codes.ANIM_VALUE,
        'cubic-bezier interpolation needs key/@bezier "x1,y1,x2,y2"',
      );
    }
    try {
      return cubicBezier(
        /** @type {number} */ (p[0]),
        /** @type {number} */ (p[1]),
        /** @type {number} */ (p[2]),
        /** @type {number} */ (p[3]),
      );
    } catch (e) {
      throw new TrackError(Codes.ANIM_VALUE, /** @type {Error} */ (e).message);
    }
  }
  try {
    return easing(curve);
  } catch (e) {
    // easing() throws only UnsupportedCurve.
    throw new TrackError(Codes.ANIM_UNSUPPORTED, /** @type {UnsupportedCurve} */ (e).message);
  }
}

/**
 * @param {SceneNode} animate
 * @param {{ start: number, end: number }} span owning node's interval on the composition timeline
 * @param {SceneNode} owner
 * @param {ReturnType<typeof clocks>} timeline
 * @param {(value:import('./value.js').Value,type:string)=>import('./value.js').Value} resolve
 * @returns {Track}
 */
function compileTrack(animate, span, owner, timeline, resolve) {
  const a = animate.attributes;
  const keys = animate.children.filter((k) => k.name === 'key');
  const prop = String(a.property);
  const times = keys.map(
    (k) =>
      Number(k.attributes.time) +
      (k.attributes.marker === undefined ? 0 : timeline.marker(k.attributes.marker)),
  );
  const type = MODEL.complexTypes[owner.type]?.attributes[prop]?.type ?? 'xs:double';
  const values = keys.map((k) =>
    resolve(propertyValue(owner, prop, String(k.attributes.value)), type),
  );
  for (const key of keys)
    for (const h of ['easeIn', 'easeOut'])
      if (
        key.attributes[h] !== undefined &&
        String(key.attributes[h])
          .split(',')
          .map(Number)
          .some((v) => v < 0 || v > 1)
      )
        throw new TrackError(Codes.ANIM_VALUE, 'ease handles must be normalized to [0,1]');
  const color = simple.reaches(type, 'colorType') || simple.reaches(type, 'paintType');
  const pair = owner.children.find(
    (n) =>
      n.name === 'animate' &&
      n.attributes.property === (prop === 'x' ? 'y' : prop === 'y' ? 'x' : ''),
  );
  const paired = pair?.children
    .filter((n) => n.name === 'key')
    .map((n) => Number(n.attributes.value));
  const numeric = values.every((v) => typeof v === 'number');
  if (keys.some((k) => k.attributes.roving === true) && !numeric)
    throw new TrackError(Codes.ANIM_VALUE, 'roving requires numeric positions');
  if (
    keys.some(
      (k) => k.attributes.spatialIn !== undefined || k.attributes.spatialOut !== undefined,
    ) &&
    !['x', 'y'].includes(prop)
  )
    throw new TrackError(Codes.ANIM_VALUE, 'spatial tangents require x/y properties');
  if (
    !numeric &&
    keys.some((k) => (k.attributes.interpolation ?? a.defaultInterpolation) === 'tcb')
  )
    throw new TrackError(Codes.ANIM_VALUE, 'TCB requires numeric values');
  if (a.additive === true && !numeric)
    throw new TrackError(Codes.ANIM_VALUE, 'additive tracks require numeric values');
  if (keys[0]?.attributes.roving === true || keys.at(-1)?.attributes.roving === true)
    throw new TrackError(Codes.ANIM_VALUE, 'endpoint keys cannot rove');
  for (let first = 1; first < keys.length - 1; first++) {
    if (keys[first]?.attributes.roving !== true) continue;
    let last = first;
    while (keys[last]?.attributes.roving === true) last++;
    const distances = [0];
    for (let j = first; j <= last; j++)
      distances.push(
        Number(distances.at(-1)) +
          Math.hypot(
            Number(values[j]) - Number(values[j - 1]),
            paired?.length === values.length ? Number(paired[j]) - Number(paired[j - 1]) : 0,
          ),
      );
    const total = Number(distances.at(-1));
    for (let j = first; j < last; j++)
      times[j] =
        Number(times[first - 1]) +
        (Number(times[last]) - Number(times[first - 1])) *
          (total
            ? Number(distances[j - first + 1]) / total
            : (j - first + 1) / (last - first + 1));
    first = last;
  }
  for (let i = 1; i < times.length; i++) {
    if (/** @type {number} */ (times[i]) < /** @type {number} */ (times[i - 1])) {
      throw new TrackError(Codes.ANIM_ORDER, `key times must not decrease (key ${i + 1})`);
    }
  }
  const fallback = /** @type {string} */ (a.defaultInterpolation);
  const curves = keys
    .slice(0, -1)
    .map((k) =>
      segmentCurve(k, /** @type {string} */ (k.attributes.interpolation ?? fallback)),
    );
  const n = keys.length;
  const t0 = /** @type {number} */ (times[0]);
  const tn = /** @type {number} */ (times[n - 1]);
  const v0 = /** @type {import('./value.js').Value} */ (values[0]);
  const vn = /** @type {import('./value.js').Value} */ (values[n - 1]);
  const range = tn - t0;

  /** @param {number} t within [t0, tn] */
  const inside = (t) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (/** @type {number} */ (times[mid]) <= t) lo = mid;
      else hi = mid - 1;
    }
    if (lo === n - 1) return vn;
    const ta = /** @type {number} */ (times[lo]);
    const tb = /** @type {number} */ (times[lo + 1]);
    const va = /** @type {import('./value.js').Value} */ (values[lo]);
    const vb = /** @type {import('./value.js').Value} */ (values[lo + 1]);
    let u = (t - ta) / (tb - ta);
    if (!numeric && !color) return interpolate(va, vb, u);
    const ka = keys[lo],
      kb = keys[lo + 1];
    const attr = ka?.attributes ?? {};
    if (attr.easeOut !== undefined || kb?.attributes.easeIn !== undefined) {
      const out = String(attr.easeOut ?? '0.3333333333333333,1')
        .split(',')
        .map(Number);
      const inn = String(kb?.attributes.easeIn ?? '0.3333333333333333,1')
        .split(',')
        .map(Number);
      u = cubicBezier(
        Number(out[0]),
        Number(out[0]) * Number(out[1]),
        1 - Number(inn[0]),
        1 - Number(inn[0]) * Number(inn[1]),
      )(u);
    } else u = /** @type {(u:number)=>number} */ (curves[lo])(u);
    if (numeric && (attr.interpolation ?? fallback) === 'tcb') {
      const p = Number(values[Math.max(0, lo - 1)]),
        q = Number(values[Math.min(n - 1, lo + 2)]);
      const v = Number(va),
        w = Number(vb),
        T = Number(attr.tension),
        C = Number(attr.continuity),
        B = Number(attr.bias);
      const next = kb?.attributes ?? {},
        t1 = Number(next.tension),
        c1 = Number(next.continuity),
        b1 = Number(next.bias);
      const m0 = ((1 - T) * ((1 + C) * (1 + B) * (v - p) + (1 - C) * (1 - B) * (w - v))) / 2;
      const m1 =
        ((1 - t1) * ((1 - c1) * (1 + b1) * (w - v) + (1 + c1) * (1 - b1) * (q - w))) / 2;
      return (
        (2 * u ** 3 - 3 * u * u + 1) * v +
        (u ** 3 - 2 * u * u + u) * m0 +
        (-2 * u ** 3 + 3 * u * u) * w +
        (u ** 3 - u * u) * m1
      );
    }
    if (numeric && (attr.spatialOut !== undefined || kb?.attributes.spatialIn !== undefined)) {
      const component = prop === 'y' ? 1 : 0;
      const so = Number(String(attr.spatialOut ?? '0,0').split(',')[component]);
      const si = Number(String(kb?.attributes.spatialIn ?? '0,0').split(',')[component]);
      return (
        (1 - u) ** 3 * Number(va) +
        3 * (1 - u) ** 2 * u * (Number(va) + so) +
        3 * (1 - u) * u * u * (Number(vb) + si) +
        u ** 3 * Number(vb)
      );
    }
    return interpolate(va, vb, u, color);
  };

  /** @param {number} t @param {string} mode @param {boolean} before */
  const outside = (t, mode, before) => {
    if (mode === 'hold' || range === 0) return before ? v0 : vn;
    if (mode === 'linear' && numeric) {
      let i = before ? 0 : n - 2;
      while (times[i] === times[i + 1] && (before ? i < n - 2 : i > 0)) i += before ? 1 : -1;
      if (times[i] === times[i + 1]) return before ? v0 : vn;
      const slope =
        (Number(values[i + 1]) - Number(values[i])) / (Number(times[i + 1]) - Number(times[i]));
      return before ? Number(v0) + (t - t0) * slope : Number(vn) + (t - tn) * slope;
    }
    const cycle = Math.floor((t - t0) / range);
    const phase = mod(t - t0, range);
    if (mode === 'ping-pong') return inside(cycle % 2 === 0 ? t0 + phase : tn - phase);
    const base = inside(t0 + phase);
    return mode === 'offset' && numeric
      ? Number(base) + cycle * (Number(vn) - Number(v0))
      : base;
  };

  const base = /** @type {string} */ (a.timeBase);
  const before = /** @type {string} */ (a.extrapolateBefore);
  const after = /** @type {string} */ (a.extrapolateAfter);
  const length = span.end - span.start;
  /** @param {number} t */
  const timeAt = (t) => {
    const c = timeline.spans.get(owner),
      ct = c ? c.composition(t) : t;
    return base === 'composition'
      ? ct
      : base === 'local'
        ? ct - span.start
        : length
          ? (ct - span.start) / length
          : 0;
  };
  return {
    property: String(a.property),
    additive: a.additive === true,
    keyTimes: Object.freeze(times),
    timeAt,
    valueAt(t) {
      const x = timeAt(t);
      if (x < t0) return outside(x, before, true);
      if (x > tn) return outside(x, after, false);
      return inside(x);
    },
  };
}

/**
 * Compiles every <animate> in the scene, keyed by the id (or path) of the node it animates.
 * @param {SceneNode} scene
 * @returns {{ tracks: Map<string, Track[]>, diagnostics: Diagnostic[] }}
 */
export function compileAnimations(scene) {
  /** @type {Map<string, Track[]>} */
  const tracks = new Map();
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Map<string,SceneNode>} */ const ids = new Map();
  const index = (/** @type {SceneNode} */ n) => {
    if (n.attributes.id !== undefined) ids.set(String(n.attributes.id), n);
    for (const c of n.children) index(c);
  };
  index(scene);
  const tokens = new Map(
    (scene.children.find((n) => n.name === 'styles')?.children ?? [])
      .filter((n) => n.name === 'token')
      .map((n) => [String(n.attributes.name), String(n.attributes.value)]),
  );
  /** @param {import('./value.js').Value} value @param {string} type @returns {import('./value.js').Value} */
  const resolve = (value, type) => {
    if (typeof value !== 'string') return value;
    if (simple.idKind(type)?.startsWith('IDREF') && !ids.has(value))
      throw new Error(`key references unknown ID ${value}`);
    if (simple.reaches(type, 'colorType') || simple.reaches(type, 'paintType')) {
      const visited = new Set();
      while (value.startsWith('var(--')) {
        const name = value.slice(6, -1);
        if (visited.has(name)) throw new Error('color token cycle');
        visited.add(name);
        const next = tokens.get(name);
        if (next === undefined) throw new Error(`unknown color token ${name}`);
        value = next;
      }
      if (value.startsWith('url(#')) {
        const id = value.slice(5, -1);
        if (
          !scene.children
            .find((n) => n.name === 'paints')
            ?.children.some((n) => n.attributes.id === id)
        )
          throw new Error(`unknown paint ${id}`);
      }
    }
    return value;
  };
  let timeline;
  try {
    timeline = clocks(scene);
  } catch (e) {
    return {
      tracks,
      diagnostics: [diagnostic(Codes.ANIM_VALUE, 'semantic', String(e), scene.loc, scene.path)],
    };
  }
  const project = scene.children.find((c) => c.name === 'project');
  const duration = /** @type {number} */ (project?.attributes.duration);

  /** @param {SceneNode} node */
  const walk = (node) => {
    const anims = node.children.filter((c) => c.name === 'animate');
    if (anims.length) {
      const declared = MODEL.complexTypes[node.type]?.attributes ?? {};
      const start = timeline.spans.get(node)?.start ?? 0;
      const end = timeline.spans.get(node)?.end ?? duration;
      const key = typeof node.attributes.id === 'string' ? node.attributes.id : node.path;
      for (const an of anims) {
        const prop = /** @type {string} */ (an.attributes.property);
        try {
          if (!(prop in declared) && !(node.name === 'motionPath' && prop === 'progress'))
            throw new TrackError(
              Codes.ANIM_PROPERTY,
              `<${node.name}> has no attribute "${prop}" to animate`,
            );
          const t = compileTrack(an, { start, end }, node, timeline, resolve);
          tracks.set(key, [...(tracks.get(key) ?? []), t]);
        } catch (e) {
          diagnostics.push(
            diagnostic(
              e instanceof TrackError ? e.code : Codes.ANIM_VALUE,
              'semantic',
              /** @type {Error} */ (e).message,
              an.loc,
              an.path,
            ),
          );
        }
      }
    }
    for (const c of node.children) walk(c);
  };
  walk(scene);
  return { tracks, diagnostics };
}
