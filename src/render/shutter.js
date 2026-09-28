/** Deterministic centred quadrature. Shutter phase is relative to the nominal frame. */
import { Surface } from "./surface.js";
/** @param {number} t @param {number} fps @param {Record<string,any>} p @param {(t:number)=>Surface} sample */
export function shutter(t, fps, p, sample) {
  const count = Math.max(
      1,
      Math.min(256, Math.round(Number(p.motionBlurSamples ?? 16))),
    ),
    angle = Number(p.shutterAngle ?? 180),
    phase = Number(p.shutterPhase ?? -90),
    width = angle / 360 / fps,
    start = t + phase / 360 / fps;
  if (!width) return sample(t);
  // One sample sits at the shutter window's centre, like the midpoints of count>=2.
  if (count === 1) return sample(start + width / 2);
  const integrate = (/** @type {number} */ n) => {
    let out;
    for (let j = 0; j < n; j++) {
      const s = sample(start + (width * (j + 0.5)) / n);
      out ??= new Surface(s.width, s.height);
      for (let k = 0; k < out.data.length; k++)
        out.data[k] = Number(out.data[k]) + Number(s.data[k]) / n;
    }
    return /** @type {Surface} */ (out);
  };
  if (p.adaptiveMotionBlur === false || count <= 4) return integrate(count);
  let previous = integrate(2);
  for (let n = 4; ; n = Math.min(count, n * 2)) {
    const next = integrate(n);
    let error = 0;
    for (let k = 0; k < next.data.length; k++)
      error = Math.max(
        error,
        Math.abs(Number(next.data[k]) - Number(previous.data[k])),
      );
    if (error < 1 / 65536 || n === count) return next;
    previous = next;
  }
}
