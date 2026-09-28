/**
 * Colour parsing and transfer functions. Compositing happens on premultiplied,
 * linear-light floats (project/@linearLight defaults to true); sRGB is decoded
 * through a lookup table and re-encoded on output.
 */

/** @type {Float32Array} sRGB byte -> linear */
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const ENC_STEPS = 4096;
/** @type {Uint8Array} linear [0,1] quantised to 1/4096 -> sRGB byte */
const LINEAR_TO_SRGB = new Uint8Array(ENC_STEPS + 1);
for (let i = 0; i <= ENC_STEPS; i++) {
  const l = i / ENC_STEPS;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  LINEAR_TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** @param {number} linear */
export function encodeSrgb(linear) {
  const i = linear <= 0 ? 0 : linear >= 1 ? ENC_STEPS : Math.round(linear * ENC_STEPS);
  return /** @type {number} */ (LINEAR_TO_SRGB[i]);
}

/** @typedef {[number, number, number, number]} Rgba straight-alpha linear r, g, b and alpha */

/**
 * Parses a colorType value (#RRGGBB[AA], "r,g,b[,a]" normalised sRGB, or var(--token)).
 * @param {string} value
 * @param {ReadonlyMap<string, string>} [tokens]
 * @returns {Rgba}
 */
export function parseColor(value, tokens = new Map()) {
  const v = value.trim();
  const token = /^var\(--([A-Za-z0-9_-]+)\)$/.exec(v);
  if (token) {
    const resolved = tokens.get(/** @type {string} */ (token[1]));
    if (resolved === undefined) throw new Error(`undeclared token ${v}`);
    return parseColor(resolved, tokens);
  }
  const hex = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(v);
  if (hex) {
    const n = parseInt(/** @type {string} */ (hex[1]), 16);
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return [SRGB_TO_LINEAR[(n >> 16) & 255] ?? 0, SRGB_TO_LINEAR[(n >> 8) & 255] ?? 0, SRGB_TO_LINEAR[n & 255] ?? 0, a];
  }
  const parts = v.split(',').map(Number);
  if ((parts.length === 3 || parts.length === 4) && parts.every((p) => p >= 0 && p <= 1)) {
    /** @param {number} c */
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return [lin(/** @type {number} */ (parts[0])), lin(/** @type {number} */ (parts[1])), lin(/** @type {number} */ (parts[2])), parts[3] ?? 1];
  }
  throw new Error(`unsupported colour ${value}`);
}
