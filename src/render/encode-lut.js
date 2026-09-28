/**
 * Exact 16-bit quantisation of float32 values through a transfer function.
 *
 * `Math.round(clamp(encodeTransfer(x, transfer)) * 65535)` is monotone in x for
 * the supported transfers, so for every output level k there is a smallest
 * float32 x in [0, 1] that reaches it. Those 65536 thresholds, found once by
 * bisection over float32 bit patterns with the very same function, turn the
 * per-pixel power into a table walk with identical results. The bisection
 * cannot prove monotonicity by itself, so the supported set is limited to the
 * transfers that scripts/verify-encode-lut.mjs checked over every float32 in
 * [0, 1].
 */
import { encodeTransfer } from "./color-management.js";
import { clamp } from "./fx/pixels.js";

/** Transfers verified exhaustively (see scripts/verify-encode-lut.mjs). */
export const VERIFIED_TRANSFERS = new Set([
  "linear",
  "srgb",
  "gamma22",
  "gamma26",
  "bt1886",
]);
const ONE = 0x3f800000; // bit pattern of 1.0f
const BUCKET_SHIFT = 9;
const F32 = new Float32Array(1),
  U32 = new Uint32Array(F32.buffer);
/** @typedef {{ thresholds: Uint32Array, buckets: Uint32Array }} Quantizer */
/** @type {Map<string, Quantizer>} */ const cache = new Map();

/** @param {number} bits @param {string} transfer */
function direct(bits, transfer) {
  U32[0] = bits;
  return Math.round(
    clamp(encodeTransfer(/** @type {number} */ (F32[0]), transfer)) * 65535,
  );
}

/** Builds (or reuses) the quantiser for a verified transfer.
 * @param {string} transfer @returns {Quantizer|undefined} */
export function quantizer(transfer) {
  if (!VERIFIED_TRANSFERS.has(transfer)) return undefined;
  const hit = cache.get(transfer);
  if (hit) return hit;
  const thresholds = new Uint32Array(65536);
  if (direct(ONE, transfer) !== 65535 || direct(0, transfer) !== 0)
    throw new Error(`transfer ${transfer} does not span the 16-bit range`);
  for (let k = 1; k < 65536; k++) {
    // Smallest bit pattern reaching level k; patterns order like the values.
    let lo = /** @type {number} */ (thresholds[k - 1]),
      hi = ONE;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (direct(mid, transfer) >= k) hi = mid;
      else lo = mid + 1;
    }
    thresholds[k] = lo;
    if (direct(lo, transfer) < k || (lo > 0 && direct(lo - 1, transfer) >= k))
      throw new Error(`transfer ${transfer} is not monotone near level ${k}`);
  }
  // Level reached at the start of each 2^9-pattern bucket: at most a couple of
  // levels per bucket, so the search below is one or two steps.
  const buckets = new Uint32Array((ONE >>> BUCKET_SHIFT) + 2);
  let k = 0;
  for (let b = 0; b < buckets.length - 1; b++) {
    const u = b << BUCKET_SHIFT;
    while (k + 1 < 65536 && /** @type {number} */ (thresholds[k + 1]) <= u) k++;
    buckets[b] = k;
  }
  buckets[buckets.length - 1] = 65535;
  const q = { thresholds, buckets };
  cache.set(transfer, q);
  return q;
}

/** Level for a float32 value in [0, 1], given as its bit pattern.
 * @param {number} bits @param {Quantizer} q */
export function level(bits, q) {
  const b = bits >>> BUCKET_SHIFT,
    t = q.thresholds,
    hi = /** @type {number} */ (q.buckets[b + 1]);
  let lo = /** @type {number} */ (q.buckets[b]);
  while (lo < hi && /** @type {number} */ (t[lo + 1]) <= bits) lo++;
  return lo;
}
