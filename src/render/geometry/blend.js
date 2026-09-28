/** Separable and nonseparable blend functions on unassociated linear RGB. */
import { noise } from "../../eval/expression.js";
import { clampRect, unionRect } from "../surface.js";
/** @param {number} x */ export const clamp = (x) =>
  Math.max(0, Math.min(1, x));
/** @param {number[]} c */ const lum = (c) =>
  0.3 * Number(c[0]) + 0.59 * Number(c[1]) + 0.11 * Number(c[2]);
/** @param {number[]} c */ const sat = (c) => Math.max(...c) - Math.min(...c);
/** @param {number[]} c @param {number} l */ function setLum(c, l) {
  const d = l - lum(c);
  let v = c.map((x) => x + d),
    n = Math.min(...v),
    m = Math.max(...v);
  if (n < 0) v = v.map((x) => l + ((x - l) * l) / (l - n));
  if (m > 1) v = v.map((x) => l + ((x - l) * (1 - l)) / (m - l));
  return v;
}
/** @param {number[]} c @param {number} s */ function setSat(c, s) {
  const n = Math.min(...c),
    m = Math.max(...c);
  return c.map((x) => (m === n ? 0 : ((x - n) * s) / (m - n)));
}
/** @param {number} b @param {number} s */ const dodge = (b, s) =>
  s >= 1 ? 1 : Math.min(1, b / (1 - s));
/** @param {number} b @param {number} s */ const burn = (b, s) =>
  s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
/** @param {number} b @param {number} s */ const hard = (b, s) =>
  s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
/** @param {number[]} b @param {number[]} s @param {string} mode */
export function blendColor(b, s, mode) {
  if (mode === "hue") return setLum(setSat(s, sat(b)), lum(b));
  if (mode === "saturation") return setLum(setSat(b, sat(s)), lum(b));
  if (mode === "color") return setLum(s, lum(b));
  if (mode === "luminosity") return setLum(b, lum(s));
  if (mode === "darker-color") return lum(b) < lum(s) ? b : s;
  if (mode === "lighter-color") return lum(b) > lum(s) ? b : s;
  return b.map((v, i) => {
    const q = Number(s[i]);
    switch (mode) {
      case "multiply":
        return v * q;
      case "screen":
        return v + q - v * q;
      case "overlay":
        return hard(q, v);
      case "hard-light":
        return hard(v, q);
      case "difference":
        return Math.abs(v - q);
      case "exclusion":
        return v + q - 2 * v * q;
      case "subtract":
        return Math.max(0, v - q);
      case "divide":
        return q === 0 ? 1 : Math.min(1, v / q);
      case "darken":
        return Math.min(v, q);
      case "lighten":
        return Math.max(v, q);
      case "color-dodge":
        return dodge(v, q);
      case "color-burn":
        return burn(v, q);
      case "add":
      case "plus-lighter":
      case "linear-dodge":
        return Math.min(1, v + q);
      case "linear-burn":
        return Math.max(0, v + q - 1);
      case "soft-light":
        return q <= 0.5
          ? v - (1 - 2 * q) * v * (1 - v)
          : v +
              (2 * q - 1) *
                ((v <= 0.25 ? ((16 * v - 12) * v + 4) * v : Math.sqrt(v)) - v);
      case "linear-light":
        return clamp(v + 2 * q - 1);
      case "vivid-light":
        return q < 0.5 ? burn(v, 2 * q) : dodge(v, 2 * q - 1);
      case "pin-light":
        return q < 0.5 ? Math.min(v, 2 * q) : Math.max(v, 2 * q - 1);
      case "hard-mix":
        return (q < 0.5 ? burn(v, 2 * q) : dodge(v, 2 * q - 1)) < 0.5 ? 0 : 1;
      default:
        return q;
    }
  });
}
/**
 * Source-over of one premultiplied pixel, `mode === "normal"`. Same arithmetic as
 * the general path below; a fully transparent source pixel leaves the destination
 * untouched, so it is skipped.
 * @param {Float32Array} d @param {Float32Array} s @param {number} i @param {number} opacity
 */
function normalPixel(d, s, i, opacity) {
  const original = /** @type {number} */ (s[i + 3]);
  const sa = original * opacity;
  if (sa === 0) return;
  const da = /** @type {number} */ (d[i + 3]);
  const w1 = 1 - sa,
    w2 = 1 - da,
    w3 = sa * da;
  const sc0 = original ? /** @type {number} */ (s[i]) / original : 0,
    sc1 = original ? /** @type {number} */ (s[i + 1]) / original : 0,
    sc2 = original ? /** @type {number} */ (s[i + 2]) / original : 0;
  d[i] = w1 * /** @type {number} */ (d[i]) + w2 * sc0 * sa + w3 * sc0;
  d[i + 1] = w1 * /** @type {number} */ (d[i + 1]) + w2 * sc1 * sa + w3 * sc1;
  d[i + 2] = w1 * /** @type {number} */ (d[i + 2]) + w2 * sc2 * sa + w3 * sc2;
  d[i + 3] = sa + da - w3;
}
/**
 * Blends `src` over `dst`. When `src.bbox` is set, pixels outside it are known
 * to be zero: source-over skips them, other modes apply their transparent-source
 * rule (clamping) there without evaluating the blend function.
 * @param {import('../surface.js').Surface} dst @param {import('../surface.js').Surface} src @param {string} [mode] @param {number} [opacity] */
