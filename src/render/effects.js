/**
 * Effects, masks, rain particles and rotated placement for the scene subset.
 *
 * The schema names these effects but does not define their math; the readings
 * below are documented per function and are deterministic: grain and particles
 * are pure functions of their seed and the frame index.
 */
import { Surface } from "./surface.js";

/** @typedef {import('./surface.js').Rect} Rect */

/** 32-bit integer hash of four integers -> [0, 1). @param {number} a @param {number} b @param {number} c @param {number} d */
export function hash01(a, b, c, d) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(b, 0xc2b2ae35), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15) ^ Math.imul(c, 0x165667b1), 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16) ^ Math.imul(d, 0x85ebca77), 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** @param {number} r @param {number} g @param {number} b linear */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * film-grain: zero-mean uniform noise of +/- amount added to every channel of each
 * pixel (premultiplied by its alpha), new per frame; the result is mixed with the input.
 * @param {Surface} s @param {Rect} r @param {{ amount: number, mix: number, seed: number, size?:number }} p @param {number} frame
 */
export function filmGrain(s, r, p, frame) {
  const d = s.data;
  const k = p.amount * p.mix * 2;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * s.width + x) * 4;
      const a = /** @type {number} */ (d[i + 3]);
      if (a <= 0) continue;
      const cell = Math.max(1, p.size ?? 1);
      const n =
        (hash01(Math.floor(x / cell), Math.floor(y / cell), frame, p.seed) -
          0.5) *
        k *
        a;
      d[i] = Math.max(0, /** @type {number} */ (d[i]) + n);
      d[i + 1] = Math.max(0, /** @type {number} */ (d[i + 1]) + n);
      d[i + 2] = Math.max(0, /** @type {number} */ (d[i + 2]) + n);
    }
  }
}

/**
 * halftone: a black dot screen of cell `size` px at `angle` degrees whose dot area equals
 * the pixel's darkness (1 - luminance, perceptual); ink is anti-aliased over one pixel and
 * the screened image is mixed with the input.
 * @param {Surface} s @param {Rect} r @param {{ size: number, angle: number, mix: number }} p
 */
export function halftone(s, r, p) {
  const d = s.data;
  const c = Math.cos((p.angle * Math.PI) / 180);
  const sn = Math.sin((p.angle * Math.PI) / 180);
  const cell = Math.max(p.size, 1e-6);
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * s.width + x) * 4;
      const a = /** @type {number} */ (d[i + 3]);
      if (a <= 0) continue;
      const L = Math.min(
        1,
        luma(
          /** @type {number} */ (d[i]),
          /** @type {number} */ (d[i + 1]),
          /** @type {number} */ (d[i + 2]),
        ) / a,
      );
      const dark = 1 - Math.sqrt(L); // perceptual darkness
      const u = ((x + 0.5) * c + (y + 0.5) * sn) / cell;
      const v = (-(x + 0.5) * sn + (y + 0.5) * c) / cell;
      const du = (u - Math.floor(u) - 0.5) * cell;
      const dv = (v - Math.floor(v) - 0.5) * cell;
      const radius = Math.sqrt(dark / Math.PI) * cell;
      // anti-aliased dot edge, faded for dots under half a pixel so white stays white
      const ink =
        Math.min(1, Math.max(0, radius - Math.hypot(du, dv) + 0.5)) *
        Math.min(1, radius * 2);
      const k = 1 - p.mix * ink;
      d[i] = /** @type {number} */ (d[i]) * k;
      d[i + 1] = /** @type {number} */ (d[i + 1]) * k;
      d[i + 2] = /** @type {number} */ (d[i + 2]) * k;
    }
  }
}

/**
 * scanlines: the first half of every `size`-pixel row period is darkened by `intensity`,
 * mixed with the input.
 * @param {Surface} s @param {Rect} r @param {{ size: number, intensity: number, mix: number }} p
 */
export function scanlines(s, r, p) {
  const d = s.data;
  const period = Math.max(p.size, 1);
  for (let y = r.y0; y < r.y1; y++) {
    const on = y % period < period / 2 ? 1 : 0;
    const k = 1 - p.intensity * p.mix * on;
    if (k === 1) continue;
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * s.width + x) * 4;
      d[i] = /** @type {number} */ (d[i]) * k;
      d[i + 1] = /** @type {number} */ (d[i + 1]) * k;
      d[i + 2] = /** @type {number} */ (d[i + 2]) * k;
    }
  }
}

