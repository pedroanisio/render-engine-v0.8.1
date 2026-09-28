/**
 * PNG decoding into premultiplied linear surfaces, optionally reduced by a box
 * filter to the render scale so that large plates are resampled once per load.
 */
import { PNG } from 'pngjs';
import { SRGB_TO_LINEAR, encodeSrgb } from './color.js';
import { Surface } from './surface.js';

/**
 * @param {Uint8Array} bytes PNG file
 * @param {number} scale 0 < scale <= 1
 * @returns {Surface}
 */
export function decodePng(bytes, scale = 1) {
  const png = PNG.sync.read(Buffer.from(bytes));
  const w = Math.max(1, Math.round(png.width * scale));
  const h = Math.max(1, Math.round(png.height * scale));
  const out = new Surface(w, h);
  const src = png.data;
  const d = out.data;
  const fx = png.width / w;
  const fy = png.height / h;
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * fy);
    const yb = Math.max(ya + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x * fx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = ya; sy < yb; sy++) {
        for (let sx = xa; sx < xb; sx++) {
          const j = (sy * png.width + sx) * 4;
          const al = /** @type {number} */ (src[j + 3]) / 255;
          r +=
            /** @type {number} */ (
              SRGB_TO_LINEAR[/** @type {number} */ (src[j])]
            ) * al;
          g +=
            /** @type {number} */ (
              SRGB_TO_LINEAR[/** @type {number} */ (src[j + 1])]
            ) * al;
          b +=
            /** @type {number} */ (
              SRGB_TO_LINEAR[/** @type {number} */ (src[j + 2])]
            ) * al;
          a += al;
        }
      }
      const n = (yb - ya) * (xb - xa);
      const i = (y * w + x) * 4;
      d[i] = r / n;
      d[i + 1] = g / n;
      d[i + 2] = b / n;
      d[i + 3] = a / n;
    }
  }
  return out;
}

/**
 * @param {Surface} s
 * @returns {Uint8Array} PNG bytes (straight alpha, sRGB)
 */
export function encodePng(s) {
  const png = new PNG({ width: s.width, height: s.height });

  for (let i = 0; i < s.width * s.height; i++) {
    const a = /** @type {number} */ (s.data[i * 4 + 3]);
    png.data[i * 4] = encodeSrgb(a ? Number(s.data[i * 4]) / a : 0);
    png.data[i * 4 + 1] = encodeSrgb(a ? Number(s.data[i * 4 + 1]) / a : 0);
    png.data[i * 4 + 2] = encodeSrgb(a ? Number(s.data[i * 4 + 2]) / a : 0);
    png.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
  }
  return PNG.sync.write(png);
}
