/** Asset import into premultiplied linear sRGB. Output tone mapping is separate. */
import { readFileSync } from "node:fs";
const tables = JSON.parse(
  readFileSync(new URL("./color-tables.json", import.meta.url), "utf8"),
);
import { Surface } from "../render/surface.js";
/** @param {number} v @param {string} transfer */
export function linearize(v, transfer) {
  if (transfer === "linear") return v;
  const lut = tables.curves[transfer];
  if (lut) {
    const index = Math.max(
        0,
        Math.min(tables.resolution, v * tables.resolution),
      ),
      lo = Math.floor(index),
      hi = Math.min(tables.resolution, lo + 1);
    return Number(lut[lo]) + (Number(lut[hi]) - Number(lut[lo])) * (index - lo);
  }
  if (transfer === "gamma22") return Math.max(0, v) ** 2.2;
  if (transfer === "bt1886") return Math.max(0, v) ** 2.4;
  if (transfer === "gamma26") return Math.max(0, v) ** 2.6;
  if (transfer === "pq") {
    const p = Math.max(0, v) ** (1 / (2523 / 32));
    return (
      (Math.max(0, p - 3424 / 4096) / (2413 / 128 - (2392 / 128) * p)) **
        (1 / (2610 / 16384)) *
      100
    );
  }
  if (transfer === "hlg")
    return v <= 0.5
      ? (v * v) / 3
      : (Math.exp((v - 0.55991073) / 0.17883277) + 0.28466892) / 12;
  if (!["srgb", "auto"].includes(transfer))
    throw new Error(`Unknown transfer ${transfer}`);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
/** @param {Uint8Array|Uint8ClampedArray|Uint16Array|Float32Array} bytes @param {number} w @param {number} h @param {Record<string,any>} [a] */
export function rgbaSurface(bytes, w, h, a = {}) {
  const out = new Surface(w, h),
    div =
      bytes instanceof Float32Array
        ? 1
        : bytes instanceof Uint16Array
          ? 65535
          : 255,
    space = a.colorSpace ?? "srgb",
    transfer =
      a.transfer === "auto" || !a.transfer
        ? ["linear-srgb", "acescg", "aces2065-1", "xyz-d65", "raw"].includes(
            space,
          )
          ? "linear"
          : space === "acescct"
            ? "acescct"
            : space === "rec709"
              ? "bt1886"
              : space === "dci-p3"
                ? "gamma26"
                : "srgb"
        : a.transfer;
  const m = ["srgb", "linear-srgb", "rec709"].includes(space)
    ? undefined
    : tables.matrices[space];
  const opaque = a.alpha === "none",
    premultiplied = a.alpha === "premultiplied",
    d = out.data;
  // 8-bit straight input takes one of 256 values per channel: linearize each once.
  /** @type {Float64Array|undefined} */ let lut;
  if (div === 255 && !premultiplied) {
    lut = new Float64Array(256);
    for (let v = 0; v < 256; v++) lut[v] = linearize(v / 255, transfer);
  }
  const m0 = m ? Number(m[0]) : 0,
    m1 = m ? Number(m[1]) : 0,
    m2 = m ? Number(m[2]) : 0,
    m3 = m ? Number(m[3]) : 0,
    m4 = m ? Number(m[4]) : 0,
    m5 = m ? Number(m[5]) : 0,
    m6 = m ? Number(m[6]) : 0,
    m7 = m ? Number(m[7]) : 0,
    m8 = m ? Number(m[8]) : 0;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    let alpha = opaque ? 1 : /** @type {number} */ (bytes[j + 3]) / div;
    alpha = Math.max(0, Math.min(1, alpha));
    let r, g, b;
    if (lut) {
      r = /** @type {number} */ (lut[/** @type {number} */ (bytes[j])]);
      g = /** @type {number} */ (lut[/** @type {number} */ (bytes[j + 1])]);
      b = /** @type {number} */ (lut[/** @type {number} */ (bytes[j + 2])]);
    } else {
      let vr = /** @type {number} */ (bytes[j]) / div,
        vg = /** @type {number} */ (bytes[j + 1]) / div,
        vb = /** @type {number} */ (bytes[j + 2]) / div;
      if (premultiplied) {
        vr = alpha ? vr / alpha : 0;
        vg = alpha ? vg / alpha : 0;
        vb = alpha ? vb / alpha : 0;
      }
      r = linearize(vr, transfer);
      g = linearize(vg, transfer);
      b = linearize(vb, transfer);
    }
    if (m) {
      const r1 = m0 * r + m1 * g + m2 * b,
        g1 = m3 * r + m4 * g + m5 * b,
        b1 = m6 * r + m7 * g + m8 * b;
      r = r1;
      g = g1;
      b = b1;
    }
    d[j] = r * alpha;
    d[j + 1] = g * alpha;
    d[j + 2] = b * alpha;
    d[j + 3] = alpha;
  }
  return out;
}
