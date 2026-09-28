/** Ordered forward deformation on a tessellated local plane. */
import { puppetPoint } from "./puppet.js";
import { raster } from "../three/raster.js";
import {
  point,
  multiply,
  inverse,
  transform,
  IDENTITY,
} from "../geometry/matrix.js";
import { noise } from "../fx/spatial.js";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @typedef {{x:number,y:number}} Point */
/** @param {Point} p @param {Record<string,any>} a @param {number} w @param {number} h @param {Record<string,any>[]} [controls] @returns {Point} */
export function deformPoint(p, a, w, h, controls = []) {
  const cx = Number(a.centerX ?? w / 2),
    cy = Number(a.centerY ?? h / 2),
    x = p.x - cx,
    y = p.y - cy,
    amount = Number(a.amount ?? 0),
    radius = Number(a.radius ?? Math.min(w, h) / 2),
    r = Math.hypot(x, y),
    phase = Number(a.phase ?? 0),
    freq = Number(a.frequency ?? 1),
    axis = String(a.axis ?? "y");
  const rotate = (/** @type {number} */ theta) => ({
    x: cx + x * Math.cos(theta) - y * Math.sin(theta),
    y: cy + x * Math.sin(theta) + y * Math.cos(theta),
  });
  if (a.type === "bend") {
    if (Math.abs(amount) < 1e-9) return { ...p };
    const extent = axis === "x" ? w : h,
      angle = (amount * Math.PI) / 180,
      R = extent / angle,
      u = axis === "x" ? x : y,
      v = axis === "x" ? y : x,
      t = u / R,
      pu = Math.sin(t) * (R + v),
      pv = Math.cos(t) * (R + v) - R;
    return axis === "x"
      ? { x: cx + pu, y: cy + pv }
      : { x: cx + pv, y: cy + pu };
  }
  if (a.type === "twist")
    return rotate(
      ((amount * Math.PI) / 180) *
        (axis === "x" ? x / Math.max(w, 1) : y / Math.max(h, 1)),
    );
  if (a.type === "wave") {
    const offset =
      amount *
      Math.sin(
        (axis === "x" ? y / Math.max(h, 1) : x / Math.max(w, 1)) *
          freq *
          2 *
          Math.PI +
          phase,
      );
    return axis === "x"
      ? { x: p.x + offset, y: p.y }
      : { x: p.x, y: p.y + offset };
  }
  if (a.type === "squash" || a.type === "stretch") {
    const k = 1 + amount;
    if (Math.abs(k) < 1e-6) throw new Error("singular squash/stretch factor");
    const cross = a.type === "squash" ? 1 / k : 1;
    return axis === "x"
      ? { x: cx + x * k, y: cy + y * cross }
      : { x: cx + x * cross, y: cy + y * k };
  }
  if (["bulge", "pinch", "spherize", "ripple"].includes(String(a.type))) {
    const q = radius > 0 ? Math.max(0, 1 - r / radius) : 0;
    let scale = 1;
    if (a.type === "bulge" || a.type === "pinch")
      scale += (a.type === "pinch" ? -1 : 1) * amount * q * q;
    else if (a.type === "spherize") scale += amount * q;
    else
      scale +=
        (amount *
          Math.sin((r / Math.max(radius, 1e-9)) * freq * Math.PI * 2 + phase)) /
        Math.max(r, 1e-9);
    return { x: cx + x * scale, y: cy + y * scale };
  }
  if (a.type === "turbulence") {
    const seed = Number(BigInt(String(a.seed ?? 0)) & 0xffffffffn);
    return {
      x:
        p.x +
        amount *
          (2 *
            noise(
              (p.x / Math.max(w, 1)) * freq + phase,
              (p.y / Math.max(h, 1)) * freq,
              seed,
            ) -
            1),
      y:
        p.y +
        amount *
          (2 *
            noise(
              (p.x / Math.max(w, 1)) * freq,
              (p.y / Math.max(h, 1)) * freq + phase,
              seed + 1,
            ) -
            1),
    };
  }
  if (a.type === "corner-pin") {
    const c = /** @type {number[]} */ (a.corners);
    if (!Array.isArray(c) || c.length !== 8)
      throw new Error("corner-pin requires eight coordinates");
    const [x0, y0, x1, y1, x2, y2, x3, y3] = c.map(Number),
      dx1 = Number(x1) - Number(x2),
      dx2 = Number(x3) - Number(x2),
      dx3 = Number(x0) - Number(x1) + Number(x2) - Number(x3),
      dy1 = Number(y1) - Number(y2),
      dy2 = Number(y3) - Number(y2),
      dy3 = Number(y0) - Number(y1) + Number(y2) - Number(y3),
      den = dx1 * dy2 - dx2 * dy1;
    let g = 0,
      k = 0;
    if (Math.abs(dx3) + Math.abs(dy3) > 1e-9) {
      if (Math.abs(den) < 1e-9) throw new Error("degenerate corner-pin");
      g = (dx3 * dy2 - dx2 * dy3) / den;
      k = (dx1 * dy3 - dx3 * dy1) / den;
    }
    const u = p.x / w,
      v = p.y / h,
      d = 1 + g * u + k * v;
    if (Math.abs(d) < 1e-9) throw new Error("corner-pin crosses infinity");
    return {
      x:
        ((Number(x1) - Number(x0) + g * Number(x1)) * u +
          (Number(x3) - Number(x0) + k * Number(x3)) * v +
          Number(x0)) /
        d,
      y:
        ((Number(y1) - Number(y0) + g * Number(y1)) * u +
          (Number(y3) - Number(y0) + k * Number(y3)) * v +
          Number(y0)) /
        d,
    };
  }
  if (a.type === "mesh-warp") {
    const rows = Number(a.rows ?? 4),
      cols = Number(a.cols ?? 4),
      u = Math.max(0, Math.min(cols - 1, (p.x / w) * (cols - 1))),
      v = Math.max(0, Math.min(rows - 1, (p.y / h) * (rows - 1))),
      c = Math.min(cols - 2, Math.floor(u)),
      r = Math.min(rows - 2, Math.floor(v)),
      tx = u - c,
      ty = v - r;
    let dx = 0,
      dy = 0;
    for (const [row, col, k] of [
      [r, c, (1 - tx) * (1 - ty)],
      [r, c + 1, tx * (1 - ty)],
      [r + 1, c, (1 - tx) * ty],
      [r + 1, c + 1, tx * ty],
    ]) {
      const control = controls.find(
        (p) => Number(p.row) === row && Number(p.col) === col,
      );
      dx += Number(control?.x ?? 0) * Number(k);
      dy += Number(control?.y ?? 0) * Number(k);
    }
    return { x: p.x + dx, y: p.y + dy };
  }
  if (a.type === "puppet") return puppetPoint(p, controls, Math.min(w, h));
  throw new Error(`unknown deform modifier ${a.type}`);
}
/** @param {Point} p @param {Node} skeleton @param {(n:Node)=>Record<string,any>} attributes @param {{bone:string,weight:number}[]} [weights] */
export function skinPoint(p, skeleton, attributes, weights) {
  const bones = new Map(
    skeleton.children
      .filter((n) => n.name === "bone")
      .map((n) => [String(n.attributes.id), n]),
  );
  /** @param {Node} node @param {boolean} rest @param {Set<Node>} [seen] @returns {import('../geometry/matrix.js').Matrix} */
  const matrix = (node, rest, seen = new Set()) => {
    if (seen.has(node)) throw new Error("bone parenting cycle");
    seen.add(node);
    const a = rest ? node.attributes : attributes(node),
      local = transform(a, 1, 1, 1, 1),
      parent = bones.get(String(a.parent));
    return parent ? multiply(matrix(parent, rest, seen), local) : local;
  };
  let x = 0,
    y = 0,
    sum = 0;
  for (const [id, bone] of bones) {
    const bind = matrix(bone, true),
      inv = inverse(bind);
    if (!inv) throw new Error("singular bind bone");
    let weight;
    if (weights) weight = weights.find((w) => w.bone === id)?.weight ?? 0;
    else {
      const a = point(bind, 0, 0),
        b = point(bind, Number(bone.attributes.length ?? 0), 0),
        vx = b.x - a.x,
        vy = b.y - a.y,
        q = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1),
          ),
        );
      weight =
        1 / Math.max(1, (p.x - a.x - vx * q) ** 2 + (p.y - a.y - vy * q) ** 2);
    }
    if (weight < 0 || !Number.isFinite(weight))
      throw new Error("invalid skin weight");
    const dst = point(multiply(matrix(bone, false), inv), p.x, p.y);
    x += dst.x * weight;
    y += dst.y * weight;
    sum += weight;
  }
  return sum ? { x: x / sum, y: y / sum } : p;
}
/** Warp both colour and masks with the same tessellation before ordered effects.
 * @param {{width:number,height:number}} source @param {Node} node @param {import('../frame.js').FrameRenderer} host @param {import('../geometry/matrix.js').Matrix} matrix @param {{width:number,height:number}} box */
