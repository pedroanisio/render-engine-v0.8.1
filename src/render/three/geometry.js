/** Indexed triangles with outward winding. Local origin is the primitive center. */
/** @typedef {import('./raster.js').Vec} Vec */
/** @typedef {{points:Vec[],triangles:number[][]}} Geometry */
/** @param {Record<string,any>} a @returns {Geometry} */
export function primitive(a) {
  const type = String(a.primitive),
    r = Number(a.radius ?? 50),
    w = Number(a.width ?? 2 * r),
    h = Number(a.height ?? 2 * r),
    d = Number(a.depth ?? 10),
    n = Number(a.segments ?? 32);
  if (!Number.isInteger(n) || n < 3 || n > 256)
    throw new Error("3D segments must be an integer from 3 to 256");
  /** @type {Vec[]} */ const points = [];
  /** @type {number[][]} */ const triangles = [];
  if (type === "box" || type === "plane") {
    points.push(
      [-w / 2, -h / 2, -d / 2],
      [w / 2, -h / 2, -d / 2],
      [w / 2, h / 2, -d / 2],
      [-w / 2, h / 2, -d / 2],
    );
    triangles.push([0, 3, 2], [0, 2, 1]);
    if (type === "box") {
      points.push(
        [-w / 2, -h / 2, d / 2],
        [w / 2, -h / 2, d / 2],
        [w / 2, h / 2, d / 2],
        [-w / 2, h / 2, d / 2],
      );
      triangles.push(
        [4, 5, 6],
        [4, 6, 7],
        [0, 1, 5],
        [0, 5, 4],
        [3, 7, 6],
        [3, 6, 2],
        [0, 4, 7],
        [0, 7, 3],
        [1, 2, 6],
        [1, 6, 5],
      );
    } else for (const p of points) p[2] = 0;
    return { points, triangles };
  }
  if (!["sphere", "cylinder", "cone", "torus", "capsule"].includes(type))
    throw new Error(`unsupported primitive ${type}`);
  const rows = type === "cylinder" || type === "cone" ? 1 : n;
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * Math.PI * 2,
        v = j / rows;
      if (type === "torus") {
        const minor = d / 2,
          b = v * Math.PI * 2;
        points.push([
          (r + minor * Math.cos(b)) * Math.cos(u),
          minor * Math.sin(b),
          (r + minor * Math.cos(b)) * Math.sin(u),
        ]);
      } else if (type === "sphere" || type === "capsule") {
        const theta = v * Math.PI,
          rr = r * Math.sin(theta);
        points.push([
          rr * Math.cos(u),
          -r * Math.cos(theta) +
            (type === "capsule" ? (v < 0.5 ? -h / 2 : h / 2) : 0),
          rr * Math.sin(u),
        ]);
      } else {
        const rr = type === "cone" ? r * v : r;
        points.push([rr * Math.cos(u), (v - 0.5) * h, rr * Math.sin(u)]);
      }
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      triangles.push([k, k + 1, k + n + 2], [k, k + n + 2, k + n + 1]);
    }
  if (type === "cylinder" || type === "cone") {
    const top = points.length;
    points.push([0, -h / 2, 0], [0, h / 2, 0]);
    for (let i = 0; i < n; i++) {
      if (type === "cylinder") triangles.push([top, i + 1, i]);
      triangles.push([top + 1, n + 1 + i, n + 2 + i]);
    }
  }
  for (const t of triangles) t.reverse();
  return { points, triangles };
}
/** Convert static Assimp/OpenUSD triangle geometry while retaining hierarchy transforms.
 * Imported material, animation and splat data require separate backends; fail explicitly.
 * @param {any} mesh @returns {Geometry} */
export function importedGeometry(mesh) {
  /** @type {Geometry} */ const out = { points: [], triangles: [] };
  if (!mesh || mesh.format === "splat")
    throw new Error("object3D requires a triangle mesh");
  /** @param {number[]} m @param {Vec} p @returns {Vec} */
  const apply = (m, p) => [
    Number(m[0]) * p[0] +
      Number(m[1]) * p[1] +
      Number(m[2]) * p[2] +
      Number(m[3]),
    Number(m[4]) * p[0] +
      Number(m[5]) * p[1] +
      Number(m[6]) * p[2] +
      Number(m[7]),
    Number(m[8]) * p[0] +
      Number(m[9]) * p[1] +
      Number(m[10]) * p[2] +
      Number(m[11]),
  ];
  /** @param {Vec[]} points @param {number[][]} faces */
  const append = (points, faces) => {
    const offset = out.points.length;
    out.points.push(...points);
    for (const f of faces) {
      if (f.length !== 3)
        throw new Error("mesh must be triangulated before rendering");
      if (f.some((i) => !Number.isInteger(i) || i < 0 || i >= points.length))
        throw new Error("invalid mesh vertex index");
      out.triangles.push(f.map((i) => i + offset));
    }
  };
  if (mesh.format === "usd") {
    for (const m of mesh.meshes) {
      const matrix = m.transform.flat(),
        transposed = Array.from({ length: 16 }, (_, i) =>
          Number(matrix[(i % 4) * 4 + Math.floor(i / 4)]),
        );
      let cursor = 0;
      /** @type {number[][]} */ const faces = [];
      for (const count of m.faceVertexCounts) {
        faces.push(m.faceVertexIndices.slice(cursor, cursor + count));
        cursor += count;
      }
      append(
        m.points.map((/** @type {Vec} */ p) => apply(transposed, p)),
        faces,
      );
    }
  } else {
    /** @param {any} node @param {(p:Vec)=>Vec} parent */
    const visit = (node, parent) => {
      const transform = (/** @type {Vec} */ p) =>
        parent(apply(node.transformation, p));
      for (const index of node.meshes ?? []) {
        const m = mesh.meshes[index];
        /** @type {Vec[]} */ const points = [];
        for (let i = 0; i < m.vertices.length; i += 3)
          points.push(
            transform([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]),
          );
        append(points, m.faces);
      }
      for (const child of node.children ?? []) visit(child, transform);
    };
    if (!mesh.rootnode) throw new Error("mesh hierarchy is missing");
    visit(mesh.rootnode, (p) => p);
  }
  if (out.points.some((p) => p.some((v) => !Number.isFinite(v))))
    throw new Error("non-finite mesh geometry");
  if (out.triangles.length > 100000)
    throw new Error("3D triangle budget exceeded");
  return out;
}
