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
/** Running max (min with `erode`) of the alpha channel of row `base` over
 * [x - w, x + w], zero outside the row, by van Herk/Gil-Werman in O(n). `arg`
 * receives the column of the extreme, or -1 where it is padding.
 * @param {Float32Array} d @param {number} base @param {number} n @param {number} w
 * @param {boolean} erode @param {Float64Array} val @param {Int32Array} arg
 * @param {{g:Float64Array,gi:Int32Array,h:Float64Array,hi:Int32Array}} t */
function slide(d, base, n, w, erode, val, arg, t) {
  const k = 2 * w + 1,
    len = n + 2 * w,
    { g, gi, h, hi } = t;
  for (let j = 0; j < len; j++) {
    const i = j >= w && j < n + w ? j - w : -1,
      v = i < 0 ? 0 : /** @type {number} */ (d[(base + i) * 4 + 3]),
      p = j % k ? /** @type {number} */ (g[j - 1]) : NaN;
    if (j % k === 0 || (erode ? v < p : v > p)) {
      g[j] = v;
      gi[j] = i;
    } else {
      g[j] = p;
      gi[j] = /** @type {number} */ (gi[j - 1]);
    }
  }
  for (let j = len - 1; j >= 0; j--) {
    const i = j >= w && j < n + w ? j - w : -1,
      v = i < 0 ? 0 : /** @type {number} */ (d[(base + i) * 4 + 3]),
      first = j % k === k - 1 || j === len - 1,
      p = first ? NaN : /** @type {number} */ (h[j + 1]);
    if (first || (erode ? v < p : v > p)) {
      h[j] = v;
      hi[j] = i;
    } else {
      h[j] = p;
      hi[j] = /** @type {number} */ (hi[j + 1]);
    }
  }
  for (let x = 0; x < n; x++) {
    const a = /** @type {number} */ (h[x]),
      b = /** @type {number} */ (g[x + k - 1]);
    if (erode ? b < a : b > a) {
      val[x] = b;
      arg[x] = /** @type {number} */ (gi[x + k - 1]);
    } else {
      val[x] = a;
      arg[x] = /** @type {number} */ (hi[x]);
    }
  }
}
/** Disk dilation (positive radius) or erosion (negative radius), alpha only.
 * Pixels newly covered by dilation take the unassociated colour of the
 * neighbour that supplied their coverage. Work is O(W·H·r) inside the
 * zero-region hint (plus the radius when dilating); the radius is capped at the
 * surface diagonal, beyond which the disk covers the whole surface anyway.
 * @param {Surface} s @param {number} radius */
export function morphology(s, radius) {
  const W = s.width,
    H = s.height,
    out = copy(s),
    d = s.data,
    o = out.data,
    erode = radius < 0,
    R = Math.min(Math.abs(radius), Math.hypot(W, H) + 1),
    r = Math.ceil(R),
    known = s.bbox ? clampRect(s.bbox, W, H) : fullRect(s),
    region = erode ? known : clampRect(expandRect(known, r), W, H);
  // Rows of the disk dx*dx + dy*dy <= R*R as [dy, half-width].
  /** @type {number[][]} */ const spans = [];
  for (let dy = -r; dy <= r; dy++) {
    if (dy * dy > R * R) continue;
    let w = Math.floor(Math.sqrt(R * R - dy * dy));
    while ((w + 1) * (w + 1) + dy * dy <= R * R) w++;
    while (w > 0 && w * w + dy * dy > R * R) w--;
    spans.push([dy, w]);
  }
  const len = W + 2 * r + 1,
    scratch = {
      g: new Float64Array(len),
      gi: new Int32Array(len),
      h: new Float64Array(len),
      hi: new Int32Array(len),
    },
    val = new Float64Array(W),
    arg = new Int32Array(W),
    best = new Float64Array(W),
    from = new Int32Array(W);
  for (let y = region.y0; y < region.y1; y++) {
    best.fill(erode ? 1 : 0);
    from.fill(-1);
    for (const [dy, w] of spans) {
      const yy = y + Number(dy);
      if (yy < 0 || yy >= H) {
        // A row outside the surface is transparent.
        if (erode) best.fill(0);
        continue;
      }
      slide(d, yy * W, W, Number(w), erode, val, arg, scratch);
      for (let x = region.x0; x < region.x1; x++) {
        const v = /** @type {number} */ (val[x]),
          b = /** @type {number} */ (best[x]),
          c = /** @type {number} */ (arg[x]);
        if (erode ? v < b : v > b) {
          best[x] = v;
          from[x] = c < 0 ? -1 : yy * W + c;
        }
      }
    }
    for (let x = region.x0; x < region.x1; x++) {
      const j = (y * W + x) * 4,
        v = /** @type {number} */ (best[x]),
        old = Number(d[j + 3]),
        src = /** @type {number} */ (from[x]) * 4,
        a = src >= 0 ? Number(d[src + 3]) : 0;
      for (let k = 0; k < 3; k++)
        o[j + k] = old
          ? (Number(d[j + k]) * v) / old
          : !erode && v > 0 && a
            ? (Number(d[src + k]) * v) / a
            : 0;
      o[j + 3] = v;
    }
  }
  out.bbox = s.bbox ? clampRect(expandRect(s.bbox, r + 1), W, H) : undefined;
  return out;
}
