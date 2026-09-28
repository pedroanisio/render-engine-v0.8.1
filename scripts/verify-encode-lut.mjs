// Exhaustive check that the encoder lookup (src/render/encode-lut.js) equals the
// direct computation for every float32 in [0, 1], per transfer.
// Usage: node scripts/verify-encode-lut.mjs [transfer ...]
import { encodeTransfer } from "../src/render/color-management.js";
import { clamp } from "../src/render/fx/pixels.js";
import {
  quantizer,
  level,
  VERIFIED_TRANSFERS,
} from "../src/render/encode-lut.js";
const F32 = new Float32Array(1),
  U32 = new Uint32Array(F32.buffer);
const transfers =
  process.argv.length > 2 ? process.argv.slice(2) : [...VERIFIED_TRANSFERS];
let failed = false;
for (const transfer of transfers) {
  const t0 = performance.now();
  const q = quantizer(transfer);
  if (!q) {
    console.log(`${transfer}: not in the verified set`);
    failed = true;
    continue;
  }
  let bad = 0,
    first = -1;
  for (let u = 0; u <= 0x3f800000; u++) {
    U32[0] = u;
    const expected = Math.round(
      clamp(encodeTransfer(F32[0], transfer)) * 65535,
    );
    if (level(u, q) !== expected) {
      bad++;
      if (first < 0) first = u;
    }
  }
  console.log(
    `${transfer}: ${bad === 0 ? "EXACT" : `MISMATCH ${bad} (first bits 0x${first.toString(16)})`} over 2^30+1 values in ${((performance.now() - t0) / 1000).toFixed(0)}s`,
  );
  if (bad) failed = true;
}
process.exit(failed ? 1 : 0);
