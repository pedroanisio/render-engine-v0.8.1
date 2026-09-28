import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileParticle } from '../src/xsd/content.js';

/** @typedef {import('../src/xsd/model.js').Particle} Particle */
/** @param {string} name @param {number} [min] @param {number | null} [max] @returns {Particle} */
const el = (name, min = 1, max = 1) => ({ kind: 'element', name, min, max });
/** @param {Particle[]} items @param {number} [min] @param {number | null} [max] @returns {Particle} */
const seq = (items, min = 1, max = 1) => ({ kind: 'sequence', items, min, max });
/** @param {Particle[]} items @param {number} [min] @param {number | null} [max] @returns {Particle} */
const choice = (items, min = 1, max = 1) => ({ kind: 'choice', items, min, max });

/** @param {Particle} p @param {string} names */
const run = (p, names) => compileParticle(p).match(names === '' ? [] : names.split(' '));

test('accepts a sequence with optional and repeated members', () => {
  const p = seq([el('a'), el('b', 0), el('c', 1, null)]);
  assert.deepEqual(run(p, 'a c'), { ok: true });
  assert.deepEqual(run(p, 'a b c c c'), { ok: true });
});

test('reports the first unexpected child with the names that were allowed', () => {
  const p = seq([el('a'), el('b', 0), el('c', 1, null)]);
  assert.deepEqual(run(p, 'a d'), { ok: false, kind: 'unexpected', index: 1, expected: ['b', 'c'] });
  assert.deepEqual(run(p, 'c'), { ok: false, kind: 'unexpected', index: 0, expected: ['a'] });
});

test('reports incomplete content with the names still required', () => {
  const p = seq([el('a'), el('b', 0), el('c', 1, null)]);
  assert.deepEqual(run(p, 'a'), { ok: false, kind: 'incomplete', index: 1, expected: ['b', 'c'] });
  assert.deepEqual(run(p, 'a b'), { ok: false, kind: 'incomplete', index: 2, expected: ['c'] });
});

test('repeating choices accept any order and count occurrences', () => {
  const p = choice([el('x'), el('y')], 0, null);
  assert.deepEqual(run(p, ''), { ok: true });
  assert.deepEqual(run(p, 'y x y y'), { ok: true });
  const bounded = choice([el('x'), el('y')], 2, 3);
  assert.equal(run(bounded, 'x').ok, false);
  assert.equal(run(bounded, 'x y').ok, true);
  assert.equal(run(bounded, 'x y x').ok, true);
  assert.deepEqual(run(bounded, 'x y x y'), { ok: false, kind: 'unexpected', index: 3, expected: [] });
});

test('handles nested groups, zero-max particles and nullable inner content', () => {
  const p = seq([seq([el('a', 0), el('b', 0)], 1, 2), el('c')]);
  assert.equal(run(p, 'c').ok, true);
  assert.equal(run(p, 'a b a c').ok, true);
  assert.equal(run(p, 'a b a b a c').ok, false);
  assert.equal(run(seq([el('a', 0, 0), el('b')]), 'b').ok, true);
  assert.equal(run(seq([el('a', 0, 0), el('b')]), 'a b').ok, false);
  assert.equal(run(seq([]), '').ok, true);
  assert.equal(run(choice([]), '').ok, false);
  assert.equal(run(choice([], 0), '').ok, true);
});

test('bounded element repetition counts down exactly', () => {
  const p = el('a', 2, 4);
  assert.equal(run(p, 'a').ok, false);
  assert.equal(run(p, 'a a').ok, true);
  assert.equal(run(p, 'a a a a').ok, true);
  assert.equal(run(p, 'a a a a a').ok, false);
});

test('interned state count stays bounded on deeply ambiguous repetition', () => {
  const p = seq([choice([seq([el('a', 0, null)], 0, null), el('a')], 0, null), el('b')]);
  const m = compileParticle(p);
  assert.equal(m.match([...Array(5000).fill('a'), 'b']).ok, true);
  const after5000 = m.size();
  assert.equal(m.match([...Array(50000).fill('a'), 'b']).ok, true);
  assert.equal(m.size(), after5000);
  assert.ok(after5000 < 40, `interned ${after5000} states`);
});
