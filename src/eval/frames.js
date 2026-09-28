// Frame times are passed around as `f / fps` doubles; multiplying back by fps
// can land just below the integer (29 / 25 * 25 === 28.999999999999996).
// These helpers snap such round-trips back onto the frame grid.

const EPSILON = 1e-6;

/** Continuous frame position of `time`, snapped to an integer when within rounding error.
 * @param {number} time @param {number} fps */
export function framePosition(time, fps) {
  const frame = time * fps;
  const nearest = Math.round(frame);
  return Math.abs(frame - nearest) < EPSILON ? nearest : frame;
}

/** Index of the frame that contains `time`.
 * @param {number} time @param {number} fps */
export function frameIndex(time, fps) {
  return Math.floor(framePosition(time, fps));
}