/**
 * Three-pass box blur of one channel (approximates a Gaussian of sigma ~ radius / 2).
 * @param {Float32Array} v @param {number} w @param {number} h @param {number} radius
 * @returns {Float32Array}
 */
export function blur(v, w, h, radius) {
  const r = Math.max(0, Math.round(radius / 2));
  if (r === 0) return v;
  /** @type {Float32Array} */
  let src = v;
  /** @type {Float32Array} */
  let tmp = new Float32Array(v.length);
  for (let pass = 0; pass < 3; pass++) {
    for (const horizontal of [true, false]) {
      const n = horizontal ? w : h;
      const lines = horizontal ? h : w;
      for (let l = 0; l < lines; l++) {
        const at = (/** @type {number} */ k) =>
          horizontal ? l * w + k : k * w + l;
        let sum = 0;
        for (let k = -r; k <= r; k++)
          sum += /** @type {number} */ (
            src[at(Math.min(n - 1, Math.max(0, k)))]
          );
        for (let k = 0; k < n; k++) {
          tmp[at(k)] = sum / (2 * r + 1);
          sum +=
            /** @type {number} */ (src[at(Math.min(n - 1, k + r + 1))]) -
            /** @type {number} */ (src[at(Math.max(0, k - r))]);
        }
      }
      [src, tmp] = [tmp, src];
    }
  }
  return src;
}

/**
 * glow: the element's coverage blurred by `radius` px, tinted `color` and added with
 * `intensity` (light is additive in linear space).
 * @param {Surface} s @param {{ radius: number, intensity: number, color: [number, number, number, number] }} p
 */
export function glow(s, p) {
  const n = s.width * s.height;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++)
    alpha[i] = /** @type {number} */ (s.data[i * 4 + 3]);
  const b = blur(alpha, s.width, s.height, p.radius);
  const [cr, cg, cb] = p.color;
  for (let i = 0; i < n; i++) {
    const g = /** @type {number} */ (b[i]) * p.intensity;
    if (g <= 0) continue;
    const j = i * 4;
    s.data[j] = /** @type {number} */ (s.data[j]) + cr * g;
    s.data[j + 1] = /** @type {number} */ (s.data[j + 1]) + cg * g;
    s.data[j + 2] = /** @type {number} */ (s.data[j + 2]) + cb * g;
    s.data[j + 3] = Math.min(
      1,
      Math.max(/** @type {number} */ (s.data[j + 3]), g),
    );
  }
}

/**
 * Ellipse mask (mode intersect): coverage is 1 inside, 0 outside, with a linear ramp
 * `feather` px wide centred on the edge (reading of "blurred by feather pixels").
 * @param {Surface} s @param {Rect} r @param {{ cx: number, cy: number, rx: number, ry: number, feather: number, invert: boolean }} p
 */
export function ellipseMask(s, r, p) {
  const d = s.data;
  const f = Math.max(p.feather, 1);
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const nx = (x + 0.5 - p.cx) / p.rx;
      const ny = (y + 0.5 - p.cy) / p.ry;
      const dist = (Math.sqrt(nx * nx + ny * ny) - 1) * Math.min(p.rx, p.ry);
      let cov = Math.min(1, Math.max(0, 0.5 - dist / f));
      if (p.invert) cov = 1 - cov;
      if (cov >= 1) continue;
      const i = (y * s.width + x) * 4;
      for (let k = 0; k < 4; k++)
        d[i + k] = /** @type {number} */ (d[i + k]) * cov;
    }
  }
}

/**
 * @typedef {object} Emitter
 * @property {number} x @property {number} y @property {number} width @property {number} height
 * @property {number} rate per second @property {number} lifetime s @property {number} speed px/s
 * @property {number} direction degrees, clockwise from +x @property {number} spread degrees
 * @property {number} size stroke width px @property {number} trail streak length in seconds of travel
 * @property {[number, number, number, number]} color @property {number} seed
 * @property {number} start @property {number} preroll s @property {number} maxParticles
 */

/**
 * rain: particle i is born at start - preroll + i / rate at a uniform point of the emitter
 * rectangle, moves at speed along direction +/- spread/2, lives `lifetime` seconds and is
 * drawn as an anti-aliased streak of length speed * trail. Positions are in destination px.
 * @param {Surface} s @param {Rect} clip @param {Emitter} e @param {number} t @param {number} scale
 */
