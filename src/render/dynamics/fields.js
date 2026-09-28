/** Field accelerations in scene units per second squared, evaluated at a fixed step. */
import { svgPathProperties } from "svg-path-properties";
import { noise } from "../fx/spatial.js";
/** @param {Record<string,any>} a @param {number} x @param {number} y @param {number} vx @param {number} vy @param {number} t @returns {[number,number]} */
export function field(a, x, y, vx, vy, t) {
  if (t < Number(a.start ?? 0) || t >= Number(a.end ?? Infinity)) return [0, 0];
  const dx = x - Number(a.x ?? 0),
    dy = y - Number(a.y ?? 0),
    distance = Math.hypot(dx, dy),
    radius = Number(a.radius ?? Infinity);
  if (distance > radius) return [0, 0];
  const k =
      Number(a.strength ?? 0) /
      (1 + Math.max(0, Number(a.falloff ?? 0)) * distance),
    length = Math.max(1e-9, distance),
    scale = Number(a.scale ?? 1);
  switch (a.type) {
    case "directional":
      return [Number(a.forceX ?? 0), Number(a.forceY ?? 0)];
    case "wind": {
      const pulse =
        1 + 0.5 * noise(x / scale + t, y / scale, Number(a.seed ?? 0));
      return [Number(a.forceX ?? 0) * pulse, Number(a.forceY ?? 0) * pulse];
    }
    case "radial":
      return [(k * dx) / length, (k * dy) / length];
    case "vortex":
      return [(-k * dy) / length, (k * dx) / length];
    case "drag":
      return [-k * vx, -k * vy];
    case "turbulence":
      return [
        k * (2 * noise(x / scale + t, y / scale, Number(a.seed ?? 0)) - 1),
        k * (2 * noise(x / scale, y / scale + t, Number(a.seed ?? 0) + 1) - 1),
      ];
    case "attractor-path": {
      const path = new svgPathProperties(String(a.path)),
        total = path.getTotalLength();
      let bx = 0,
        by = 0,
        best = Infinity;
      for (let i = 0; i <= 128; i++) {
        const p = path.getPointAtLength((total * i) / 128),
          d = (p.x - dx) ** 2 + (p.y - dy) ** 2;
        if (d < best) {
          best = d;
          bx = p.x - dx;
          by = p.y - dy;
        }
      }
      const n = Math.max(1e-9, Math.hypot(bx, by));
      return [(k * bx) / n, (k * by) / n];
    }
    default:
      throw new Error(`unknown force field ${a.type}`);
  }
}
