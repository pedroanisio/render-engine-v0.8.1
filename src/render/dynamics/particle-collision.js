/** Continuous circle/convex-fixture contact with interpolated rigid poses.
 * Conservative advancement bounds both translation and angular sweep. */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {Point & {rotation:number}} Pose */
/** @typedef {{vertices?:Point[],center?:Point,radius?:number,activateAt?:number,pose:(t:number)=>Pose}} Collider */
/** @param {Collider} c @param {Point} p @param {number} time */
function separation(c, p, time) {
  const pose = c.pose(time),
    a = (pose.rotation * Math.PI) / 180,
    co = Math.cos(a),
    si = Math.sin(a),
    dx = p.x - pose.x,
    dy = p.y - pose.y,
    x = co * dx + si * dy,
    y = -si * dx + co * dy;
  let distance, nx, ny;
  if (c.vertices) {
    let closest = Infinity,
      inside = false,
      qx = 0,
      qy = 0;
    for (let i = 0, j = c.vertices.length - 1; i < c.vertices.length; j = i++) {
      const u = /** @type {Point} */ (c.vertices[j]),
        v = /** @type {Point} */ (c.vertices[i]),
        ex = v.x - u.x,
        ey = v.y - u.y,
        q = Math.max(
          0,
          Math.min(1, ((x - u.x) * ex + (y - u.y) * ey) / (ex * ex + ey * ey)),
        ),
        px = u.x + ex * q,
        py = u.y + ey * q,
        d = Math.hypot(x - px, y - py);
      if (d < closest) {
        closest = d;
        qx = px;
        qy = py;
      }
      if (
        u.y > y !== v.y > y &&
        x < ((v.x - u.x) * (y - u.y)) / (v.y - u.y) + u.x
      )
        inside = !inside;
    }
    distance = inside ? -closest : closest;
    nx = (x - qx) / (distance || 1e-12);
    ny = (y - qy) / (distance || 1e-12);
  } else {
    const dx = x - Number(c.center?.x),
      dy = y - Number(c.center?.y),
      d = Math.hypot(dx, dy);
    distance = d - Number(c.radius);
    nx = d ? dx / d : 1;
    ny = d ? dy / d : 0;
  }
  return { distance, nx: co * nx - si * ny, ny: si * nx + co * ny };
}
/** @param {Collider[]} colliders @param {Point} start @param {Point} velocity @param {number} radius @param {number} time @param {number} dt @param {number} bounce */
export function collideParticle(
  colliders,
  start,
  velocity,
  radius,
  time,
  dt,
  bounce,
) {
  let p = { ...start },
    v = { ...velocity },
    remaining = dt,
    elapsed = 0;
  for (let contact = 0; contact < 8 && remaining > 1e-9; contact++) {
    let first = remaining + 1,
      hit;
    for (const c of colliders) {
      if (time + elapsed + remaining < Number(c.activateAt ?? 0)) continue;
      const a = c.pose(time + elapsed),
        b = c.pose(time + elapsed + remaining),
        wx = (b.x - a.x) / remaining,
        wy = (b.y - a.y) / remaining,
        omega = ((b.rotation - a.rotation) * Math.PI) / 180 / remaining,
        extent = c.vertices
          ? Math.max(...c.vertices.map((q) => Math.hypot(q.x, q.y)))
          : Math.hypot(Number(c.center?.x), Number(c.center?.y)) +
            Number(c.radius),
        speed = Math.hypot(v.x - wx, v.y - wy) + Math.abs(omega) * extent;
      let t = 0;
      for (
        let iteration = 0;
        iteration < 128 && t <= remaining && t < first;
        iteration++
      ) {
        const q = { x: p.x + v.x * t, y: p.y + v.y * t },
          s = separation(c, q, time + elapsed + t),
          gap = s.distance - radius,
          pose = c.pose(time + elapsed + t),
          cv = {
            x: wx - omega * (q.y - pose.y),
            y: wy + omega * (q.x - pose.x),
          },
          dot = (v.x - cv.x) * s.nx + (v.y - cv.y) * s.ny;
        if (gap < 1e-6) {
          if (dot < -1e-8 || gap < -1e-5) {
            first = t;
            hit = { ...s, cv };
          }
          break;
        }
        if (speed < 1e-12) break;
        t += Math.max(1e-9, (gap / speed) * 0.95);
      }
    }
    if (!hit) {
      p.x += v.x * remaining;
      p.y += v.y * remaining;
      break;
    }
    p.x += v.x * first;
    p.y += v.y * first;
    const push = Math.max(1e-5, radius - hit.distance + 1e-5);
    p.x += hit.nx * push;
    p.y += hit.ny * push;
    const dot = (v.x - hit.cv.x) * hit.nx + (v.y - hit.cv.y) * hit.ny;
    if (dot < 0) {
      v.x -= (1 + bounce) * dot * hit.nx;
      v.y -= (1 + bounce) * dot * hit.ny;
    }
    elapsed += first;
    remaining -= first;
  }
  return { x: p.x, y: p.y, vx: v.x, vy: v.y };
}
