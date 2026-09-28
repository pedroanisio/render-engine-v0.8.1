/** Affine transforms, in SVG order [a,b,c,d,e,f]. */
/** @typedef {[number,number,number,number,number,number]} Matrix */
/** @type {Matrix} */ export const IDENTITY = [1, 0, 0, 1, 0, 0];
/** @param {Matrix} a @param {Matrix} b @returns {Matrix} */
export function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/** @param {Matrix} m */
export function inverse(m) {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-12) return null;
  return /** @type {Matrix} */ ([
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ]);
}
/** @param {Matrix} m @param {number} x @param {number} y */
export function point(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
/** @param {unknown} value @param {number} parent @param {number} vw @param {number} vh */
export function length(value, parent, vw, vh) {
  if (typeof value === "number") return value;
  const m = /^(-?[\d.]+)(%|vw|vh|vmin|vmax)$/.exec(String(value));
  if (!m) throw new Error(`invalid length ${String(value)}`);
  return (
    (Number(m[1]) / 100) *
    (m[2] === "%"
      ? parent
      : m[2] === "vw"
        ? vw
        : m[2] === "vh"
          ? vh
          : m[2] === "vmin"
            ? Math.min(vw, vh)
            : Math.max(vw, vh))
  );
}
/** @param {Record<string,any>} a @param {number} w @param {number} h @param {number} vw @param {number} vh @param {'pivot'|'position'} [anchorMode] @returns {Matrix} */
export function transform(a, w, h, vw, vh, anchorMode = "pivot") {
  const x = length(a.x ?? 0, w, vw, vh),
    y = length(a.y ?? 0, h, vw, vh),
    ax = length(a.anchorX ?? 0, w, vw, vh),
    ay = length(a.anchorY ?? 0, h, vw, vh),
    r = (Number(a.rotation ?? 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  let m = /** @type {Matrix} */ ([
    1,
    0,
    0,
    1,
    x + (anchorMode === "pivot" ? ax : 0),
    y + (anchorMode === "pivot" ? ay : 0),
  ]);
  m = multiply(m, [c, s, -s, c, 0, 0]);
  m = multiply(m, [
    1,
    Math.tan((Number(a.skewY ?? 0) * Math.PI) / 180),
    Math.tan((Number(a.skewX ?? 0) * Math.PI) / 180),
    1,
    0,
    0,
  ]);
  m = multiply(m, [Number(a.scaleX ?? 1), 0, 0, Number(a.scaleY ?? 1), 0, 0]);
  return multiply(m, [1, 0, 0, 1, -ax, -ay]);
}
/** @param {Matrix} m */ export const dom = (m) => ({
  a: m[0],
  b: m[1],
  c: m[2],
  d: m[3],
  e: m[4],
  f: m[5],
});
