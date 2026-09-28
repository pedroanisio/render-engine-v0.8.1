/** Premultiplied floating-point image operations. Coordinates are pixel centres. */
import {
  Surface,
  clampRect,
  expandRect,
  fullRect,
  unionRect,
} from "../surface.js";
/** @param {number} x @param {number} [lo] @param {number} [hi] */
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
/** Pixel copy. The zero-region hint is dropped unless the caller promises not to
 * write outside it (`keepBounds`).
 * @param {Surface} s @param {boolean} [keepBounds] */
export function copy(s, keepBounds = false) {
  const o = new Surface(s.width, s.height);
  o.data.set(s.data);
  if (keepBounds) o.bbox = s.bbox;
  return o;
}
/** @param {Surface} s @param {number} x @param {number} y @param {number} k @param {boolean} [edge] */
export function sample(s, x, y, k, edge = false) {
  if (edge) {
    x = clamp(x, 0, s.width - 1);
    y = clamp(y, 0, s.height - 1);
  }
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  // On a pixel centre the three other taps carry zero weight and add nothing.
  if (fx === 0 && fy === 0)
    return ix >= 0 && iy >= 0 && ix < s.width && iy < s.height
      ? /** @type {number} */ (s.data[(iy * s.width + ix) * 4 + k])
      : 0;
  let v = 0;
  for (let n = 0; n < 4; n++) {
    const xx = ix + (n & 1),
      yy = iy + (n >> 1);
    if (xx >= 0 && yy >= 0 && xx < s.width && yy < s.height)
      v +=
        Number(s.data[(yy * s.width + xx) * 4 + k]) *
        (n & 1 ? fx : 1 - fx) *
        (n >> 1 ? fy : 1 - fy);
  }
  return v;
}
/** @param {Surface} s @param {(x:number,y:number)=>number[]} map @param {boolean} [edge] */
export function warp(s, map, edge = false) {
  const out = new Surface(s.width, s.height);
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const q = map(x, y);
      for (let k = 0; k < 4; k++)
        out.data[(y * s.width + x) * 4 + k] = sample(
          s,
          Number(q[0]),
          Number(q[1]),
          k,
          edge,
        );
    }
  return out;
}
/** Separable Gaussian, zero coverage outside the surface. Radius is three sigma.
 * Only the rows and columns that can receive non-zero weight are evaluated when
 * the input carries a zero-region hint; elsewhere every tap is zero. With
 * `alphaOnly` the colour channels of the result are left at zero.
 * @param {Surface} s @param {number} radius @param {boolean} [alphaOnly] */
export function gaussian(s, radius, alphaOnly = false) {
  if (radius <= 0) return copy(s);
  const r = Math.ceil(radius),
    sigma = Math.max(radius / 3, 0.25),
    kernel = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let n = -r; n <= r; n++) {
    const w = Math.exp((-n * n) / (2 * sigma * sigma));
    kernel[n + r] = w;
    sum += w;
  }
  // (1 * w) / sum is w / sum and 0 adds nothing: opaque and empty taps skip the
  // division, which is most taps of a solid shape's alpha.
  const over = new Float64Array(2 * r + 1);
  for (let n = 0; n <= 2 * r; n++)
    over[n] = /** @type {number} */ (kernel[n]) / sum;
  const W = s.width,
    H = s.height,
    known = s.bbox ? clampRect(s.bbox, W, H) : undefined,
    rows = known
      ? clampRect(
          { x0: known.x0 - r, y0: known.y0, x1: known.x1 + r, y1: known.y1 },
          W,
          H,
        )
      : fullRect(s),
    both = known ? clampRect(expandRect(known, r), W, H) : fullRect(s);
  let src = s.data,
    finite = true;
  const k0 = alphaOnly ? 3 : 0;
  for (const horizontal of [true, false]) {
    const region = horizontal ? rows : both,
      out = new Float32Array(W * H * 4),
      step = horizontal ? 4 : W * 4;
    for (let y = region.y0; y < region.y1; y++) {
      const nyLo = Math.max(-r, -y),
        nyHi = Math.min(r, H - 1 - y);
      for (let x = region.x0; x < region.x1; x++) {
        const lo = horizontal ? Math.max(-r, -x) : nyLo,
          hi = horizontal ? Math.min(r, W - 1 - x) : nyHi,
          base = (y * W + x) * 4;
        for (let k = k0; k < 4; k++) {
          let v = 0;
          for (let n = lo; n <= hi; n++) {
            const tap = /** @type {number} */ (src[base + n * step + k]);
            if (tap === 1) v += /** @type {number} */ (over[n + r]);
            else if (tap !== 0)
              v += (tap * /** @type {number} */ (kernel[n + r])) / sum;
          }
          if (v - v !== 0) finite = false;
          out[base + k] = v;
        }
      }
    }
    src = out;
  }
  const result = new Surface(W, H);
  result.data = src;
  result.bbox = known ? both : undefined;
  result.finite = finite;
  return result;
}
/** @param {Surface} s @param {number} samples @param {(x:number,y:number,t:number)=>number[]} map */
export function integrate(s, samples, map) {
  const out = new Surface(s.width, s.height),
    count = Math.max(1, Math.min(256, Math.round(samples)));
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++)
      for (let n = 0; n < count; n++) {
        const q = map(x, y, (n + 0.5) / count);
        for (let k = 0; k < 4; k++)
          out.data[(y * s.width + x) * 4 + k] =
            Number(out.data[(y * s.width + x) * 4 + k]) +
            sample(s, Number(q[0]), Number(q[1]), k) / count;
      }
  return out;
}
/** RGB operations receive unassociated values; returned alpha is reassociated.
 * With `sparse`, pixels outside the input's zero-region hint are left at zero,
 * which is exact whenever `fn` maps zero alpha to zero alpha.
 * @param {Surface} s @param {(rgb:number[],a:number,x:number,y:number)=>number[]} fn @param {boolean} [sparse] */
