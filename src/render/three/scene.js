/** First geometry backend: centered solids and explicitly unlit triangle meshes. */
import { primitive, importedGeometry } from "./geometry.js";
import { raster, rotate, normalize, subtract, cross, dot } from "./raster.js";
import { parseColor } from "../color.js";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @typedef {import('./raster.js').Vec} Vec */
/** @param {import('../frame.js').FrameRenderer} host */
export function render3D(host) {
  const attrs = (/** @type {Node} */ n) => host.attributes(n);
  const nodes = host.composition.children.filter((n) => n.name === "object3D");
  const ids = new Map(nodes.map((n) => [String(n.attributes.id), n]));
  /** @param {Node} node @param {Vec} point @param {Set<Node>} [seen] @returns {Vec} */
  const world = (node, point, seen = new Set()) => {
    if (seen.has(node)) throw new Error("3D parenting cycle");
    seen.add(node);
    const a = attrs(node),
      p = rotate(
        [
          point[0] * Number(a.scaleX ?? 1),
          point[1] * Number(a.scaleY ?? 1),
          point[2] * Number(a.scaleZ ?? 1),
        ],
        Number(a.rotationX ?? 0),
        Number(a.rotationY ?? 0),
        Number(a.rotation ?? 0),
      );
    const moved = /** @type {Vec} */ ([
      p[0] + Number(a.x ?? 0),
      p[1] + Number(a.y ?? 0),
      p[2] + Number(a.z ?? 0),
    ]);
    if (a.parent) {
      const parent = ids.get(String(a.parent));
      if (!parent) throw new Error("3D parent must be a top-level object3D");
      return world(parent, moved, seen);
    }
    return moved;
  };
  /** @param {Node} node @returns {number} */
  const orientation = (node) => {
    const a = attrs(node),
      sign = Math.sign(
        Number(a.scaleX ?? 1) * Number(a.scaleY ?? 1) * Number(a.scaleZ ?? 1),
      );
    const parent = ids.get(String(a.parent));
    return sign * (parent ? orientation(parent) : 1);
  };
  const active = host.composition.children.filter(
    (n) => n.name === "camera" && attrs(n).active !== false && host.active(n),
  );
  const ca = active.at(-1) ? attrs(/** @type {Node} */ (active.at(-1))) : {},
    vw = host.width / host.scale,
    vh = host.height / host.scale;
  const fov = Number(ca.fov ?? 60),
    focal =
      ca.focalLength === undefined
        ? vh / 2 / Math.tan((fov * Math.PI) / 360)
        : (Number(ca.focalLength) * vw) / Number(ca.sensorWidth ?? 36);
  if (!(fov > 0 && fov < 180))
    throw new Error("camera fov must be between 0 and 180 degrees");
  const eye = /** @type {Vec} */ (
    active.length
      ? [Number(ca.x ?? 0), Number(ca.y ?? 0), Number(ca.z ?? 0)]
      : [0, 0, -focal]
  );
  let right = rotate(
      [1, 0, 0],
      Number(ca.pitch ?? 0),
      Number(ca.yaw ?? 0),
      Number(ca.roll ?? 0),
    ),
    down = rotate(
      [0, 1, 0],
      Number(ca.pitch ?? 0),
      Number(ca.yaw ?? 0),
      Number(ca.roll ?? 0),
    ),
    forward = rotate(
      [0, 0, 1],
      Number(ca.pitch ?? 0),
      Number(ca.yaw ?? 0),
      Number(ca.roll ?? 0),
    );
  if (ca.target) {
    const target = ids.get(String(ca.target));
    if (!target) throw new Error("camera target must be an object3D");
    forward = normalize(subtract(world(target, [0, 0, 0]), eye));
    const axis = /** @type {Vec} */ (
      Math.abs(forward[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0]
    );
    const base = normalize(cross(axis, forward)),
      vertical = cross(forward, base),
      r = (Number(ca.roll ?? 0) * Math.PI) / 180;
    right = /** @type {Vec} */ (
      base.map((v, i) => v * Math.cos(r) + Number(vertical[i]) * Math.sin(r))
    );
    down = /** @type {Vec} */ (
      vertical.map((v, i) => v * Math.cos(r) - Number(base[i]) * Math.sin(r))
    );
  }
  const materials = new Map(
    host.scene.children
      .find((n) => n.name === "materials")
      ?.children.map((n) => [String(n.attributes.id), n]),
  );
  /** @type {import('./raster.js').Face[]} */ const faces = [];
  for (const node of nodes) {
    if (
      !host.active(node) ||
      (host.geometryFilter
        ? !host.geometryFilter.has(node)
        : host.geometryExcluded.has(String(node.attributes.id)))
    )
      continue;
    const a = attrs(node),
      material = materials.get(String(a.material)),
      ma = material ? attrs(material) : {};
    // Capability checks enforce explicit unlit materials and disabled shadow flags.
    if (ma.unlit !== true)
      throw new Error(
        "3D geometry backend requires an explicit unlit material",
      );
    const raw = host.color.rgb(
        parseColor(String(ma.baseColor ?? "#FFFFFFFF"), host.tokens),
      ),
      emission = host.color.rgb(
        parseColor(String(ma.emissive ?? "#000000FF"), host.tokens),
      );
    let alpha =
      Number(ma.opacity ?? 1) *
      (ma.alphaMode === "opaque" ? 1 : Number(raw[3]));
    if (ma.alphaMode === "mask")
      alpha = alpha < Number(ma.alphaCutoff ?? 0.5) ? 0 : 1;
    alpha *= Number(a.opacity ?? 1);
    const color = [0, 1, 2].map(
      (k) =>
        (Number(raw[k]) +
          Number(emission[k]) * Number(ma.emissiveStrength ?? 1)) *
        alpha *
        2 ** Number(ca.exposure ?? 0),
    );
    color.push(alpha);
    let geometry;
    if (a.primitive === "mesh") {
      const key = String(a.mesh);
      geometry = host.geometryCache.get(key);
      if (!geometry) {
        geometry = importedGeometry(host.io.meshes?.get(key));
        host.geometryCache.set(key, geometry);
      }
    } else geometry = primitive(a);
    const points = geometry.points.map((p) => {
      const q = subtract(world(node, p), eye);
      return /** @type {Vec} */ ([
        dot(q, right),
        dot(q, down),
        dot(q, forward),
      ]);
    });
    for (const triangle of geometry.triangles)
      faces.push({
        vertices: (orientation(node) < 0
          ? triangle.slice().reverse()
          : triangle
        ).map((i) => ({
          p: /** @type {Vec} */ (points[i]),
          uv: [0, 0],
        })),
        color,
        doubleSided: ma.doubleSided === true,
      });
  }
  return raster(host.width, host.height, faces, {
    near: Number(ca.near ?? 0.1),
    far: Number(ca.far ?? 10000),
    focal: focal * host.scale,
    ortho:
      ca.projection === "orthographic"
        ? host.height / Number(ca.orthoHeight ?? vh)
        : undefined,
    cx: host.width / 2,
    cy: host.height / 2,
  });
}
