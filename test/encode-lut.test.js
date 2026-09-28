/** The encoder table reproduces the direct quantisation on float32 samples. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeTransfer } from "../src/render/color-management.js";
import { clamp } from "../src/render/fx/pixels.js";
import {
  quantizer,
  level,
  VERIFIED_TRANSFERS,
} from "../src/render/encode-lut.js";

const F32 = new Float32Array(1),
  U32 = new Uint32Array(F32.buffer);
/** @param {number} x @param {string} transfer */
const direct = (x, transfer) =>
  Math.round(clamp(encodeTransfer(x, transfer)) * 65535);

test("every verified transfer builds a monotone table that agrees with the direct computation", () => {
  let seed = 12345;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const transfer of VERIFIED_TRANSFERS) {
    const q = quantizer(transfer);
    assert.ok(q, transfer);
    assert.equal(quantizer(transfer), q, "cached");
    for (let k = 1; k < 65536; k++)
      assert.ok(
        q.thresholds[k] > q.thresholds[k - 1],
        `${transfer} threshold ${k}`,
      );
    const samples = [
      0,
      1,
      2 ** -24,
      2 ** -14,
      0.5,
      0.5 - 2 ** -54,
      1 - 2 ** -24,
      0.0031308,
      0.04045,
    ];
    for (let i = 0; i < 20000; i++) samples.push(next() ** (next() * 6));
    for (const x of samples) {
      F32[0] = x;
      const v = F32[0];
      if (!(v >= 0 && v <= 1)) continue;
      assert.equal(
        level(U32[0], q),
        direct(v, transfer),
        `${transfer} at ${v}`,
      );
    }
  }
  assert.equal(quantizer("pq"), undefined);
  assert.equal(quantizer("hlg"), undefined);
});
