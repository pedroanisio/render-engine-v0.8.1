/**
 * Easing curves u -> f(u) on [0, 1].
 *
 * The schema names the curves but does not define their math. Readings used here:
 * ease-in/-out/-in-out are the CSS cubic-bezier keywords; the Penner family uses the
 * standard closed forms (back overshoot 1.70158, elastic periods 1/3 and 1/2.25).
 * Parity with the C17 renderer is unverified until its definitions are available.
 */

export class UnsupportedCurve extends Error {
  /** @param {string} name */
  constructor(name) {
    super(`curve "${name}" has no closed form here; it needs per-key data or is not implemented`);
    this.name = 'UnsupportedCurve';
    this.curve = name;
  }
}

/**
 * Cubic-bezier easing with P0=(0,0), P3=(1,1); x handles must lie in [0,1].
 * Solves x(s)=u by Newton's method with a bisection fallback, both bounded.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @returns {(u: number) => number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) throw new RangeError('bezier x handles must lie in [0, 1]');
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  /** @param {number} s */
  const sx = (s) => ((ax * s + bx) * s + cx) * s;
  /** @param {number} s */
  const sy = (s) => ((ay * s + by) * s + cy) * s;
  /** @param {number} s */
  const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let s = u;
    for (let i = 0; i < 8; i++) {
      const err = sx(s) - u;
      if (Math.abs(err) < 1e-12) return sy(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-9) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = u;
    for (let i = 0; i < 60; i++) {
      s = (lo + hi) / 2;
      if (sx(s) < u) lo = s;
      else hi = s;
    }
    return sy(s);
  };
}

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const TAU = 2 * Math.PI;

/** @param {number} u */
function bounceOut(u) {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u - 1.5 / d) ** 2 + 0.75;
  if (u < 2.5 / d) return n * (u - 2.25 / d) ** 2 + 0.9375;
  return n * (u - 2.625 / d) ** 2 + 0.984375;
}

/** @param {number} p exponent */
const powIn = (p) => (/** @type {number} */ u) => u ** p;
/** @param {number} p */
const powOut = (p) => (/** @type {number} */ u) => 1 - (1 - u) ** p;
/** @param {number} p */
const powInOut = (p) => (/** @type {number} */ u) => (u < 0.5 ? 2 ** (p - 1) * u ** p : 1 - (-2 * u + 2) ** p / 2);

/** @type {Record<string, (u: number) => number>} */
const CURVES = {
  linear: (u) => u,
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
  'sine-in': (u) => 1 - Math.cos((u * Math.PI) / 2),
  'sine-out': (u) => Math.sin((u * Math.PI) / 2),
  'sine-in-out': (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  'quad-in': powIn(2), 'quad-out': powOut(2), 'quad-in-out': powInOut(2),
  'cubic-in': powIn(3), 'cubic-out': powOut(3), 'cubic-in-out': powInOut(3),
  'quart-in': powIn(4), 'quart-out': powOut(4), 'quart-in-out': powInOut(4),
  'quint-in': powIn(5), 'quint-out': powOut(5), 'quint-in-out': powInOut(5),
  'expo-in': (u) => (u === 0 ? 0 : 2 ** (10 * u - 10)),
  'expo-out': (u) => (u === 1 ? 1 : 1 - 2 ** (-10 * u)),
  'expo-in-out': (u) => (u === 0 ? 0 : u === 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  'circ-in': (u) => 1 - Math.sqrt(1 - u * u),
  'circ-out': (u) => Math.sqrt(1 - (u - 1) ** 2),
  'circ-in-out': (u) => (u < 0.5 ? (1 - Math.sqrt(1 - (2 * u) ** 2)) / 2 : (Math.sqrt(1 - (-2 * u + 2) ** 2) + 1) / 2),
  'back-in': (u) => C3 * u ** 3 - C1 * u * u,
  'back-out': (u) => 1 + C3 * (u - 1) ** 3 + C1 * (u - 1) ** 2,
  'back-in-out': (u) => (u < 0.5
    ? ((2 * u) ** 2 * ((C2 + 1) * 2 * u - C2)) / 2
    : ((2 * u - 2) ** 2 * ((C2 + 1) * (u * 2 - 2) + C2) + 2) / 2),
  'elastic-in': (u) => (u === 0 || u === 1 ? u : -(2 ** (10 * u - 10)) * Math.sin((u * 10 - 10.75) * (TAU / 3))),
  'elastic-out': (u) => (u === 0 || u === 1 ? u : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1),
  'elastic-in-out': (u) => (u === 0 || u === 1 ? u : u < 0.5
    ? -(2 ** (20 * u - 10) * Math.sin((20 * u - 11.125) * (TAU / 4.5))) / 2
    : (2 ** (-20 * u + 10) * Math.sin((20 * u - 11.125) * (TAU / 4.5))) / 2 + 1),
  'bounce-in': (u) => 1 - bounceOut(1 - u),
  'bounce-out': bounceOut,
  'bounce-in-out': (u) => (u < 0.5 ? (1 - bounceOut(1 - 2 * u)) / 2 : (1 + bounceOut(2 * u - 1)) / 2),
};

/**
 * @param {string} name curveType value with a closed form
 * @returns {(u: number) => number}
 */
export function easing(name) {
  const f = Object.hasOwn(CURVES, name) ? CURVES[name] : undefined;
  if (!f) throw new UnsupportedCurve(name);
  return f;
}
