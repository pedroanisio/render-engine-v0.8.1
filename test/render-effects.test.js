import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../src/render/surface.js';
import { hash01, filmGrain, halftone, scanlines, blur, glow, ellipseMask, rain, drawRotated } from '../src/render/effects.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const at = (s, x, y) => Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));
function grey(w, h, v) {
  const s = new Surface(w, h);
  for (let i = 0; i < w * h; i++) s.data.set([v, v, v, 1], i * 4);
  return s;
}

test('hash01 is deterministic, in [0,1) and varies with every argument', () => {
  const a = hash01(1, 2, 3, 4);
  assert.equal(a, hash01(1, 2, 3, 4));
  assert.ok(a >= 0 && a < 1);
  for (const v of [hash01(2, 2, 3, 4), hash01(1, 3, 3, 4), hash01(1, 2, 4, 4), hash01(1, 2, 3, 5)]) assert.notEqual(v, a);
});

test('film grain is zero-mean, bounded by amount x mix, frame-dependent and skips transparent pixels', () => {
  const s = grey(64, 64, 0.5);
  filmGrain(s, s.bounds(), { amount: 0.07, mix: 0.25, seed: 9 }, 3);
  let sum = 0; let max = 0;
  for (let i = 0; i < 64 * 64; i++) { const v = (s.data[i * 4] ?? 0) - 0.5; sum += v; max = Math.max(max, Math.abs(v)); }
  assert.ok(Math.abs(sum / 4096) < 0.002 && max <= 0.07 * 0.25 + 1e-9 && max > 0.005);
  const t = grey(8, 8, 0.5);
  filmGrain(t, t.bounds(), { amount: 0.07, mix: 0.25, seed: 9 }, 4);
  assert.notDeepEqual(at(s, 1, 1), at(t, 1, 1));
  const clear = new Surface(2, 2);
  filmGrain(clear, clear.bounds(), { amount: 1, mix: 1, seed: 1 }, 1);
  assert.deepEqual(Array.from(clear.data), new Array(16).fill(0));
});

test('halftone leaves white untouched and darkens a darker area with a dot screen', () => {
  const white = grey(20, 20, 1);
  halftone(white, white.bounds(), { size: 5, angle: 45, mix: 1 });
  assert.ok(Array.from(white.data).every((v) => v > 0.999));
  const mid = grey(40, 40, 0.18);
  halftone(mid, mid.bounds(), { size: 5, angle: 45, mix: 1 });
  let inked = 0;
  for (let i = 0; i < 1600; i++) if ((mid.data[i * 4] ?? 1) < 0.01) inked += 1;
  const frac = inked / 1600;
  assert.ok(frac > 0.2 && frac < 0.8, String(frac));
  const clear = new Surface(2, 2);
  halftone(clear, clear.bounds(), { size: 5, angle: 0, mix: 1 });
});

test('scanlines darken the first half of each period', () => {
  const s = grey(2, 8, 1);
  scanlines(s, s.bounds(), { size: 4, intensity: 0.2, mix: 0.5 });
  close(at(s, 0, 0)[0], 0.9); close(at(s, 0, 1)[0], 0.9); close(at(s, 0, 2)[0], 1); close(at(s, 0, 4)[0], 0.9);
});

test('blur preserves the mean and spreads an impulse', () => {
  const v = new Float32Array(21 * 21);
  v[10 * 21 + 10] = 1;
  const b = blur(v, 21, 21, 4);
  let sum = 0;
  for (const x of b) sum += x;
  close(sum, 1, 1e-4);
  assert.ok((b[10 * 21 + 12] ?? 0) > 0 && (b[10 * 21 + 10] ?? 1) < 1);
  assert.equal(blur(v, 21, 21, 0), v);
});

test('glow adds tinted light around the element', () => {
  const s = new Surface(21, 21);
  s.fillRect(9, 9, 3, 3, [1, 1, 1, 1], s.bounds());
  glow(s, { radius: 8, intensity: 0.5, color: [1, 0.5, 0, 1] });
  const [r, g, b, a] = at(s, 13, 10);
  assert.ok(r > 0 && g > 0 && b === 0 && a > 0 && r > g);
  assert.deepEqual(at(s, 0, 20), [0, 0, 0, 0].map((v, i) => (at(s, 0, 20)[i] ?? v)));
});

test('ellipse mask keeps the inside, clears the outside and ramps across the feather', () => {
  const s = grey(40, 40, 1);
  ellipseMask(s, s.bounds(), { cx: 20, cy: 20, rx: 10, ry: 10, feather: 4, invert: false });
  close(at(s, 20, 20)[3], 1); close(at(s, 0, 0)[3], 0);
  const edge = at(s, 29, 20)[3] ?? 0;
  assert.ok(edge > 0 && edge < 1, String(edge));
  const inv = grey(40, 40, 1);
  ellipseMask(inv, inv.bounds(), { cx: 20, cy: 20, rx: 10, ry: 10, feather: 0, invert: true });
  close(at(inv, 20, 20)[3], 0); close(at(inv, 0, 0)[3], 1);
});

const emitter = { x: 0, y: 0, width: 100, height: 100, rate: 50, lifetime: 1, speed: 100, direction: 90, spread: 0,
  size: 2, trail: 0.1, color: [1, 1, 1, 1], seed: 5, start: 0, preroll: 1, maxParticles: 1000 };

test('rain draws deterministic falling streaks, pre-rolled and bounded', () => {
  const a = new Surface(100, 100);
  rain(a, a.bounds(), emitter, 0.5, 1);
  const b = new Surface(100, 100);
  rain(b, b.bounds(), emitter, 0.5, 1);
  assert.deepEqual(a.data, b.data);
  let ink = 0;
  for (let i = 3; i < a.data.length; i += 4) ink += a.data[i] ?? 0;
  assert.ok(ink > 100, String(ink));
  const later = new Surface(100, 100);
  rain(later, later.bounds(), emitter, 0.6, 1);
  assert.notDeepEqual(later.data, a.data);
  const capped = new Surface(100, 100);
  rain(capped, capped.bounds(), { ...emitter, maxParticles: 1 }, 0.5, 1);
  let one = 0;
  for (let i = 3; i < capped.data.length; i += 4) one += capped.data[i] ?? 0;
  assert.ok(one > 0 && one < ink / 5);
  const before = new Surface(10, 10);
  rain(before, before.bounds(), emitter, -5, 1);
  assert.ok(before.data.every((v) => v === 0));
});

test('drawRotated turns about the pivot and keeps the pivot in place', () => {
  const src = new Surface(4, 2);
  src.fillRect(0, 0, 4, 2, [1, 0, 0, 1], src.bounds());
  const d = new Surface(10, 10);
  drawRotated(d, src, { px: 0, py: 1, dx: 5, dy: 5, sx: 1, sy: 1, deg: 90, opacity: 1 }, d.bounds());
  assert.ok((at(d, 5, 6)[3] ?? 0) > 0.9 && (at(d, 5, 8)[3] ?? 0) > 0.9);
  close(at(d, 7, 5)[3], 0);
  const e = new Surface(10, 10);
  drawRotated(e, src, { px: 0, py: 0, dx: 1, dy: 1, sx: 2, sy: 1, deg: 0, opacity: 0.5 }, e.bounds());
  close(at(e, 7, 1)[0], 0.5, 1e-6);
});
