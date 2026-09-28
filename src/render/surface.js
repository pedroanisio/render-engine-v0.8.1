/**
 * Premultiplied linear-light RGBA float surface and the drawing operations the
 * scene needs: anti-aliased axis-aligned and rounded rectangles, rectangle
 * strokes, bilinear image placement with translation and scale, and
 * source-over compositing with opacity and a clip rectangle.
 */
import { encodeSrgb } from "./color.js";

/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} Rect half-open pixel rectangle */

export class Surface {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {number|undefined} */ this.logicalWidth = undefined;
    /** @type {number|undefined} */ this.logicalHeight = undefined;
    this.originX = 0;
    this.originY = 0;
    this.overflow = false;
    this.data = new Float32Array(width * height * 4);
    /**
     * Zero-region hint: when set, every channel of every pixel outside this
     * rectangle is zero, so passes may skip those pixels. `undefined` means
     * unknown. Only code that maintains the invariant sets it; anything that
     * writes pixels through other means must clear it.
     * @type {Rect|undefined}
     */
    this.bbox = undefined;
    /**
     * Set by producers that checked every value they wrote for finiteness
     * (with zeros outside `bbox`); never inherited through copies or writes.
     * @type {boolean|undefined}
     */
    this.finite = undefined;
  }

  /** @returns {Rect} */
  bounds() {
    return { x0: 0, y0: 0, x1: this.width, y1: this.height };
  }

  /**
   * Blends one premultiplied colour into pixel i with coverage cov.
   * @param {number} i @param {number} r @param {number} g @param {number} b @param {number} a @param {number} cov
   */
  blend(i, r, g, b, a, cov) {
    const d = this.data;
    const k = 1 - a * cov;
    d[i] = r * cov + /** @type {number} */ (d[i]) * k;
    d[i + 1] = g * cov + /** @type {number} */ (d[i + 1]) * k;
    d[i + 2] = b * cov + /** @type {number} */ (d[i + 2]) * k;
    d[i + 3] = a * cov + /** @type {number} */ (d[i + 3]) * k;
  }

  /**
   * Anti-aliased filled rectangle (exact area coverage on fractional edges).
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @param {import('./color.js').Rgba} rgba straight alpha
   * @param {Rect} clip
   */
  fillRect(x, y, w, h, rgba, clip) {
    const [cr, cg, cb, ca] = rgba;
    const r = cr * ca;
    const g = cg * ca;
    const b = cb * ca;
    const xa = Math.max(x, clip.x0);
    const xb = Math.min(x + w, clip.x1);
    const ya = Math.max(y, clip.y0);
    const yb = Math.min(y + h, clip.y1);
    if (xa >= xb || ya >= yb || ca <= 0) return;
    for (let py = Math.floor(ya); py < Math.ceil(yb); py++) {
      const cy = Math.min(yb, py + 1) - Math.max(ya, py);
      for (let px = Math.floor(xa); px < Math.ceil(xb); px++) {
        const cx = Math.min(xb, px + 1) - Math.max(xa, px);
        this.blend((py * this.width + px) * 4, r, g, b, ca, cx * cy);
      }
    }
  }

  /**
   * Rectangle outline centred on the edges.
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} sw
   * @param {import('./color.js').Rgba} rgba @param {Rect} clip
   */
  strokeRect(x, y, w, h, sw, rgba, clip) {
    const s = sw / 2;
    this.fillRect(x - s, y - s, w + sw, sw, rgba, clip);
    this.fillRect(x - s, y + h - s, w + sw, sw, rgba, clip);
    this.fillRect(x - s, y + s, sw, h - sw, rgba, clip);
    this.fillRect(x + w - s, y + s, sw, h - sw, rgba, clip);
  }

  /**
   * Rounded rectangle fill and optional centred stroke, by signed distance with a
   * one-pixel anti-aliasing ramp.
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} radius
   * @param {import('./color.js').Rgba | null} fill @param {import('./color.js').Rgba | null} stroke
   * @param {number} sw @param {Rect} clip
   */
  roundedRect(x, y, w, h, radius, fill, stroke, sw, clip) {
    const rad = Math.max(0, Math.min(radius, w / 2, h / 2));
    const pad = stroke ? sw / 2 + 1 : 1;
    const x0 = Math.max(clip.x0, Math.floor(x - pad));
    const x1 = Math.min(clip.x1, Math.ceil(x + w + pad));
    const y0 = Math.max(clip.y0, Math.floor(y - pad));
    const y1 = Math.min(clip.y1, Math.ceil(y + h + pad));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hx = w / 2 - rad;
    const hy = h / 2 - rad;
    for (let py = y0; py < y1; py++) {
      const qy = Math.abs(py + 0.5 - cy) - hy;
      for (let px = x0; px < x1; px++) {
        const qx = Math.abs(px + 0.5 - cx) - hx;
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
        const dist = outside + Math.min(Math.max(qx, qy), 0) - rad;
        const i = (py * this.width + px) * 4;
        if (fill) {
          const cov = Math.min(1, Math.max(0, 0.5 - dist));
          if (cov > 0)
            this.blend(
              i,
              fill[0] * fill[3],
              fill[1] * fill[3],
              fill[2] * fill[3],
              fill[3],
              cov,
            );
        }
        if (stroke && sw > 0) {
          const cov = Math.min(1, Math.max(0, sw / 2 + 0.5 - Math.abs(dist)));
          if (cov > 0)
            this.blend(
              i,
              stroke[0] * stroke[3],
              stroke[1] * stroke[3],
              stroke[2] * stroke[3],
              stroke[3],
              cov,
            );
        }
      }
    }
  }

  /**
   * Places `src` scaled by (sx, sy) about its origin, then translated by (tx, ty),
   * sampling bilinearly; opacity multiplies the source.
   * @param {Surface} src @param {number} tx @param {number} ty @param {number} sx @param {number} sy
   * @param {number} opacity @param {Rect} clip
   */
  drawSurface(src, tx, ty, sx, sy, opacity, clip) {
    if (opacity <= 0 || sx === 0 || sy === 0) return;
    const x0 = Math.max(clip.x0, Math.floor(Math.min(tx, tx + src.width * sx)));
    const x1 = Math.min(clip.x1, Math.ceil(Math.max(tx, tx + src.width * sx)));
    const y0 = Math.max(
      clip.y0,
      Math.floor(Math.min(ty, ty + src.height * sy)),
    );
    const y1 = Math.min(clip.y1, Math.ceil(Math.max(ty, ty + src.height * sy)));
    const s = src.data;
    const d = this.data;
    const sw = src.width;
    const sh = src.height;
    const integral =
      sx === 1 && sy === 1 && Number.isInteger(tx) && Number.isInteger(ty);
    for (let py = y0; py < y1; py++) {
      const v = (py + 0.5 - ty) / sy - 0.5;
      const vy = Math.floor(v);
      const fy = v - vy;
      for (let px = x0; px < x1; px++) {
        let r;
        let g;
        let b;
        let a;
        if (integral) {
          const j = ((py - ty) * sw + (px - tx)) * 4;
          r = /** @type {number} */ (s[j]);
          g = /** @type {number} */ (s[j + 1]);
          b = /** @type {number} */ (s[j + 2]);
          a = /** @type {number} */ (s[j + 3]);
        } else {
          const u = (px + 0.5 - tx) / sx - 0.5;
          const ux = Math.floor(u);
          const fx = u - ux;
          r = 0;
          g = 0;
          b = 0;
          a = 0;
          for (let k = 0; k < 4; k++) {
            const xx = ux + (k & 1);
            const yy = vy + (k >> 1);
            if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
            const w = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
            const j = (yy * sw + xx) * 4;
            r += /** @type {number} */ (s[j]) * w;
            g += /** @type {number} */ (s[j + 1]) * w;
            b += /** @type {number} */ (s[j + 2]) * w;
            a += /** @type {number} */ (s[j + 3]) * w;
          }
        }
        if (a <= 0) continue;
        const i = (py * this.width + px) * 4;
        const k = 1 - a * opacity;
        d[i] = r * opacity + /** @type {number} */ (d[i]) * k;
        d[i + 1] = g * opacity + /** @type {number} */ (d[i + 1]) * k;
        d[i + 2] = b * opacity + /** @type {number} */ (d[i + 2]) * k;
        d[i + 3] = a * opacity + /** @type {number} */ (d[i + 3]) * k;
      }
    }
  }

  /** Opaque 8-bit sRGB RGB bytes (for encoders), composited over black. */
  toRgb8() {
    const out = new Uint8Array(this.width * this.height * 3);
    const d = this.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      out[j] = encodeSrgb(/** @type {number} */ (d[i]));
      out[j + 1] = encodeSrgb(/** @type {number} */ (d[i + 1]));
      out[j + 2] = encodeSrgb(/** @type {number} */ (d[i + 2]));
    }
    return out;
  }
}

