/**
 * Text assets: word wrapping, shrink-to-fit and alignment, rasterised from
 * TrueType outlines by a nonzero-winding scanline filler with 4 sub-scanlines
 * per pixel and exact horizontal coverage.
 */
import { Surface } from './surface.js';

/** @typedef {import('opentype.js').Font} Font */
/** @typedef {Array<[number, number, number, number, number]>} Edges x0, y0, x1, y1, winding */

const SUB = 4;

/**
 * Flattens a glyph path into edges, curves split into fixed segment counts.
 * @param {import('opentype.js').Path} path
 * @returns {Edges}
 */
export function pathEdges(path) {
  /** @type {Edges} */
  const edges = [];
  let sx = 0;
  let sy = 0;
  let cx = 0;
  let cy = 0;
  /** @param {number} x @param {number} y */
  const line = (x, y) => {
    if (y !== cy) edges.push(y > cy ? [cx, cy, x, y, 1] : [x, y, cx, cy, -1]);
    cx = x;
    cy = y;
  };
  for (const c of path.commands) {
    if (c.type === 'M') {
      sx = c.x;
      sy = c.y;
      cx = c.x;
      cy = c.y;
    } else if (c.type === 'L') line(c.x, c.y);
    else if (c.type === 'Q') {
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        line(
          u * u * x0 + 2 * u * t * c.x1 + t * t * c.x,
          u * u * y0 + 2 * u * t * c.y1 + t * t * c.y,
        );
      }
    } else if (c.type === 'C') {
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const u = 1 - t;
        line(
          u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        );
      }
    } else line(sx, sy);
  }
  return edges;
}

/**
 * Rasterises edges into an alpha coverage buffer of width x height.
 * @param {Edges} edges @param {number} width @param {number} height
 * @returns {Float32Array}
 */
export function coverage(edges, width, height) {
  const cov = new Float32Array(width * height);
  /** @type {Array<[number, number]>} */
  const xs = [];
  for (let py = 0; py < height; py++) {
    for (let s = 0; s < SUB; s++) {
      const y = py + (s + 0.5) / SUB;
      xs.length = 0;
      for (const [x0, y0, x1, y1, w] of edges) {
        if (y >= y0 && y < y1) xs.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), w]);
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind += /** @type {[number, number]} */ (xs[k])[1];
        if (wind === 0) continue;
        const a = Math.max(0, /** @type {[number, number]} */ (xs[k])[0]);
        const b = Math.min(width, /** @type {[number, number]} */ (xs[k + 1])[0]);
        for (let px = Math.floor(a); px < Math.ceil(b); px++) {
          const c = Math.min(b, px + 1) - Math.max(a, px);
          const i = py * width + px;
          cov[i] = /** @type {number} */ (cov[i]) + c / SUB;
        }
      }
    }
  }
  for (let i = 0; i < cov.length; i++) cov[i] = Math.min(1, /** @type {number} */ (cov[i]));
  return cov;
}

/**
 * @typedef {object} TextSpec
 * @property {string} text
 * @property {number} width
 * @property {number} height
 * @property {number} size
 * @property {number} minSize
 * @property {number} maxSize
 * @property {number} lineHeight multiple of the size
 * @property {'left' | 'center' | 'right'} align
 * @property {'top' | 'middle' | 'bottom'} verticalAlign
 * @property {boolean} shrink
 */

/**
 * Greedy word wrap honouring explicit newlines.
 * @param {Font} font @param {string} text @param {number} size @param {number} width
 * @returns {string[]}
 */
export function wrap(font, text, size, width) {
  /** @type {string[]} */
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.getAdvanceWidth(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Lays out and rasterises a text block; returns the largest size (<= maxSize,
 * >= minSize, 1 px steps) whose lines fit the box when shrink is on.
 * @param {Font} font @param {TextSpec} spec @param {import('./color.js').Rgba} rgba @param {number} scale output scale
 * @returns {{ surface: Surface, size: number, lines: string[], baseline:number }}
 */
export function renderText(font, spec, rgba, scale) {
  const fits = (/** @type {number} */ size) => {
    const lines = wrap(font, spec.text, size, spec.width);
    const tall = lines.length * size * spec.lineHeight <= spec.height;
    const wide = lines.every((l) => font.getAdvanceWidth(l, size) <= spec.width);
    return tall && wide ? lines : null;
  };
  let size = spec.shrink ? spec.maxSize : spec.size;
  let lines = fits(size);
  while (!lines && spec.shrink && size - 1 >= spec.minSize) {
    size -= 1;
    lines = fits(size);
  }
  if (!lines) lines = wrap(font, spec.text, size, spec.width); // overflow is clipped by the box
  const w = Math.max(1, Math.round(spec.width * scale));
  const h = Math.max(1, Math.round(spec.height * scale));
  const lh = size * spec.lineHeight;
  const block = lines.length * lh;
  const top =
    spec.verticalAlign === 'top'
      ? 0
      : spec.verticalAlign === 'bottom'
        ? spec.height - block
        : (spec.height - block) / 2;
  const ascent = (font.ascender / font.unitsPerEm) * size;
  const descent = (-font.descender / font.unitsPerEm) * size;
  /** @type {Edges} */
  const edges = [];
  lines.forEach((line, i) => {
    const adv = font.getAdvanceWidth(line, size);
    const x =
      spec.align === 'left'
        ? 0
        : spec.align === 'right'
          ? spec.width - adv
          : (spec.width - adv) / 2;
    const baseline = top + i * lh + (lh - ascent - descent) / 2 + ascent;
    for (const e of pathEdges(font.getPath(line, x * scale, baseline * scale, size * scale)))
      edges.push(e);
  });
  const cov = coverage(edges, w, h);
  const surface = new Surface(w, h);
  const [r, g, b, a] = rgba;
  for (let i = 0; i < cov.length; i++) {
    const c = /** @type {number} */ (cov[i]) * a;
    surface.data.set([r * c, g * c, b * c, c], i * 4);
  }
  return {
    surface,
    size,
    lines,
    baseline: top + (lh - ascent - descent) / 2 + ascent,
  };
}
