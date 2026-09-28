/** Textured geometric transitions; no cross-dissolve substitutes for geometry. */
import { raster } from "./raster.js";
/** @typedef {import('./raster.js').Face} Face */
/** @typedef {import('../surface.js').Surface} Surface */
/** @param {Surface} from @param {Surface} to @param {Record<string,any>} a @param {number} p */
export function geometryTransition(from, to, a, p) {
  const w = from.width,
    h = from.height,
    angle =
      ((a.direction === "angle"
        ? Number(a.angle ?? 0)
        : a.direction === "right"
          ? 180
          : a.direction === "up"
            ? 90
            : a.direction === "down"
              ? -90
              : 0) *
        Math.PI) /
      180;
  const dx = Math.cos(angle),
    dy = Math.sin(angle),
    extent = Math.abs(dx) * w + Math.abs(dy) * h,
    focal = Math.max(w, h) * 2,
    distance = focal;
  /** @type {Face[]} */ const faces = [];
  /** @param {Surface} texture @param {(x:number,y:number)=>import('./raster.js').Vec} transform @param {number} [shade] @param {number} [strips] */
  function sheet(texture, transform, shade = 1, strips = 1) {
    for (let j = 0; j < strips; j++) {
      const u0 = j / strips,
        u1 = (j + 1) / strips;
      const vertices = [
        [u0, 0],
        [u0, 1],
        [u1, 1],
        [u1, 0],
      ].map(([u, v]) => ({
        p: transform((Number(u) - 0.5) * w, (Number(v) - 0.5) * h),
        uv: /** @type {[number,number]} */ ([Number(u), Number(v)]),
      }));
      faces.push({
        vertices,
        texture,
        color: [shade, shade, shade, 1],
        doubleSided: true,
      });
    }
  }
  if (a.type === "flip") {
    const incoming = p >= 0.5,
      theta = (incoming ? p - 1 : p) * Math.PI,
      c = Math.cos(theta),
      s = Math.sin(theta);
    sheet(
      incoming ? to : from,
      (x, y) => {
        const u = x * dx + y * dy,
          v = -x * dy + y * dx;
        return [u * c * dx - v * dy, u * c * dy + v * dx, distance - u * s];
      },
      0.35 + 0.65 * Math.abs(c),
    );
  } else if (a.type === "cube") {
    const theta = (p * Math.PI) / 2,
      c = Math.cos(theta),
      s = Math.sin(theta),
      half = extent / 2;
    // Front/right faces of one rigid cube rotate around a shared center.
    sheet(
      from,
      (x, y) => {
        const u = x * dx + y * dy,
          v = -x * dy + y * dx,
          ux = u * c - half * s,
          z = -u * s - half * c;
        return [ux * dx - v * dy, ux * dy + v * dx, distance + half + z];
      },
      0.35 + 0.65 * c,
    );
    sheet(
      to,
      (x, y) => {
        const u = x * dx + y * dy,
          v = -x * dy + y * dx,
          ux = half * c + u * s,
          z = -half * s + u * c;
        return [ux * dx - v * dy, ux * dy + v * dx, distance + half + z];
      },
      0.35 + 0.65 * s,
    );
  } else {
    sheet(to, (x, y) => [x, y, distance + 0.01]);
    // A moving cylindrical bend rolls the outgoing page toward the camera.
    // Diagonal axes require tessellation in both dimensions.
    const radius = extent * 0.12,
      fold = extent / 2 - p * (extent + Math.PI * radius),
      n = 48;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const vertices = [
          [x / n, y / n],
          [x / n, (y + 1) / n],
          [(x + 1) / n, (y + 1) / n],
          [(x + 1) / n, y / n],
        ].map(([u, v]) => {
          const px = (Number(u) - 0.5) * w,
            py = (Number(v) - 0.5) * h,
            q = px * dx + py * dy,
            r = -px * dy + py * dx,
            theta = Math.min(Math.PI, Math.max(0, (q - fold) / radius));
          const bend =
            q <= fold
              ? q
              : q - fold < Math.PI * radius
                ? fold + radius * Math.sin(theta)
                : fold - (q - fold - Math.PI * radius);
          return {
            p: /** @type {import('./raster.js').Vec} */ ([
              bend * dx - r * dy,
              bend * dy + r * dx,
              distance - radius * (1 - Math.cos(theta)),
            ]),
            uv: /** @type {[number,number]} */ ([Number(u), Number(v)]),
          };
        });
        const center =
            ((x + 0.5) / n - 0.5) * w * dx + ((y + 0.5) / n - 0.5) * h * dy,
          theta = Math.min(Math.PI, Math.max(0, (center - fold) / radius));
        const shade = 0.45 + 0.55 * Math.abs(Math.cos(theta));
        faces.push({
          vertices,
          texture: from,
          color: [shade, shade, shade, 1],
          doubleSided: true,
        });
      }
  }
  return raster(w, h, faces, {
    near: 0.01,
    far: distance * 10,
    focal,
    cx: w / 2,
    cy: h / 2,
  });
}