/** Empty region: nothing outside it, nothing inside it. */
export const EMPTY_RECT = Object.freeze({ x0: 0, y0: 0, x1: 0, y1: 0 });

/** @param {Rect} r */
export function rectEmpty(r) {
  return r.x1 <= r.x0 || r.y1 <= r.y0;
}

/** @param {{width:number,height:number}} s @returns {Rect} */
export function fullRect(s) {
  return { x0: 0, y0: 0, x1: s.width, y1: s.height };
}

/** Bounding rectangle of both; `undefined` (unknown) absorbs everything.
 * @param {Rect|undefined} a @param {Rect|undefined} b @returns {Rect|undefined} */
export function unionRect(a, b) {
  if (!a || !b) return undefined;
  if (rectEmpty(a)) return b;
  if (rectEmpty(b)) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

/** Overlap of both; an unknown side contributes no constraint.
 * @param {Rect|undefined} a @param {Rect|undefined} b @returns {Rect|undefined} */
export function intersectRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return rectEmpty(r) ? EMPTY_RECT : r;
}

/** @param {Rect} r @param {number} dx @param {number} [dy] @returns {Rect} */
export function expandRect(r, dx, dy = dx) {
  return rectEmpty(r)
    ? r
    : { x0: r.x0 - dx, y0: r.y0 - dy, x1: r.x1 + dx, y1: r.y1 + dy };
}

/** Integer pixel rectangle inside a width x height surface.
 * @param {Rect} r @param {number} width @param {number} height @returns {Rect} */
export function clampRect(r, width, height) {
  const c = {
    x0: Math.max(0, Math.floor(r.x0)),
    y0: Math.max(0, Math.floor(r.y0)),
    x1: Math.min(width, Math.ceil(r.x1)),
    y1: Math.min(height, Math.ceil(r.y1)),
  };
  return rectEmpty(c) ? EMPTY_RECT : c;
}

/** Pixel rectangle that may hold non-zero values: the hint, or everything.
 * @param {{width:number,height:number,bbox?:Rect}} s @returns {Rect} */
export function regionOf(s) {
  return s.bbox ? clampRect(s.bbox, s.width, s.height) : fullRect(s);
}
