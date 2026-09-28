import { MODEL } from '../generated/model.js';
import { createSimpleTypes } from '../xsd/simple.js';
import { parseColor } from '../render/color.js';
export const simple = createSimpleTypes(MODEL.simpleTypes);
/** @typedef {import('../xsd/typed-value.js').TypedValue} Value */
/** @param {import('../xsd/validate.js').ValidNode} node @param {string} prop @param {string} raw */
export function propertyValue(node, prop, raw) {
  const type = MODEL.complexTypes[node.type]?.attributes[prop]?.type;
  if (!type && node.name === 'motionPath' && prop === 'progress') return Number(raw);
  if (!type) throw new Error(`<${node.name}> has no attribute "${prop}" to animate`);
  const r = simple.check(type, raw);
  if (!r.ok) throw new Error(`invalid ${node.name}/@${prop}: ${r.reason}`);
  if (typeof r.value === 'number' && !Number.isFinite(r.value))
    throw new Error(`non-finite ${prop}`);
  return r.value;
}
/** @param {Value} a @param {Value} b @returns {Value} */
export function add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length)
    return a.map((v, i) => add(v, /** @type {Value} */ (b[i])));
  throw new Error('additive tracks require numbers or equal-length numeric vectors');
}
/** @param {Value} a @param {Value} b @param {number} u @param {boolean} [color] @returns {Value} */
export function interpolate(a, b, u, color = false) {
  if (typeof a === 'string' && typeof b === 'string') {
    const x = /^(-?[\d.]+)(%|vw|vh|vmin|vmax)$/.exec(a),
      y = /^(-?[\d.]+)(%|vw|vh|vmin|vmax)$/.exec(b);
    if (x && y && x[2] === y[2])
      return `${Number(x[1]) + (Number(y[1]) - Number(x[1])) * u}${x[2]}`;
  }
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length)
    return a.map((v, i) => interpolate(v, /** @type {Value} */ (b[i]), u));
  if (
    color &&
    typeof a === 'string' &&
    typeof b === 'string' &&
    !a.startsWith('url(') &&
    !b.startsWith('url(') &&
    a !== 'none' &&
    b !== 'none'
  ) {
    const x = parseColor(a),
      y = parseColor(b);
    const c = x.map((v, i) => Math.min(1, Math.max(0, v + (Number(y[i]) - v) * u)));
    return c
      .map((v, i) =>
        i === 3 ? v : v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
      )
      .join(',');
  }
  return u < 1 ? a : b;
}
/** Physical unit-step response, including critical and overdamped cases. */
export function spring(
  /** @type {number} */ t,
  /** @type {number} */ stiffness = 100,
  /** @type {number} */ damping = 10,
  /** @type {number} */ mass = 1,
) {
  if (!(stiffness > 0 && damping >= 0 && mass > 0))
    throw new Error('invalid spring parameters');
  const w = Math.sqrt(stiffness / mass),
    z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  if (Math.abs(z - 1) < 1e-9) return 1 - Math.exp(-w * t) * (1 + w * t);
  const q = Math.sqrt(z * z - 1),
    r1 = -w * (z - q),
    r2 = -w * (z + q);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}
