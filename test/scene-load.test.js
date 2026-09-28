import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene, attributesOf } from '../src/index.js';

const basic = readFileSync(new URL('./fixtures/basic.xml', import.meta.url), 'utf8');

/** @param {string} from @param {string} to */
const edit = (from, to) => {
  assert.ok(basic.includes(from), `fixture lacks ${from}`);
  return basic.replace(from, to);
};
/** @param {string} src */
const codes = (src) => {
  const r = loadScene(src);
  return r.ok ? [] : r.diagnostics.map((d) => d.code);
};

test('loads a valid scene into a typed, frozen tree with an ID index', () => {
  const r = loadScene(basic);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  if (!r.ok) return;
  const project = r.scene.children[0];
  assert.ok(project);
  const p = attributesOf(project, 'projectType');
  assert.equal(p.width, 1920);
  assert.equal(p.fps, '30000/1001');
  assert.equal(p.seed, 18446744073709551615n);
  assert.equal(p.linearLight, true);
  assert.equal(p.workingColorSpace, 'srgb');
  const dot = r.ids.get('dot');
  assert.equal(dot?.path, '/scene/composition[1]/group[1]/shape[1]');
  assert.equal(dot && attributesOf(dot, 'shapeType').x, '50%');
  assert.equal(dot && attributesOf(dot, 'shapeType').width, 40);
  assert.throws(() => { /** @type {any} */ (project.attributes).width = 1; }, TypeError);
});

test('attributesOf refuses a node of another type', () => {
  const r = loadScene(basic);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.throws(() => attributesOf(r.scene, 'projectType'), /is \/scene, not projectType/);
});

test('reports parse, policy and schema failures without a tree', () => {
  assert.deepEqual(codes('<scene'), ['E_XML_SYNTAX']);
  assert.deepEqual(codes('<!DOCTYPE scene><scene/>'), ['E_DOCTYPE']);
  assert.deepEqual(codes(edit('width="1920"', 'width="0"')), ['E_ATTR_VALUE']);
  assert.deepEqual(loadScene(basic, { limits: { maxDepth: 3 } }).ok, false);
});

test('resolves url(#id) paint references against paints/*', () => {
  assert.deepEqual(codes(edit('fill="url(#sky)"', 'fill="url(#nope)"')), ['E_PAINT_REF']);
  assert.deepEqual(codes(edit('fill="url(#sky)"', 'fill="url(#logo)"')), ['E_PAINT_REF']);
  const r = loadScene(edit('fill="url(#sky)"', 'fill="url(#nope)"'));
  assert.equal(!r.ok && r.diagnostics[0]?.path, '/scene/composition[1]/shape[1]');
  assert.equal(!r.ok && r.diagnostics[0]?.stage, 'semantic');
});

test('resolves var(--name) colour tokens against styles/token', () => {
  assert.deepEqual(codes(edit('color="var(--brand)"', 'color="var(--missing)"')), ['E_TOKEN_REF']);
  assert.deepEqual(codes(edit('<token name="ink"', '<token name="brand"')), ['E_TOKEN_DUPLICATE', 'E_TOKEN_REF']);
  assert.deepEqual(codes(edit('  <styles>\n    <token name="brand" value="#FF3366"/>\n    <token name="ink" value="0.1,0.1,0.1"/>\n  </styles>\n', '')),
    ['E_TOKEN_REF', 'E_TOKEN_REF']);
});

test('ignores reference-like text in attributes that are not paints or colours', () => {
  assert.deepEqual(codes(edit('<token name="brand" value="#FF3366"/>', '<token name="brand" value="url(#nowhere)"/>')), []);
  assert.deepEqual(codes(edit('src="assets/logo.png"', 'src="var(--x)"')), []);
});

test('does not run semantic checks when schema validation failed', () => {
  assert.deepEqual(codes(edit('fill="url(#sky)"', 'fill="url(#nope)" bogus="1"')), ['E_ATTR_UNKNOWN']);
});
