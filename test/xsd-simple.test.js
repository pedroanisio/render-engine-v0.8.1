import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimpleTypes } from '../src/xsd/simple.js';

/** @type {Record<string, import('../src/xsd/model.js').SimpleTypeDef>} */
const defs = {
  unit: { kind: 'restriction', base: 'xs:double', facets: { minInclusive: '0', maxInclusive: '1' } },
  pos: { kind: 'restriction', base: 'xs:double', facets: { minExclusive: '0' } },
  lt10: { kind: 'restriction', base: 'xs:double', facets: { maxExclusive: '10' } },
  weight: { kind: 'restriction', base: 'xs:positiveInteger', facets: { maxInclusive: '1000' } },
  grid: { kind: 'restriction', base: 'weight', facets: { minInclusive: '2', maxInclusive: '16' } },
  mode: { kind: 'restriction', base: 'xs:string', facets: { enumeration: ['a', 'b'] } },
  intEnum: { kind: 'restriction', base: 'xs:int', facets: { enumeration: ['1', '2'] } },
  fps: { kind: 'restriction', base: 'xs:string', facets: { patterns: ['[1-9][0-9]*(/[1-9][0-9]*)?'] } },
  twoPat: { kind: 'restriction', base: 'xs:string', facets: { patterns: ['a', 'b'] } },
  chained: { kind: 'restriction', base: 'twoPat', facets: { patterns: ['b'] } },
  lang: { kind: 'restriction', base: 'xs:string', facets: { maxLength: 3, minLength: 2 } },
  exact: { kind: 'restriction', base: 'xs:string', facets: { length: 2 } },
  nums: { kind: 'list', itemType: 'xs:double' },
  twoNums: { kind: 'restriction', base: 'nums', facets: { length: 2 } },
  rel: { kind: 'restriction', base: 'xs:string', facets: { patterns: ['[0-9]+%'] } },
  len: { kind: 'union', memberTypes: ['xs:double', 'rel'] },
  idish: { kind: 'restriction', base: 'xs:ID', facets: {} },
  badEnum: { kind: 'restriction', base: 'xs:int', facets: { enumeration: ['x'] } },
  badMin: { kind: 'restriction', base: 'xs:double', facets: { minInclusive: 'x' } },
  refList: { kind: 'list', itemType: 'xs:IDREF' },
  strList: { kind: 'list', itemType: 'xs:string' },
};
const st = createSimpleTypes(defs);

/** @param {string} t @param {string} v */
const ok = (t, v) => st.check(t, v).ok;
/** @param {string} t @param {string} v */
const val = (t, v) => {
  const r = st.check(t, v);
  assert.ok(r.ok, `${t} rejected ${JSON.stringify(v)}`);
  return r.value;
};

test('xs:double accepts the XSD 1.0 lexical space and collapses whitespace', () => {
  for (const v of ['0', '-1.5', '+2', '.5', '5.', '1e3', '1E-3', 'INF', '-INF', 'NaN', ' 4 ']) {
    assert.equal(ok('xs:double', v), true, v);
  }
  for (const v of ['', '.', 'e3', '1e', '+INF', 'inf', 'nan', '0x10', '1,5', '1 2']) {
    assert.equal(ok('xs:double', v), false, v);
  }
  assert.equal(val('xs:double', ' -INF '), -Infinity);
  assert.ok(Number.isNaN(val('xs:double', 'NaN')));
});

test('integer builtins enforce their value ranges', () => {
  assert.equal(val('xs:integer', '-12'), -12);
  assert.equal(ok('xs:integer', '1.0'), false);
  assert.equal(ok('xs:positiveInteger', '0'), false);
  assert.equal(val('xs:positiveInteger', '+7'), 7);
  assert.equal(ok('xs:nonNegativeInteger', '-1'), false);
  assert.equal(ok('xs:nonNegativeInteger', '-0'), true);
  assert.equal(ok('xs:int', '2147483647'), true);
  assert.equal(ok('xs:int', '2147483648'), false);
  assert.equal(ok('xs:int', '-2147483649'), false);
  assert.equal(val('xs:unsignedLong', '18446744073709551615'), 18446744073709551615n);
  assert.equal(ok('xs:unsignedLong', '18446744073709551616'), false);
});

test('integers beyond 2^53 are flagged unsafe instead of silently rounded', () => {
  const r = st.check('xs:positiveInteger', '9007199254740993');
  assert.equal(r.ok && r.unsafe, true);
  assert.equal(r.ok && r.value, 9007199254740993n);
  const s = st.check('xs:positiveInteger', '9007199254740991');
  assert.equal(s.ok && s.unsafe, false);
});

test('xs:boolean accepts exactly true, false, 1 and 0', () => {
  assert.equal(val('xs:boolean', '1'), true);
  assert.equal(val('xs:boolean', ' false '), false);
  assert.equal(ok('xs:boolean', 'TRUE'), false);
  assert.equal(ok('xs:boolean', 'yes'), false);
});

