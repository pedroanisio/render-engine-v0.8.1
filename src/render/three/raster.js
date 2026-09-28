/** Camera-space triangles. +X right, +Y down, +Z away from the camera. */
import { Surface } from "../surface.js";
import { sample } from "../fx/pixels.js";
/** @typedef {[number,number,number]} Vec */
/** @typedef {{p:Vec,uv:[number,number]}} Vertex */
/** @typedef {{vertices:Vertex[],texture?:Surface,color?:number[],doubleSided?:boolean}} Face */
/** @typedef {{near:number,far:number,focal:number,ortho?:number,cx:number,cy:number}} Camera */
/** @param {Vec} a @param {Vec} b @returns {Vec} */
export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {Vec} a @param {Vec} b */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {Vec} a @param {Vec} b @returns {Vec} */
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** @param {Vec} a @returns {Vec} */
export function normalize(a) {
  const n = Math.hypot(...a);
  if (n < 1e-12) throw new Error("degenerate 3D axis");
  return [a[0] / n, a[1] / n, a[2] / n];
}
/** @param {Vec} p @param {number} x @param {number} y @param {number} z @returns {Vec} */
export function rotate(p, x, y, z) {
  const r = Math.PI / 180,
    cx = Math.cos(x * r),
    sx = Math.sin(x * r),
    cy = Math.cos(y * r),
    sy = Math.sin(y * r),
    cz = Math.cos(z * r),
    sz = Math.sin(z * r);
  const a = p[1] * cx - p[2] * sx,
    b = p[1] * sx + p[2] * cx,
    c = p[0] * cy + b * sy,
    d = -p[0] * sy + b * cy;
  return [c * cz - a * sz, c * sz + a * cz, d];
}
/** Clip before perspective divide, interpolating attributes in camera space.
 * @param {Vertex[]} vertices @param {number} z @param {boolean} greater */
export function clipDepth(vertices, z, greater) {
  /** @type {Vertex[]} */ const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = /** @type {Vertex} */ (vertices[i]),
      b = /** @type {Vertex} */ (vertices[(i + 1) % vertices.length]);
    const ai = greater ? a.p[2] >= z : a.p[2] <= z,
      bi = greater ? b.p[2] >= z : b.p[2] <= z;
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (z - a.p[2]) / (b.p[2] - a.p[2]);
      out.push({
        p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, z],
        uv: [
          a.uv[0] + (b.uv[0] - a.uv[0]) * t,
          a.uv[1] + (b.uv[1] - a.uv[1]) * t,
        ],
      });
    }
  }
  return out;
}
/** @param {Vec} p @param {Camera} c @returns {[number,number,number]} */
export function project(p, c) {
  const s = c.ortho ?? c.focal / p[2];
  return [
    c.cx + p[0] * s,
    c.cy + p[1] * s,
    c.ortho === undefined ? 1 / p[2] : 1,
  ];
}
/** Deterministic triangle coverage; a top-left rule avoids alpha seams.
 * Transparent fragments sort per pixel, so intersecting translucent faces work.
 * @param {number} width @param {number} height @param {Face[]} faces @param {Camera} camera */
export function raster(width, height, faces, camera) {
  if (!(camera.near > 0 && camera.far > camera.near && camera.focal > 0))
    throw new Error("invalid camera clipping or focal length");
  const out = new Surface(width, height);
  /** @type {Map<number,{z:number,c:number[]}[]>} */ const fragments =
    new Map();
  let count = 0;
  /** @param {number[]} a @param {number[]} b @param {number} x @param {number} y */
  const edge = (a, b, x, y) =>
    (Number(b[0]) - Number(a[0])) * (y - Number(a[1])) -
    (Number(b[1]) - Number(a[1])) * (x - Number(a[0]));
  /** @param {number[]} a @param {number[]} b */
  const top = (a, b) =>
    Number(b[1]) < Number(a[1]) ||
    (b[1] === a[1] && Number(b[0]) > Number(a[0]));
  for (const face of faces) {
    const polygon = clipDepth(
      clipDepth(face.vertices, camera.near, true),
      camera.far,
      false,
    );
    for (let t = 1; t < polygon.length - 1; t++) {
      let a = /** @type {Vertex} */ (polygon[0]),
        b = /** @type {Vertex} */ (polygon[t]),
        c = /** @type {Vertex} */ (polygon[t + 1]);
      let pa = project(a.p, camera),
        pb = project(b.p, camera),
        pc = project(c.p, camera),
        area = edge(pa, pb, pc[0], pc[1]);
      if (Math.abs(area) < 1e-10 || (!face.doubleSided && area >= 0)) continue;
      if (area < 0) {
        [b, c] = [c, b];
        [pb, pc] = [pc, pb];
        area = -area;
      }
      const x0 = Math.max(0, Math.ceil(Math.min(pa[0], pb[0], pc[0]) - 0.5)),
        x1 = Math.min(
          width - 1,
          Math.floor(Math.max(pa[0], pb[0], pc[0]) - 0.5),
        );
      const y0 = Math.max(0, Math.ceil(Math.min(pa[1], pb[1], pc[1]) - 0.5)),
        y1 = Math.min(
          height - 1,
          Math.floor(Math.max(pa[1], pb[1], pc[1]) - 0.5),
        );
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const e0 = edge(pb, pc, x + 0.5, y + 0.5),
            e1 = edge(pc, pa, x + 0.5, y + 0.5),
            e2 = edge(pa, pb, x + 0.5, y + 0.5);
          if (
            e0 < 0 ||
            e1 < 0 ||
            e2 < 0 ||
            (e0 === 0 && !top(pb, pc)) ||
            (e1 === 0 && !top(pc, pa)) ||
            (e2 === 0 && !top(pa, pb))
          )
            continue;
          const l0 = e0 / area,
            l1 = e1 / area,
            l2 = e2 / area,
            q = l0 * pa[2] + l1 * pb[2] + l2 * pc[2];
          const z =
            camera.ortho === undefined
              ? 1 / q
              : l0 * a.p[2] + l1 * b.p[2] + l2 * c.p[2];
          const color = face.color ?? [1, 1, 1, 1];
          let rgba = color.slice();
          if (face.texture) {
            const texture = face.texture;
            const u =
              (l0 * a.uv[0] * pa[2] +
                l1 * b.uv[0] * pb[2] +
                l2 * c.uv[0] * pc[2]) /
              q;
            const v =
              (l0 * a.uv[1] * pa[2] +
                l1 * b.uv[1] * pb[2] +
                l2 * c.uv[1] * pc[2]) /
              q;
            rgba = [0, 1, 2, 3].map(
              (k) =>
                sample(
                  texture,
                  u * texture.width - 0.5,
                  v * texture.height - 0.5,
                  k,
                  true,
                ) * Number(color[k]),
            );
          }
          if (Number(rgba[3]) <= 0) continue;
          const index = y * width + x,
            list = fragments.get(index) ?? [];
          list.push({ z, c: rgba });
          fragments.set(index, list);
          if (++count > 16000000)
            throw new Error("3D fragment budget exceeded");
        }
    }
  }
  for (const [index, list] of fragments) {
    list.sort((a, b) => b.z - a.z);
    for (const f of list)
      for (let k = 0; k < 4; k++)
        out.data[index * 4 + k] =
          Number(f.c[k]) +
          Number(out.data[index * 4 + k]) * (1 - Number(f.c[3]));
  }
  return out;
}
