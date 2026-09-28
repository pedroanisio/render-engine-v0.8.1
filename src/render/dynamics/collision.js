/** Convex alpha hulls and triangulated SVG collision outlines. */
import earcut from "earcut";
import { svgPathProperties } from "svg-path-properties";
/** @typedef {[number,number]} Point */
/** @param {Point[]} points @returns {Point[]} */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (
    /** @type {Point} */ o,
    /** @type {Point} */ a,
    /** @type {Point} */ b,
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  /** @type {Point[]} */ const lower = [],
    upper = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(
        /** @type {Point} */ (lower.at(-2)),
        /** @type {Point} */ (lower.at(-1)),
        p,
      ) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of sorted.reverse()) {
    while (
      upper.length >= 2 &&
      cross(
        /** @type {Point} */ (upper.at(-2)),
        /** @type {Point} */ (upper.at(-1)),
        p,
      ) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** @param {{width:number,height:number,data:Float32Array}} image @param {number} width @param {number} height */
export function alphaHull(image, width, height) {
  /** @type {Point[]} */ const points = [];
  for (let y = 0; y < image.height; y++) {
    let left = -1,
      right = -1;
    for (let x = 0; x < image.width; x++)
      if (Number(image.data[(y * image.width + x) * 4 + 3]) >= 0.5) {
        if (left < 0) left = x;
        right = x;
      }
    if (left >= 0)
      for (const [x, v] of [
        [left, y],
        [left, y + 1],
        [right + 1, y],
        [right + 1, y + 1],
      ])
        points.push([
          (Number(x) * width) / image.width,
          (Number(v) * height) / image.height,
        ]);
  }
  const hull = convexHull(points);
  if (hull.length < 3)
    throw new Error("convex-hull requires nonempty image alpha");
  return triangulate(hull);
}
/** @param {Point[]} points @returns {Point[][]} */
function triangulate(points) {
  const indices = earcut(points.flat()),
    triangles = [];
  for (let i = 0; i < indices.length; i += 3)
    triangles.push([
      /** @type {Point} */ (points[Number(indices[i])]),
      /** @type {Point} */ (points[Number(indices[i + 1])]),
      /** @type {Point} */ (points[Number(indices[i + 2])]),
    ]);
  return triangles;
}
/** @param {string} source @returns {Point[][]} */
export function pathTriangles(source) {
  const p = new svgPathProperties(source),
    parts = p.getParts();
  /** @type {Point[]} */ const points = [];
  for (const part of parts) {
    const n = Math.max(1, Math.min(128, Math.ceil(part.length / 2)));
    for (let i = 0; i < n; i++) {
      const v = part.getPointAtLength((part.length * i) / n);
      points.push([v.x, v.y]);
    }
  }
  if (points.length > 4096)
    throw new Error("collision path point budget exceeded");
  const triangles = triangulate(points);
  if (!triangles.length) throw new Error("collision path has no area");
  return triangles;
}
