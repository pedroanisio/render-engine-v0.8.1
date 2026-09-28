import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatePattern } from '../src/xsd/regex.js';

/** @param {string} p @param {string} s */
const matches = (p, s) => new RegExp(translatePattern(p), 'u').test(s);

test('anchors the whole value', () => {
  assert.equal(matches('[0-9]+', '12'), true);
  assert.equal(matches('[0-9]+', 'a12'), false);
  assert.equal(matches('[0-9]+', '12a'), false);
  assert.equal(matches('a|b', 'ab'), false);
});

test('treats ^ and $ as literals outside a class, as XSD does', () => {
  assert.equal(matches('a^b$', 'a^b$'), true);
  assert.equal(matches('[^a]', 'b'), true);
  assert.equal(matches('[^a]', 'a'), false);
});

test('accepts the single-character escapes used by the scene schema', () => {
  assert.equal(matches('var\\(--[A-Za-z0-9_\\-]+\\)', 'var(--brand-1)'), true);
  assert.equal(matches('a\\-b', 'a-b'), true);
  assert.equal(matches('\\.\\n\\t\\r\\\\', '.\n\t\r\\'), true);
});

test('maps the XSD wildcard to anything except CR and LF', () => {
  assert.equal(matches('a.b', 'a\u2028b'), true);
  assert.equal(matches('a.b', 'a\nb'), false);
});

test('translates every pattern in the scene schema to a valid JS regex', () => {
  const patterns = [
    '[1-9][0-9]*(/[1-9][0-9]*)?',
    '#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|(0(\\.[0-9]+)?|1(\\.0+)?|\\.[0-9]+)(,(0(\\.[0-9]+)?|1(\\.0+)?|\\.[0-9]+)){2,3}|var\\(--[A-Za-z0-9_\\-]+\\)',
    'url\\(#[A-Za-z_][A-Za-z0-9_.\\-]*\\)',
  ];
  for (const p of patterns) assert.doesNotThrow(() => new RegExp(translatePattern(p), 'u'));
  assert.equal(matches(patterns[1] ?? '', '1,0.5,0,1'), true);
  assert.equal(matches(patterns[1] ?? '', '1.5,0,0'), false);
});

test('refuses constructs whose XSD semantics differ from JS', () => {
  for (const p of ['\\d', '\\i\\c*', '\\p{L}', '[a-z-[aeiou]]', 'a\\']) {
    assert.throws(() => translatePattern(p), /unsupported/, p);
  }
});
