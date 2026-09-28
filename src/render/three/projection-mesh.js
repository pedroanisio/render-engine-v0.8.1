/** Spherical Video V2 projection meshes. Coordinates use OpenGL axes and UVs. */
import { deflateRawSync } from "node:zlib";
/** @param {number} n */
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
/** @param {string} type @param {Buffer} data */
export const mp4Box = (type, data) =>
  Buffer.concat([u32(data.length + 8), Buffer.from(type), data]);
/** @param {number[]} values @param {number} bits */
function packed(values, bits) {
  const b = Buffer.alloc(Math.ceil((values.length * bits) / 8));
  let at = 0;
  for (const v of values)
    for (let i = bits - 1; i >= 0; i--, at++)
      b[at >> 3] = Number(b[at >> 3]) | (((v >>> i) & 1) << (7 - (at & 7)));
  return b;
}
/** @param {number} d */ const zig = (d) => (d < 0 ? -d * 2 - 1 : d * 2);
/** Per-eye unit mesh, sampled densely enough for subpixel angular interpolation.
 * @param {string} layout @returns {{vertices:number[][],indices:number[]}} */
export function projectionMesh(layout) {
  const vertices = [],
    indices = [],
    n = 64,
    faces = layout === "fisheye-180" ? 1 : 6;
  const forward = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ],
    right = [
      [0, -1, 0],
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
    ],
    up = [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 0],
    ];
  for (let f = 0; f < faces; f++) {
    const base = vertices.length;
    for (let y = 0; y <= n; y++)
      for (let x = 0; x <= n; x++) {
        const u = x / n,
          v = y / n;
        if (layout === "fisheye-180") {
          const theta = (v * Math.PI) / 2,
            phi = u * 2 * Math.PI;
          vertices.push([
            Math.sin(theta) * Math.cos(phi),
            Math.sin(theta) * Math.sin(phi),
            -Math.cos(theta),
            0.5 + 0.5 * v * Math.cos(phi),
            0.5 + 0.5 * v * Math.sin(phi),
          ]);
        } else {
          const sx =
              layout === "eac"
                ? Math.tan(((u - 0.5) * Math.PI) / 2)
                : 2 * u - 1,
            sy =
              layout === "eac"
                ? Math.tan(((v - 0.5) * Math.PI) / 2)
                : 2 * v - 1,
            p = [0, 1, 2].map(
              (k) =>
                Number(forward[f]?.[k]) +
                sx * Number(right[f]?.[k]) +
                sy * Number(up[f]?.[k]),
            ),
            l = Math.hypot(...p);
          vertices.push([
            ...p.map((z) => z / l),
            ((f % 3) + u) / 3,
            1 - (Math.floor(f / 3) + 1 - v) / 2,
          ]);
        }
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = base + y * (n + 1) + x,
          b = a + 1,
          c = a + n + 1,
          d = c + 1;
        // Interior-facing winding: viewer is inside the projection surface.
        if (layout === "fisheye-180") indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
  }
  return { vertices, indices };
}
/** @param {string} layout */
function meshBox(layout) {
  const { vertices, indices } = projectionMesh(layout),
    coords = [],
    lookup = new Map(),
    previous = [0, 0, 0, 0, 0],
    deltas = [];
  for (const vertex of vertices)
    for (let k = 0; k < 5; k++) {
      const value = Math.fround(Number(vertex[k]));
      let index = lookup.get(value);
      if (index === undefined) {
        index = coords.length;
        coords.push(value);
        lookup.set(value, index);
      }
      deltas.push(zig(index - Number(previous[k])));
      previous[k] = index;
    }
  const floats = Buffer.alloc(coords.length * 4);
  coords.forEach((v, i) => floats.writeFloatBE(v, i * 4));
  let last = 0;
  const encoded = indices.map((i) => {
    const d = zig(i - last);
    last = i;
    return d;
  });
  return mp4Box(
    "mesh",
    Buffer.concat([
      u32(coords.length),
      floats,
      u32(vertices.length),
      packed(deltas, Math.ceil(Math.log2(coords.length * 2))),
      u32(1),
      Buffer.from([0, 0]),
      u32(indices.length),
      packed(encoded, Math.ceil(Math.log2(vertices.length * 2))),
    ]),
  );
}
/** @param {Buffer} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const v of bytes) {
    crc ^= v;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** @param {string} layout @param {string} stereo */
export function projectionBoxes(layout, stereo) {
  let data;
  if (layout === "equirectangular") data = mp4Box("equi", Buffer.alloc(20));
  else {
    if (!["cubemap", "eac", "fisheye-180"].includes(layout))
      throw new Error("unknown spherical projection");
    const encoded = Buffer.concat([
      Buffer.from("dfl8"),
      deflateRawSync(meshBox(layout)),
    ]);
    data = mp4Box(
      "mshp",
      Buffer.concat([Buffer.alloc(4), u32(crc32(encoded)), encoded]),
    );
  }
  return Buffer.concat([
    mp4Box(
      "st3d",
      Buffer.from([
        0,
        0,
        0,
        0,
        stereo === "top-bottom" ? 1 : stereo === "left-right" ? 2 : 0,
      ]),
    ),
    mp4Box(
      "sv3d",
      Buffer.concat([
        mp4Box(
          "svhd",
          Buffer.concat([Buffer.alloc(4), Buffer.from("scene-render-js\0")]),
        ),
        mp4Box("proj", Buffer.concat([mp4Box("prhd", Buffer.alloc(16)), data])),
      ]),
    ),
  ]);
}