test('xs:string preserves whitespace; name types collapse and check the Name production', () => {
  assert.equal(val('xs:string', ' a  b '), ' a  b ');
  assert.equal(val('xs:ID', ' a1 '), 'a1');
  assert.equal(ok('xs:ID', '1a'), false);
  assert.equal(ok('xs:NCName', 'a:b'), false);
  assert.equal(ok('xs:NCName', 'été-1.x'), true);
  assert.equal(ok('xs:IDREF', ''), false);
  assert.equal(ok('xs:NMTOKEN', '1a'), true);
  assert.equal(ok('xs:NMTOKEN', 'a b'), false);
  assert.equal(val('xs:anyURI', ' http://x/y '), 'http://x/y');
});

test('list builtins split on whitespace and require at least one item', () => {
  assert.deepEqual(val('xs:IDREFS', ' a  b '), ['a', 'b']);
  assert.equal(ok('xs:IDREFS', '  '), false);
  assert.deepEqual(val('xs:NMTOKENS', 'x 1'), ['x', '1']);
  assert.equal(ok('xs:NMTOKENS', 'a %'), false);
});

test('xs:dateTime validates calendar fields and time zones', () => {
  for (const v of ['2026-09-26T10:00:00', '2024-02-29T23:59:59.5Z', '-0001-01-01T00:00:00+14:00', '2026-01-01T24:00:00']) {
    assert.equal(ok('xs:dateTime', v), true, v);
  }
  for (const v of ['2026-02-29T00:00:00', '2026-13-01T00:00:00', '2026-01-01T24:00:01', '2026-01-01T00:60:00',
    '2026-01-01', '2026-01-01T00:00:00+15:00', '0000-01-01T00:00:00', '2026-04-31T00:00:00', '1900-02-29T00:00:00']) {
    assert.equal(ok('xs:dateTime', v), false, v);
  }
});

test('numeric facets compare in the value space', () => {
  assert.equal(ok('unit', '0'), true);
  assert.equal(ok('unit', '1.0'), true);
  assert.equal(ok('unit', '1.01'), false);
  assert.equal(ok('unit', '-0.1'), false);
  assert.equal(ok('unit', 'NaN'), false);
  assert.equal(ok('pos', '0'), false);
  assert.equal(ok('pos', '1e-300'), true);
  assert.equal(ok('lt10', '10'), false);
  assert.equal(ok('lt10', '9.99'), true);
  assert.equal(ok('weight', '1000'), true);
  assert.equal(ok('weight', '1001'), false);
  assert.equal(ok('grid', '1'), false);
  assert.equal(ok('grid', '17'), false);
  assert.equal(val('grid', '16'), 16);
});

test('enumeration compares values, patterns alternate within a step and conjoin across steps', () => {
  assert.equal(ok('mode', 'a'), true);
  assert.equal(ok('mode', ' a'), false);
  assert.equal(ok('intEnum', '+01'), true);
  assert.equal(ok('intEnum', '3'), false);
  assert.equal(ok('fps', '30000/1001'), true);
  assert.equal(ok('fps', '0'), false);
  assert.equal(ok('twoPat', 'a'), true);
  assert.equal(ok('chained', 'a'), false);
  assert.equal(ok('chained', 'b'), true);
});

test('length facets count code points for strings and items for lists', () => {
  assert.equal(ok('lang', 'ab'), true);
  assert.equal(ok('lang', 'a'), false);
  assert.equal(ok('lang', 'abcd'), false);
  assert.equal(ok('lang', '😀😀'), true);
  assert.equal(ok('exact', 'ab'), true);
  assert.equal(ok('exact', 'abc'), false);
  assert.deepEqual(val('twoNums', '1 2'), [1, 2]);
  assert.equal(ok('twoNums', '1'), false);
  assert.deepEqual(val('nums', ''), []);
  assert.equal(ok('nums', '1 x'), false);
});

test('unions take the first member that accepts the value', () => {
  assert.equal(val('len', '12'), 12);
  assert.equal(val('len', '50%'), '50%');
  assert.equal(ok('len', '50vw'), false);
});

test('reports identity kinds through derivation and lists', () => {
  assert.equal(st.idKind('xs:ID'), 'ID');
  assert.equal(st.idKind('idish'), 'ID');
  assert.equal(st.idKind('xs:IDREF'), 'IDREF');
  assert.equal(st.idKind('xs:IDREFS'), 'IDREFS');
  assert.equal(st.idKind('refList'), 'IDREFS');
  assert.equal(st.idKind('strList'), null);
  assert.equal(st.idKind('len'), null);
  assert.equal(st.idKind('xs:string'), null);
});

test('reports whether a type reaches a named type through derivation', () => {
  assert.equal(st.reaches('len', 'rel'), true);
  assert.equal(st.reaches('grid', 'weight'), true);
  assert.equal(st.reaches('nums', 'rel'), false);
  assert.equal(st.reaches('mode', 'rel'), false);
});

test('rejects malformed type definitions when first used', () => {
  assert.throws(() => st.check('nope', 'x'), /unknown simple type/);
  assert.throws(() => st.check('badEnum', '1'), /invalid enumeration/);
  assert.throws(() => st.check('badMin', '1'), /invalid facet/);
});
