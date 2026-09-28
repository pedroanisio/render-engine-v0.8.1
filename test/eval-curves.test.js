import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easing, cubicBezier, UnsupportedCurve } from '../src/eval/curves.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** Independent oracle: bisection on x(s) to 1e-13, then y(s). */
function bezierOracle(x1, y1, x2, y2, x) {
  const bx = (s) => 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s * s * x2 + s ** 3;
  const by = (s) => 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3;
  let lo = 0; let hi = 1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
  return by((lo + hi) / 2);
}

test('every closed-form curve maps 0 to 0 and 1 to 1', () => {
  const names = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
  for (const f of ['sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce']) {
    names.push(`${f}-in`, `${f}-out`, `${f}-in-out`);
  }
  for (const n of names) {
    const f = easing(n);
    close(f(0), 0, 1e-12);
    close(f(1), 1, 1e-12);
  }
  assert.equal(names.length, 34);
});

test('Penner curves match their closed forms', () => {
  close(easing('quad-in')(0.5), 0.25);
  close(easing('cubic-out')(0.5), 0.875);
  close(easing('quart-in-out')(0.25), 8 * 0.25 ** 4);
  close(easing('quint-in-out')(0.75), 1 - (-2 * 0.75 + 2) ** 5 / 2);
  close(easing('sine-in-out')(0.25), (1 - Math.cos(Math.PI * 0.25)) / 2);
  close(easing('sine-in')(0.5), 1 - Math.cos(Math.PI / 4));
  close(easing('sine-out')(0.5), Math.sin(Math.PI / 4));
  close(easing('expo-in')(0.5), 2 ** -5);
  close(easing('expo-out')(0.5), 1 - 2 ** -5);
  close(easing('expo-in-out')(0.25), 2 ** -6);
  close(easing('expo-in-out')(0.75), 1 - 2 ** -6);
  close(easing('circ-in')(0.5), 1 - Math.sqrt(0.75));
  close(easing('circ-out')(0.5), Math.sqrt(0.75));
  close(easing('circ-in-out')(0.25), (1 - Math.sqrt(0.75)) / 2);
  close(easing('circ-in-out')(0.75), (Math.sqrt(0.75) + 1) / 2);
  assert.ok(easing('back-in')(0.3) < 0, 'back-in overshoots below 0');
  assert.ok(easing('back-out')(0.7) > 1, 'back-out overshoots above 1');
  close(easing('back-in-out')(0.5), 0.5);
  close(easing('bounce-out')(0.5), 7.5625 * (0.5 - 1.5 / 2.75) ** 2 + 0.75);
  close(easing('bounce-in')(0.5), 1 - easing('bounce-out')(0.5));
  close(easing('bounce-in-out')(0.25), (1 - easing('bounce-out')(0.5)) / 2);
  close(easing('bounce-out')(0.1), 7.5625 * 0.01);
  close(easing('bounce-out')(0.8), 7.5625 * (0.8 - 2.25 / 2.75) ** 2 + 0.9375);
  close(easing('bounce-out')(0.95), 7.5625 * (0.95 - 2.625 / 2.75) ** 2 + 0.984375);
  close(easing('elastic-in-out')(0.5), 0.5);
  close(easing('elastic-out')(0.5), 2 ** -5 * Math.sin((5 - 0.75) * (2 * Math.PI) / 3) + 1);
  close(easing('elastic-in')(0.5), -(2 ** -5) * Math.sin((5 - 10.75) * (2 * Math.PI) / 3));
  close(easing('elastic-in-out')(0.25), -(2 ** (20 * 0.25 - 10) * Math.sin((20 * 0.25 - 11.125) * (2 * Math.PI) / 4.5)) / 2);
  close(easing('elastic-in-out')(0.75), (2 ** (-20 * 0.75 + 10) * Math.sin((20 * 0.75 - 11.125) * (2 * Math.PI) / 4.5)) / 2 + 1);
  close(easing('quad-in-out')(0.25), 0.125);
  close(easing('quad-in-out')(0.75), 0.875);
  close(easing('cubic-in-out')(0.25), 0.0625);
  close(easing('quart-out')(0.5), 1 - 0.5 ** 4);
  close(easing('quint-in')(0.5), 0.5 ** 5);
});

test('ease keywords are the CSS cubic-bezier curves', () => {
  for (const [name, p] of [['ease-in', [0.42, 0, 1, 1]], ['ease-out', [0, 0, 0.58, 1]], ['ease-in-out', [0.42, 0, 0.58, 1]]]) {
    for (const x of [0.1, 0.33, 0.5, 0.77, 0.9]) close(easing(name)(x), bezierOracle(...p, x), 1e-7);
  }
  close(easing('ease-in-out')(0.5), 0.5, 1e-9);
});

test('cubicBezier solves x for arbitrary handles, including steep ones', () => {
  for (const p of [[0.25, 0.1, 0.25, 1], [0.1, 0.9, 0.2, 1], [0.9, 0, 0.1, 1], [0.5, -0.5, 0.5, 1.5], [0, 0, 1, 1]]) {
    const f = cubicBezier(...p);
    for (let x = 0; x <= 1.0001; x += 0.05) close(f(Math.min(x, 1)), bezierOracle(...p, Math.min(x, 1)), 1e-7);
  }
  // (1,0,0,1) has x'(1/2) = 0, a triple root where bisection cannot resolve s;
  // the value there is 1/2 by symmetry, and Newton falls back to bisection nearby.
  const flat = cubicBezier(1, 0, 0, 1);
  assert.equal(flat(0.5), 0.5);
  for (const x of [0.05, 0.3, 0.45, 0.49, 0.51, 0.55, 0.9]) close(flat(x), bezierOracle(1, 0, 0, 1, x), 1e-7);
  assert.throws(() => cubicBezier(1.2, 0, 0.5, 1), RangeError);
  assert.throws(() => cubicBezier(0.5, 0, -0.1, 1), RangeError);
});

test('curves that need per-key data are refused here with a typed error', () => {
  for (const n of ['catmull-rom', 'tcb', 'spring', 'step', 'hold', 'steps', 'cubic-bezier', 'nope']) {
    assert.throws(() => easing(n), UnsupportedCurve, n);
  }
});