export function rain(s, clip, e, t, scale) {
  const first = Math.max(
    0,
    Math.ceil((t - e.lifetime - (e.start - e.preroll)) * e.rate),
  );
  const last = Math.floor((t - (e.start - e.preroll)) * e.rate);
  const [cr, cg, cb, ca] = e.color;
  const half = (e.size * scale) / 2;
  for (let i = Math.max(first, last - e.maxParticles + 1); i <= last; i++) {
    const born = e.start - e.preroll + i / e.rate;
    const age = t - born;
    if (age < 0 || age >= e.lifetime) continue;
    const ang =
      ((e.direction + (hash01(i, 3, e.seed, 7) - 0.5) * e.spread) * Math.PI) /
      180;
    const vx = Math.cos(ang) * e.speed;
    const vy = Math.sin(ang) * e.speed;
    const x1 = (e.x + hash01(i, 1, e.seed, 7) * e.width + vx * age) * scale;
    const y1 = (e.y + hash01(i, 2, e.seed, 7) * e.height + vy * age) * scale;
    const x0 = x1 - vx * e.trail * scale;
    const y0 = y1 - vy * e.trail * scale;
    const bx0 = Math.max(clip.x0, Math.floor(Math.min(x0, x1) - half - 1));
    const bx1 = Math.min(clip.x1, Math.ceil(Math.max(x0, x1) + half + 1));
    const by0 = Math.max(clip.y0, Math.floor(Math.min(y0, y1) - half - 1));
    const by1 = Math.min(clip.y1, Math.ceil(Math.max(y0, y1) + half + 1));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let py = by0; py < by1; py++) {
      for (let px = bx0; px < bx1; px++) {
        const qx = px + 0.5 - x0;
        const qy = py + 0.5 - y0;
        const u = Math.min(1, Math.max(0, (qx * dx + qy * dy) / len2));
        const dist = Math.hypot(qx - u * dx, qy - u * dy);
        const cov = Math.min(1, Math.max(0, half + 0.5 - dist));
        if (cov > 0)
          s.blend((py * s.width + px) * 4, cr * ca, cg * ca, cb * ca, ca, cov);
      }
    }
  }
}

/**
 * Places `src` with scale then rotation (degrees, clockwise on screen) about the pivot
 * (px, py) given in source pixels, the pivot landing at (dx, dy) in destination pixels.
 * @param {Surface} dst @param {Surface} src @param {{ px: number, py: number, dx: number, dy: number, sx: number, sy: number, deg: number, opacity: number }} p
 * @param {Rect} clip
 */
export function drawRotated(dst, src, p, clip) {
  const a = (p.deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const corners = [
    [0, 0],
    [src.width, 0],
    [0, src.height],
    [src.width, src.height],
  ].map(([u, v]) => {
    const x = ((u ?? 0) - p.px) * p.sx;
    const y = ((v ?? 0) - p.py) * p.sy;
    return [p.dx + x * c - y * s, p.dy + x * s + y * c];
  });
  const xs = corners.map((q) => /** @type {number} */ (q[0]));
  const ys = corners.map((q) => /** @type {number} */ (q[1]));
  const x0 = Math.max(clip.x0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(clip.x1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(clip.y0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(clip.y1, Math.ceil(Math.max(...ys)));
  const sd = src.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const qx = x + 0.5 - p.dx;
      const qy = y + 0.5 - p.dy;
      const u = (qx * c + qy * s) / p.sx + p.px - 0.5;
      const v = (-qx * s + qy * c) / p.sy + p.py - 0.5;
      const ux = Math.floor(u);
      const vy = Math.floor(v);
      const fx = u - ux;
      const fy = v - vy;
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (let k = 0; k < 4; k++) {
        const xx = ux + (k & 1);
        const yy = vy + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= src.width || yy >= src.height) continue;
        const w = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
        const j = (yy * src.width + xx) * 4;
        r += /** @type {number} */ (sd[j]) * w;
        g += /** @type {number} */ (sd[j + 1]) * w;
        b += /** @type {number} */ (sd[j + 2]) * w;
        al += /** @type {number} */ (sd[j + 3]) * w;
      }
      if (al <= 0) continue;
      dst.blend(
        (y * dst.width + x) * 4,
        r * p.opacity,
        g * p.opacity,
        b * p.opacity,
        al * p.opacity,
        1,
      );
    }
  }
}

export { Surface };
