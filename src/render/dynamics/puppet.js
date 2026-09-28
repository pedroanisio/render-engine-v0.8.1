/** Moving least-squares affine puppet deformation with orientation/starch handles. */
/** @param {{x:number,y:number}} p @param {Record<string,any>[]} pins @param {number} extent */
export function puppetPoint(p, pins, extent) {
  /** @type {{x:number,y:number,u:number,v:number,amount:number}[]} */ const handles =
    [];
  for (const pin of pins) {
    const x = Number(pin.restX),
      y = Number(pin.restY),
      amount = Number(pin.amount ?? 1);
    if (!amount) continue;
    const fixed = pin.kind === "starch",
      u = x + (fixed ? 0 : Number(pin.x ?? 0)),
      v = y + (fixed ? 0 : Number(pin.y ?? 0)),
      angle = fixed ? 0 : (Number(pin.rotation ?? 0) * Math.PI) / 180;
    handles.push({ x, y, u, v, amount });
    if (pin.kind === "bend" || fixed || angle !== 0) {
      const r = Math.max(1e-3, extent * 0.1);
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ])
        handles.push({
          x: x + Number(dx),
          y: y + Number(dy),
          u: u + Number(dx) * Math.cos(angle) - Number(dy) * Math.sin(angle),
          v: v + Number(dx) * Math.sin(angle) + Number(dy) * Math.cos(angle),
          amount,
        });
    }
  }
  if (!handles.length) return { ...p };
  let sum = 0,
    px = 0,
    py = 0,
    qx = 0,
    qy = 0;
  const weights = handles.map((h) => {
    const d = (p.x - h.x) ** 2 + (p.y - h.y) ** 2,
      w = h.amount / Math.max(1e-16, d * d);
    sum += w;
    px += h.x * w;
    py += h.y * w;
    qx += h.u * w;
    qy += h.v * w;
    return w;
  });
  px /= sum;
  py /= sum;
  qx /= sum;
  qy /= sum;
  let xx = 0,
    xy = 0,
    yy = 0,
    ux = 0,
    uy = 0,
    vx = 0,
    vy = 0;
  handles.forEach((h, i) => {
    const w = Number(weights[i]) / sum,
      x = h.x - px,
      y = h.y - py,
      u = h.u - qx,
      v = h.v - qy;
    xx += w * x * x;
    xy += w * x * y;
    yy += w * y * y;
    ux += w * u * x;
    uy += w * u * y;
    vx += w * v * x;
    vy += w * v * y;
  });
  const det = xx * yy - xy * xy,
    x = p.x - px,
    y = p.y - py;
  if (Math.abs(det) > 1e-14)
    return {
      x: qx + ((ux * yy - uy * xy) * x + (uy * xx - ux * xy) * y) / det,
      y: qy + ((vx * yy - vy * xy) * x + (vy * xx - vx * xy) * y) / det,
    };
  const norm = xx + yy;
  if (norm > 1e-14) {
    const a = (ux + vy) / norm,
      b = (vx - uy) / norm;
    return { x: qx + a * x - b * y, y: qy + b * x + a * y };
  }
  return { x: qx + x, y: qy + y };
}