function deformGeometry(source, node, host, matrix, box, localSoft = false) {
  const modifiers =
      node.children.find((n) => n.name === "deform")?.children ?? [],
    soft = host.physics?.softGeometry(node, host.time);

  const rows =
      (soft ? Math.max(2, soft.rows) : undefined) ??
      Math.min(
        96,
        Math.max(24, ...modifiers.map((n) => Number(n.attributes.rows ?? 4))),
      ),
    cols =
      soft?.cols ??
      Math.min(
        96,
        Math.max(24, ...modifiers.map((n) => Number(n.attributes.cols ?? 4))),
      );
  const attr = (/** @type {Node} */ n) => host.attributes(n),
    skeletons = new Map();
  const collect = (/** @type {Node} */ n) => {
    if (n.name === "skeleton") skeletons.set(String(n.attributes.id), n);
    for (const c of n.children) collect(c);
  };
  collect(host.scene);
  /** @type {Map<Node,any>} */ const weightFiles = new Map();
  for (const skeleton of skeletons.values())
    if (skeleton.attributes.weights)
      weightFiles.set(
        skeleton,
        JSON.parse(
          Buffer.from(
            host.effectRead(String(skeleton.attributes.weights)),
          ).toString("utf8"),
        ),
      );
  /** @type {{p:[number,number,number],uv:[number,number]}[]} */ const vertices =
    [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let p = {
        x: (c / Math.max(1, cols - 1)) * box.width,
        y: (r / Math.max(1, rows - 1)) * box.height,
      };
      const src = point(matrix, p.x, p.y);
      for (const modifier of modifiers) {
        const a = attr(modifier);
        if (a.type === "skin") {
          const skeleton = skeletons.get(String(a.skeleton));
          if (!skeleton) throw new Error("missing skin skeleton");
          let weights;
          if (skeleton.attributes.weights) {
            const data = weightFiles.get(skeleton);
            weights = data.weights?.[r * cols + c];
            if (
              data.rows !== rows ||
              data.cols !== cols ||
              !Array.isArray(weights)
            )
              throw new Error("skin weights grid mismatch");
          }
          p = skinPoint(p, skeleton, attr, weights);
        } else
          p = deformPoint(
            p,
            a,
            box.width,
            box.height,
            modifier.children
              .filter((n) => n.name === "point" || n.name === "pin")
              .map(attr),
          );
      }
      let dst = point(matrix, p.x, p.y);
      if (soft) {
        const position = soft.points[(soft.rows === 1 ? 0 : r) * cols + c];
        if (position)
          dst = {
            x: position.x * host.scale,
            y:
              (position.y +
                (soft.rows === 1 ? (r / (rows - 1) - 0.5) * box.height : 0)) *
              host.scale,
          };
      }
      if (soft && localSoft) {
        const world = host.physics?.worldMatrix(node, host.time),
          inv = world ? inverse(world) : undefined;
        if (inv) dst = point(inv, dst.x / host.scale, dst.y / host.scale);
      }
      vertices.push({
        p: [dst.x, dst.y, 1],
        uv: [src.x / source.width, src.y / source.height],
      });
    }
  return { vertices, rows, cols };
}
/** Bounds use exactly the mesh used for pixels, masks and projected shadows.
 * @param {Node} node @param {import('../frame.js').FrameRenderer} host @param {{width:number,height:number}} box */