export function composite(dst, src, mode = "normal", opacity = 1) {
  const d = dst.data,
    s = src.data,
    W = dst.width,
    H = dst.height;
  const sameSize = src.width === W && src.height === H && s.length === d.length;
  const region = sameSize && src.bbox ? clampRect(src.bbox, W, H) : undefined;
  if (mode === "normal") {
    if (region) {
      for (let y = region.y0; y < region.y1; y++) {
        const end = (y * W + region.x1) * 4;
        for (let i = (y * W + region.x0) * 4; i < end; i += 4)
          normalPixel(d, s, i, opacity);
      }
    } else for (let i = 0; i < d.length; i += 4) normalPixel(d, s, i, opacity);
    dst.bbox = sameSize ? unionRect(dst.bbox, src.bbox) : undefined;
    return;
  }
  const stencil = mode.startsWith("stencil"),
    silhouette = mode.startsWith("silhouette"),
    luma = mode.endsWith("luma"),
    add = mode === "add" || mode === "plus-lighter",
    dissolve = mode === "dissolve",
    behind = mode === "behind",
    alphaAdd = mode === "alpha-add";
  const sc = [0, 0, 0],
    dc = [0, 0, 0];
  /** @param {number} i */
  const pixel = (i) => {
    const original = Number(s[i + 3]);
    let sa = original * opacity,
      da = Number(d[i + 3]);
    for (let k = 0; k < 3; k++) {
      sc[k] = original ? Number(s[i + k]) / original : 0;
      dc[k] = da ? Number(d[i + k]) / da : 0;
    }
    if (stencil || silhouette) {
      let mask = sa * (luma ? lum(sc) : 1);
      if (silhouette) mask = 1 - mask;
      for (let k = 0; k < 4; k++) d[i + k] = Number(d[i + k]) * mask;
      return;
    }
    if (add) {
      for (let k = 0; k < 3; k++)
        d[i + k] = clamp(Number(d[i + k]) + Number(s[i + k]) * opacity);
      d[i + 3] = clamp(da + sa);
      return;
    }
    if (dissolve) sa = noise(1, i / 4, 0) < sa ? 1 : 0;
    if (behind) {
      for (let k = 0; k < 3; k++)
        d[i + k] = Number(d[i + k]) + Number(sc[k]) * sa * (1 - da);
      d[i + 3] = da + sa * (1 - da);
      return;
    }
    const rgb = blendColor(dc, sc, mode),
      alpha = alphaAdd ? Math.min(1, sa + da) : sa + da - sa * da;
    for (let k = 0; k < 3; k++)
      d[i + k] = clamp(
        (1 - sa) * Number(d[i + k]) +
          (1 - da) * Number(sc[k]) * sa +
          sa * da * Number(rgb[k]),
      );
    d[i + 3] = alpha;
  };
  if (!region) {
    for (let i = 0; i < d.length; i += 4) pixel(i);
    dst.bbox = sameSize && !stencil ? unionRect(dst.bbox, src.bbox) : undefined;
    return;
  }
  for (let y = region.y0; y < region.y1; y++) {
    const end = (y * W + region.x1) * 4;
    for (let i = (y * W + region.x0) * 4; i < end; i += 4) pixel(i);
  }
  // Outside the region the source is transparent: stencil zeroes, silhouette and
  // behind leave the destination as is, everything else only clamps.
  if (!silhouette && !behind) {
    /** @param {number} from @param {number} to */
    const outside = (from, to) => {
      if (stencil) d.fill(0, from, to);
      else if (add)
        for (let i = from; i < to; i++)
          d[i] = clamp(/** @type {number} */ (d[i]));
      else
        for (let i = from; i < to; i += 4) {
          d[i] = clamp(/** @type {number} */ (d[i]));
          d[i + 1] = clamp(/** @type {number} */ (d[i + 1]));
          d[i + 2] = clamp(/** @type {number} */ (d[i + 2]));
          if (alphaAdd)
            d[i + 3] = Math.min(1, /** @type {number} */ (d[i + 3]));
        }
    };
    outside(0, region.y0 * W * 4);
    for (let y = region.y0; y < region.y1; y++) {
      outside(y * W * 4, (y * W + region.x0) * 4);
      outside((y * W + region.x1) * 4, (y + 1) * W * 4);
    }
    outside(region.y1 * W * 4, H * W * 4);
  }
  dst.bbox = stencil
    ? region
    : silhouette
      ? dst.bbox
      : unionRect(dst.bbox, src.bbox);
}
