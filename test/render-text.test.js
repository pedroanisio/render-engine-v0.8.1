import { test } from 'node:test';
import assert from 'node:assert/strict';
import opentype from 'opentype.js';
import { pathEdges, coverage, wrap, renderText } from '../src/render/text.js';

const font = opentype.loadSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** @param {string} d */
function path(cmds) {
  const p = new opentype.Path();
  for (const c of cmds) p.commands.push(c);
  return p;
}

test('a unit square covers exactly its pixels, including half pixels', () => {
  const sq = path([{ type: 'M', x: 1, y: 1 }, { type: 'L', x: 3, y: 1 }, { type: 'L', x: 3, y: 3 }, { type: 'L', x: 1, y: 3 }, { type: 'Z' }]);
  const cov = coverage(pathEdges(sq), 4, 4);
  assert.deepEqual(Array.from(cov), [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
  const half = path([{ type: 'M', x: 0.5, y: 0 }, { type: 'L', x: 1, y: 0 }, { type: 'L', x: 1, y: 1 }, { type: 'L', x: 0.5, y: 1 }, { type: 'Z' }]);
  close(coverage(pathEdges(half), 2, 1)[0] ?? -1, 0.5);
});

test('nonzero winding keeps the counter of an O-like shape empty', () => {
  const ring = path([
    { type: 'M', x: 0, y: 0 }, { type: 'L', x: 6, y: 0 }, { type: 'L', x: 6, y: 6 }, { type: 'L', x: 0, y: 6 }, { type: 'Z' },
    { type: 'M', x: 2, y: 2 }, { type: 'L', x: 2, y: 4 }, { type: 'L', x: 4, y: 4 }, { type: 'L', x: 4, y: 2 }, { type: 'Z' },
  ]);
  const cov = coverage(pathEdges(ring), 6, 6);
  assert.equal(cov[0], 1);
  assert.equal(cov[2 * 6 + 2], 0);
});

test('curves are flattened into closed outlines', () => {
  const blob = path([{ type: 'M', x: 0, y: 4 }, { type: 'Q', x1: 4, y1: -4, x: 8, y: 4 },
    { type: 'C', x1: 8, y1: 8, x2: 0, y2: 8, x: 0, y: 4 }, { type: 'Z' }]);
  const cov = coverage(pathEdges(blob), 8, 8);
  assert.ok((cov[4 * 8 + 4] ?? 0) > 0.99);
  assert.equal(cov[0], 0);
});

test('wrap breaks at words and honours explicit newlines', () => {
  const w = font.getAdvanceWidth('Your floor', 50);
  assert.deepEqual(wrap(font, 'GIRL\nYour floor is lower.', 50, w + 1), ['GIRL', 'Your floor', 'is lower.']);
  assert.deepEqual(wrap(font, 'short', 50, 1), ['short']);
});

test('renderText shrinks to fit, aligns and paints coverage in the given colour', () => {
  const spec = { text: 'GIRL\nYou got off too early.', width: 700, height: 120, size: 58, minSize: 20, maxSize: 58,
    lineHeight: 1.15, align: 'center', verticalAlign: 'middle', shrink: true };
  const r = renderText(font, spec, [1, 0, 0, 1], 1);
  assert.equal(r.surface.width, 700);
  assert.ok(r.size < 58 && r.size >= 20, String(r.size));
  assert.deepEqual(r.lines, ['GIRL', 'You got off too early.']);
  let ink = 0; let left = 0;
  for (let y = 0; y < 120; y++) for (let x = 0; x < 700; x++) {
    const a = r.surface.data[(y * 700 + x) * 4 + 3] ?? 0;
    ink += a;
    if (x < 20) left += a;
    if (a > 0) close((r.surface.data[(y * 700 + x) * 4] ?? 0) / a, 1, 1e-5);
  }
  assert.ok(ink > 1000 && left === 0);
  const big = renderText(font, { ...spec, text: '12', width: 1800, height: 650, size: 82, minSize: 42, maxSize: 82 }, [1, 1, 1, 1], 0.25);
  assert.equal(big.size, 82);
  assert.equal(big.surface.width, 450);
  const fixed = renderText(font, { ...spec, shrink: false, size: 30, align: 'left', verticalAlign: 'top' }, [1, 1, 1, 1], 1);
  assert.equal(fixed.size, 30);
  const right = renderText(font, { ...spec, align: 'right', verticalAlign: 'bottom', text: 'x' }, [1, 1, 1, 1], 1);
  assert.ok(right.lines[0] === 'x');
  const over = renderText(font, { ...spec, text: 'An overlong line that cannot fit the box at the minimum size at all', width: 100, height: 20, minSize: 50 }, [1, 1, 1, 1], 1);
  assert.equal(over.size, 50);
});