export function deformedBounds(node, host, box) {
  const { vertices } = deformGeometry(
      { width: 1, height: 1 },
      node,
      host,
      IDENTITY,
      box,
      true,
    ),
    xs = vertices.map((v) => v.p[0]),
    ys = vertices.map((v) => v.p[1]),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
/** @param {import('../surface.js').Surface} source @param {Node} node @param {import('../frame.js').FrameRenderer} host @param {import('../geometry/matrix.js').Matrix} matrix @param {{width:number,height:number}} box */
export function deformSurface(source, node, host, matrix, box) {
  if (!node.children.some((n) => n.name === "deform" || n.name === "softBody"))
    return source;
  const { vertices, rows, cols } = deformGeometry(
    source,
    node,
    host,
    matrix,
    box,
  );
  /** @type {import('../three/raster.js').Face[]} */ const faces = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      faces.push({
        vertices: [
          vertices[i],
          vertices[i + cols],
          vertices[i + cols + 1],
          vertices[i + 1],
        ].filter(
          /** @returns {v is import('../three/raster.js').Vertex} */ (v) => !!v,
        ),
        texture: source,
        doubleSided: true,
      });
    }
  return raster(source.width, source.height, faces, {
    near: 0.1,
    far: 2,
    focal: 1,
    ortho: 1,
    cx: 0,
    cy: 0,
  });
}
