import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSchema } from '../src/xsd/compile.js';
import { emitModelModule, emitTypes } from '../src/xsd/emit.js';

const read = (/** @type {string} */ p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** @type {import('../src/xsd/model.js').SchemaModel} */
const tiny = {
  version: '1',
  root: { name: 'doc', type: '/doc' },
  simpleTypes: {
    mode: { kind: 'restriction', base: 'xs:string', facets: { enumeration: ['a', "b'c"] } },
    small: { kind: 'restriction', base: 'xs:int', facets: { enumeration: ['1'] } },
    nums: { kind: 'list', itemType: 'xs:double' },
    len: { kind: 'union', memberTypes: ['xs:double', 'mode', 'xs:double'] },
    refs: { kind: 'list', itemType: 'len' },
  },
  complexTypes: {
    '/doc': {
      attributes: {
        a: { type: 'mode', required: true, default: null },
        b: { type: 'nums', required: false, default: '1 2' },
        c: { type: 'len', required: false, default: null },
        d: { type: 'xs:unsignedLong', required: false, default: null },
        e: { type: 'xs:IDREFS', required: false, default: null },
        f: { type: 'xs:boolean', required: false, default: null },
        g: { type: 'small', required: false, default: null },
        h: { type: 'refs', required: false, default: null },
      },
      content: { kind: 'empty' },
    },
    'items/note-1': { attributes: {}, content: { kind: 'simple', type: 'xs:string' } },
  },
};

test('emits attribute interfaces with defaults made non-optional', () => {
  const ts = emitTypes(tiny);
  assert.match(ts, /export interface DocAttributes \{/);
  assert.match(ts, /'a': 'a' \| 'b\\'c';/);
  assert.match(ts, /'b': Array<number>;/);
  assert.match(ts, /'c'\?: number \| 'a' \| 'b\\'c';/);
  assert.match(ts, /'d'\?: bigint;/);
  assert.match(ts, /'e'\?: Array<string>;/);
  assert.match(ts, /'f'\?: boolean;/);
  assert.match(ts, /'g'\?: number;/);
  assert.match(ts, /'h'\?: Array<number \| 'a' \| 'b\\'c'>;/);
  assert.match(ts, /export interface ItemsNote1Attributes \{\}/);
  assert.match(ts, /'\/doc': DocAttributes;/);
});

test('refuses identifier collisions', () => {
  const clash = { ...tiny, complexTypes: { 'a/b': tiny.complexTypes['/doc'], 'a-b': tiny.complexTypes['/doc'] } };
  assert.throws(() => emitTypes(/** @type {any} */ (clash)), /collide/);
});

test('emits a model module that round-trips the model', async () => {
  const src = emitModelModule(tiny, 'x.xsd');
  assert.match(src, /Generated from x\.xsd/);
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.deepEqual(mod.MODEL, tiny);
});

test('committed generated files match a fresh generation from the schema', () => {
  const model = compileSchema(read('../schema/scene-render-1.1.xsd'));
  assert.equal(read('../src/generated/model.js'), emitModelModule(model, 'schema/scene-render-1.1.xsd'),
    'src/generated/model.js is stale: run npm run codegen');
  assert.equal(read('../src/generated/types.d.ts'), emitTypes(model),
    'src/generated/types.d.ts is stale: run npm run codegen');
});