export function colors(s, fn, sparse = false) {
  const out = new Surface(s.width, s.height),
    W = s.width,
    d = s.data,
    o = out.data,
    region = sparse && s.bbox ? clampRect(s.bbox, W, s.height) : fullRect(s),
    // One input triple, refilled per pixel; callbacks consume it immediately.
    rgb = [0, 0, 0];
  let finite = true;
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) {
      const j = (y * W + x) * 4,
        a = /** @type {number} */ (d[j + 3]);
      if (a === 1) {
        rgb[0] = /** @type {number} */ (d[j]);
        rgb[1] = /** @type {number} */ (d[j + 1]);
        rgb[2] = /** @type {number} */ (d[j + 2]);
      } else {
        rgb[0] = a ? /** @type {number} */ (d[j]) / a : 0;
        rgb[1] = a ? /** @type {number} */ (d[j + 1]) / a : 0;
        rgb[2] = a ? /** @type {number} */ (d[j + 2]) / a : 0;
      }
      const v = fn(rgb, a, x, y),
        alpha = clamp(Number(v[3] ?? a)),
        o0 = Number(v[0]) * alpha,
        o1 = Number(v[1]) * alpha,
        o2 = Number(v[2]) * alpha;
      if (
        o0 - o0 !== 0 ||
        o1 - o1 !== 0 ||
        o2 - o2 !== 0 ||
        alpha - alpha !== 0
      )
        finite = false;
      o[j] = o0;
      o[j + 1] = o1;
      o[j + 2] = o2;
      o[j + 3] = alpha;
    }
  out.bbox = sparse && s.bbox ? s.bbox : undefined;
  out.finite = finite;
  return out;
}
/** @param {number[]} rgb */
export const luminance = (rgb) =>
  Number(rgb[0]) * 0.2126 + Number(rgb[1]) * 0.7152 + Number(rgb[2]) * 0.0722;
/** @param {Surface} a @param {Surface} b @param {number} t */
export function mix(a, b, t) {
  const same = a.width === b.width && a.height === b.height;
  // a*(1-t) + b*t at t = 1 (or 0) is b (or a), give or take the sign of zero.
  if (same && (t === 1 || t === 0)) {
    const o = copy(t === 1 ? b : a, true);
    o.finite = t === 1 ? b.finite : a.finite;
    return o;
  }
  const o = copy(a),
    ad = a.data,
    bd = b.data,
    od = o.data;
  if (same && a.bbox && b.bbox) {
    const W = a.width,
      region = clampRect(
        /** @type {import('../surface.js').Rect} */ (unionRect(a.bbox, b.bbox)),
        W,
        a.height,
      );
    for (let y = region.y0; y < region.y1; y++) {
      const end = (y * W + region.x1) * 4;
      for (let i = (y * W + region.x0) * 4; i < end; i++)
        od[i] =
          /** @type {number} */ (ad[i]) * (1 - t) +
          /** @type {number} */ (bd[i]) * t;
    }
  } else
    for (let i = 0; i < od.length; i++)
      od[i] = Number(ad[i]) * (1 - t) + Number(bd[i]) * t;
  o.bbox = same ? unionRect(a.bbox, b.bbox) : undefined;
  // A convex mix of finite values with t in [0, 1] stays finite.
  o.finite = a.finite === true && b.finite === true && t >= 0 && t <= 1;
  return o;
}
/** Disk dilation (positive radius) or erosion (negative radius), alpha only.
 * @param {Surface} s @param {number} radius */
export function morphology(s, radius) {
  const out = copy(s),
    r = Math.ceil(Math.abs(radius));
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      let v = radius < 0 ? 1 : 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= radius * radius) {
            const q = sample(s, x + dx, y + dy, 3);
            v = radius < 0 ? Math.min(v, q) : Math.max(v, q);
          }
      const j = (y * s.width + x) * 4,
        old = Number(s.data[j + 3]);
      for (let k = 0; k < 3; k++)
        out.data[j + k] = old ? (Number(s.data[j + k]) * v) / old : 0;
      out.data[j + 3] = v;
    }
  out.bbox = s.bbox
    ? clampRect(expandRect(s.bbox, r + 1), s.width, s.height)
    : undefined;
  return out;
}
