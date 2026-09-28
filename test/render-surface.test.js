import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../src/render/surface.js';
import { parseColor, encodeSrgb, SRGB_TO_LINEAR } from '../src/render/color.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const px = (s, x, y) => Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));

test('parses hex, normalised and token colours into linear straight alpha', () => {
  assert.deepEqual(parseColor('#FFFFFF'), [1, 1, 1, 1]);
  const c = parseColor('#08080AEF');
  close(c[0], SRGB_TO_LINEAR[8]); close(c[3], 0xef / 255);
  close(parseColor('0.5,0,1')[0], ((0.5 + 0.055) / 1.055) ** 2.4);
  close(parseColor('0.02,0,0,0.5')[0], 0.02 / 12.92);
  assert.equal(parseColor('0,0,0,0.5')[3], 0.5);
  assert.deepEqual(parseColor('var(--ink)', new Map([['ink', '#000000']])), [0, 0, 0, 1]);
  assert.throws(() => parseColor('var(--nope)'), /undeclared/);
  assert.throws(() => parseColor('red'), /unsupported/);
  assert.throws(() => parseColor('2,0,0'), /unsupported/);
});

test('encodes linear back to sRGB bytes exactly at the ends', () => {
  assert.equal(encodeSrgb(0), 0);
  assert.equal(encodeSrgb(1), 255);
  assert.equal(encodeSrgb(-1), 0);
  assert.equal(encodeSrgb(2), 255);
  for (const b of [1, 8, 50, 128, 200, 254]) assert.equal(encodeSrgb(/** @type {number} */ (SRGB_TO_LINEAR[b])), b);
});

test('fillRect covers fractional edges by area and respects the clip', () => {
  const s = new Surface(4, 2);
  s.fillRect(0.5, 0, 2, 1, [1, 1, 1, 1], s.bounds());
  close(px(s, 0, 0)[3], 0.5); close(px(s, 1, 0)[3], 1); close(px(s, 2, 0)[3], 0.5); close(px(s, 3, 0)[3], 0);
  close(px(s, 1, 1)[3], 0);
  s.fillRect(0, 0, 4, 2, [1, 0, 0, 0.5], { x0: 0, y0: 1, x1: 4, y1: 2 });
  close(px(s, 3, 1)[0], 0.5); close(px(s, 3, 0)[0], 0);
  s.fillRect(0, 0, 1, 1, [1, 1, 1, 0], s.bounds());
  s.fillRect(5, 5, 1, 1, [1, 1, 1, 1], s.bounds());
});

test('source-over blending in premultiplied linear space', () => {
  const s = new Surface(1, 1);
  s.fillRect(0, 0, 1, 1, [0, 0, 1, 1], s.bounds());
  s.fillRect(0, 0, 1, 1, [1, 0, 0, 0.25], s.bounds());
  const [r, g, b, a] = px(s, 0, 0);
  close(r, 0.25); close(g, 0); close(b, 0.75); close(a, 1);
});

test('strokeRect draws a frame and leaves the inside untouched', () => {
  const s = new Surface(10, 10);
  s.strokeRect(2, 2, 6, 6, 2, [1, 1, 1, 1], s.bounds());
  close(px(s, 1, 5)[3], 1); close(px(s, 2, 5)[3], 1); close(px(s, 5, 5)[3], 0); close(px(s, 8, 1)[3], 1); close(px(s, 0, 0)[3], 0);
});

test('roundedRect fills, strokes and rounds its corners', () => {
  const s = new Surface(20, 20);
  s.roundedRect(0, 0, 20, 20, 8, [1, 1, 1, 1], null, 0, s.bounds());
  close(px(s, 10, 10)[3], 1); close(px(s, 0, 0)[3], 0); close(px(s, 10, 0)[3], 1);
  const t = new Surface(20, 20);
  t.roundedRect(2, 2, 16, 16, 4, null, [1, 0, 0, 1], 2, t.bounds());
  close(px(t, 10, 10)[3], 0); assert.ok(px(t, 10, 2)[3] > 0.99); close(px(t, 10, 5)[3], 0);
  const u = new Surface(4, 4);
  u.roundedRect(0, 0, 4, 4, 0, [0, 1, 0, 1], [1, 0, 0, 1], 0, { x0: 0, y0: 0, x1: 2, y1: 4 });
  close(px(u, 1, 1)[1], 1); close(px(u, 3, 1)[3], 0);
});

test('drawSurface translates exactly on integers and interpolates otherwise', () => {
  const src = new Surface(2, 1);
  src.data.set([1, 0, 0, 1, 0, 0, 1, 1]);
  const d = new Surface(4, 1);
  d.drawSurface(src, 1, 0, 1, 1, 1, d.bounds());
  assert.deepEqual(px(d, 1, 0), [1, 0, 0, 1]); assert.deepEqual(px(d, 2, 0), [0, 0, 1, 1]); assert.deepEqual(px(d, 0, 0), [0, 0, 0, 0]);
  const h = new Surface(4, 1);
  h.drawSurface(src, 0.5, 0, 1, 1, 1, h.bounds());
  close(px(h, 1, 0)[0], 0.5); close(px(h, 1, 0)[2], 0.5); close(px(h, 0, 0)[3], 0.5);
  const sc = new Surface(4, 1);
  sc.drawSurface(src, 0, 0, 2, 1, 0.5, sc.bounds());
  // pixel 1 centre maps to u = 0.25: 0.75 red + 0.25 blue, then opacity 0.5
  close(px(sc, 1, 0)[0], 0.375); close(px(sc, 1, 0)[2], 0.125); close(px(sc, 1, 0)[3], 0.5);
  const none = new Surface(2, 1);
  none.drawSurface(src, 0, 0, 1, 1, 0, none.bounds());
  none.drawSurface(src, 0, 0, 0, 1, 1, none.bounds());
  none.drawSurface(new Surface(2, 1), 0, 0, 1, 1, 1, none.bounds());
  assert.deepEqual(px(none, 0, 0), [0, 0, 0, 0]);
  const flip = new Surface(2, 1);
  flip.drawSurface(src, 2, 0, -1, 1, 1, flip.bounds());
  close(px(flip, 0, 0)[2], 1);
});

test('toRgb8 encodes to sRGB bytes', () => {
  const s = new Surface(2, 1);
  s.fillRect(0, 0, 1, 1, [1, /** @type {number} */ (SRGB_TO_LINEAR[128]), 0, 1], s.bounds());
  assert.deepEqual(Array.from(s.toRgb8()), [255, 128, 0, 0, 0, 0]);
});
