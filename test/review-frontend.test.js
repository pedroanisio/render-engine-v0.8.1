import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScene, compileRuntime, capabilities, prepareScene, MODEL } from '../src/index.js';
import { createValidator } from '../src/xsd/validate.js';
import { createSimpleTypes } from '../src/xsd/simple.js';
import { createSemanticChecker } from '../src/scene/semantic.js';
import { resolveParameters, MAX_PATTERN_INPUT } from '../src/scene/parameters.js';
import { expandScene } from '../src/scene/expand.js';
import { main, containedPath } from '../src/cli.js';
import { sniff } from '../src/assets.js';
import { wav } from './support/media.js';

const xml = (body, sections = '') =>
  `<scene version="1.1"><project width="32" height="32" duration="4" fps="4"/>${sections}<composition>${body}</composition></scene>`;
const rect = (id) => `<shape id="${id}" shape="rect" width="8" height="8"/>`;
const loc = { line: 1, column: 1 };

test('Object.prototype member names are ordinary unknown names, not crashes', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const attr = loadScene(xml('', '').replace('<scene ', `<scene ${name}="1" `));
    assert.equal(attr.ok, false, name);
    assert.ok(!attr.ok && attr.diagnostics.some((d) => d.code === 'E_ATTR_UNKNOWN'), name);
    const child = loadScene(xml('').replace('<composition>', `<${name}/><composition>`));
    assert.equal(child.ok, false, name);
    assert.ok(!child.ok && child.diagnostics.some((d) => d.code === 'E_ELEMENT_UNEXPECTED'), name);
  }
});

test('semantic and capability checks tolerate prototype-named nodes and attributes', () => {
  const node = (name, type, attributes = {}, children = []) =>
    ({ name, type, attributes, children, value: null, loc, path: `/${name}` });
  const v = createValidator(MODEL);
  const semantic = createSemanticChecker(MODEL, v.simple);
  const odd = node('scene', 'sceneType', { toString: 'x' }, [node('constructor', 'constructor', { valueOf: '1' })]);
  assert.doesNotThrow(() => semantic(/** @type {any} */ (odd)));
  const d = capabilities(/** @type {any} */ (node('scene', 'sceneType', {}, [node('constructor', 'constructor')])));
  assert.ok(d.some((x) => /<constructor> is not implemented/.test(x.message)));
  const unknownAttr = capabilities(/** @type {any} */ (node('scene', 'sceneType', {}, [
    node('project', 'constructor', { hasOwnProperty: 1 }),
  ])));
  assert.ok(Array.isArray(unknownAttr));
});

test('a simple type that fails to build keeps failing with its own error, not "circular"', () => {
  const s = createSimpleTypes({ bad: { kind: 'restriction', base: 'xs:integer', facets: { minInclusive: 'x' } } });
  assert.throws(() => s.check('bad', '1'), /invalid facet value/);
  assert.throws(() => s.check('bad', '1'), /invalid facet value/);
});

test('maxDiagnostics <= 0 truncates the report but never validates an invalid scene', () => {
  for (const maxDiagnostics of [0, -1]) {
    const r = loadScene('<scene/>', { maxDiagnostics });
    assert.equal(r.ok, false);
    assert.deepEqual(!r.ok && r.diagnostics, []);
  }
  const v = createValidator(MODEL);
  const parsedBad = /** @type {any} */ ({ kind: 'element', name: 'scene', ns: '', local: 'scene', attributes: [], children: [], loc });
  const r = v.validate(parsedBad, { maxDiagnostics: 0 });
  assert.equal(r.valid, false);
  assert.equal(r.diagnostics.length, 0);
  assert.equal(loadScene(xml(rect('a')), { maxDiagnostics: 0 }).ok, true);
});

/** @param {string} root */
function sandbox(root) {
  const dir = join(root, 'proj');
  const out = join(root, 'secret');
  mkdirSync(dir);
  mkdirSync(out);
  writeFileSync(join(out, 'rows.json'), '[{"a":1}]');
  writeFileSync(join(out, 'part.xml'), xml(rect('s')));
  writeFileSync(join(out, 'logo.png'), 'x');
  symlinkSync(out, join(dir, 'link'));
  return dir;
}

/** @param {string[]} argv */
function run(argv) {
  let out = '';
  let err = '';
  const reads = /** @type {string[]} */ ([]);
  const code = main(argv, {
    readFile: (p) => (reads.push(p), readFileSync(p, 'utf8')),
    readBytes: (p) => (reads.push(p), readFileSync(p)),
    realpath: (p) => realpathSync(p),
    stdout: (s) => { out += s; },
    stderr: (s) => { err += s; },
  });
  return { code, out, err, reads };
}

test('CLI preflight and assets refuse symlink and lexical escapes from the scene directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'review-frontend-'));
  try {
    const dir = sandbox(root);
    const data = (src) => `<parameters><data id="d" src="${src}" format="json"/></parameters>`;
    for (const src of ['link/rows.json', '../secret/rows.json']) {
      writeFileSync(join(dir, 's.xml'), xml(rect('a'), data(src)));
      const r = run(['preflight', '--json', join(dir, 's.xml')]);
      assert.equal(r.code, 1, src);
      assert.match(r.out, /outside the scene directory/);
      assert.deepEqual(r.reads, [join(dir, 's.xml')]);
    }
    writeFileSync(join(dir, 'rows.json'), '[{"a":1}]');
    writeFileSync(join(dir, 's.xml'), xml(rect('a'), data('rows.json')));
    assert.equal(run(['preflight', join(dir, 's.xml')]).code, 0);

    writeFileSync(
      join(dir, 's.xml'),
      xml('', '<assets><font id="a" src="link/logo.png" family="F"/><font id="b" src="..logo.png" family="G"/><font id="c" src="missing/deep/x.ttf" family="H"/></assets>'),
    );
    const a = run(['assets', '--json', join(dir, 's.xml')]);
    const deps = JSON.parse(a.out).dependencies;
    assert.equal(deps[0].status, 'outside');
    assert.match(deps[0].problems[0], /symlink/);
    assert.equal(deps[1].status, 'missing');
    assert.equal(deps[2].status, 'missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('containedPath classifies URIs and reports unresolvable directories', () => {
  const io = /** @type {any} */ ({});
  assert.equal(containedPath(io, 'p', 'https://x/y').ok, false);
  assert.equal(containedPath(io, 'p', '/abs').ok, false);
  assert.equal(containedPath(io, 'p', '').ok, false);
  assert.deepEqual(containedPath(io, 'p', '..x'), { ok: true, path: 'p/..x' });
  assert.equal(containedPath(io, 'p', '../x').ok, false);
  const denied = containedPath(
    { ...io, realpath: () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); } },
    'p',
    'x',
  );
  assert.ok(!denied.ok && /cannot resolve/.test(denied.reason));
  const probes = /** @type {string[]} */ ([]);
  const walked = containedPath(
    {
      ...io,
      realpath: (p) => {
        probes.push(p);
        if (p === 'p' || p === '.') return '/r/' + p;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    },
    '',
    'a/b',
  );
  assert.equal(walked.ok, true);
  assert.deepEqual(probes, ['.', 'a/b', 'a', '.']);
});

test('includes: realpath containment with root, per-path cache and merged-section budget', () => {
  const root = mkdtempSync(join(tmpdir(), 'review-frontend-'));
  try {
    const dir = sandbox(root);
    const scene = /** @type {any} */ (loadScene(xml('<include id="i" src="link/part.xml"/>'))).scene;
    const read = (p) => readFileSync(join(dir, p), 'utf8');
    assert.throws(
      () => compileRuntime(scene, /** @type {any} */ ({ expand: true, load: loadScene, read, root: dir })),
      /symlink escapes/,
    );
    assert.doesNotThrow(() => compileRuntime(scene, /** @type {any} */ ({ expand: true, load: loadScene, read })));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const assets = Array.from({ length: 40 }, (_, i) => `<font id="f${i}" src="f${i}.ttf" family="F"/>`).join('');
  const part = xml(rect('s'), `<assets>${assets}</assets>`);
  let reads = 0;
  const read = () => (reads++, part);
  const includes = Array.from({ length: 5 }, (_, i) => `<include id="i${i}" src="part.xml"/>`).join('');
  const scene = /** @type {any} */ (loadScene(xml(includes))).scene;
  const ok = compileRuntime(scene, /** @type {any} */ ({ expand: true, load: loadScene, read }));
  assert.equal(reads, 1);
  assert.equal(ok.scene.children.find((n) => n.name === 'assets').children.length, 200);
  assert.throws(
    () => compileRuntime(scene, /** @type {any} */ ({ expand: true, load: loadScene, read, maxInstances: 150 })),
    /node budget/,
  );
});

test('include rebasing covers src, proxy and cache but leaves absolute paths and URIs alone', () => {
  const part = xml(
    '',
    '<assets>' +
      '<image id="a" src="a.png" proxy="a-small.png" width="1" height="1"/>' +
      '<image id="b" src="https://cdn.test/b.png" proxy="/abs/b.png" width="1" height="1"/>' +
      '<image id="c" src="data:image/png;base64,AA==" proxy="file:///c.png" width="1" height="1"/>' +
      `<generated id="g" kind="image" provider="p" model="m" cache="cache/g.png" cacheSha256="${'0'.repeat(64)}"/>` +
      '</assets>',
  );
  const scene = /** @type {any} */ (loadScene(xml('<include id="i" src="sub/part.xml"/>'))).scene;
  const r = compileRuntime(scene, /** @type {any} */ ({ expand: true, load: loadScene, read: () => part }));
  const byId = Object.fromEntries(
    r.scene.children.find((n) => n.name === 'assets').children.map((n) => [n.attributes.id, n.attributes]),
  );
  assert.equal(byId.i__a.src, 'sub/a.png');
  assert.equal(byId.i__a.proxy, 'sub/a-small.png');
  assert.equal(byId.i__b.src, 'https://cdn.test/b.png');
  assert.equal(byId.i__b.proxy, '/abs/b.png');
  assert.equal(byId.i__c.src, 'data:image/png;base64,AA==');
  assert.equal(byId.i__c.proxy, 'file:///c.png');
  assert.equal(byId.i__g.cache, 'sub/cache/g.png');
});

test('scoped references without a dot are left intact', () => {
  const node = (name, attributes, children = [], value = null) =>
    ({ name, type: `${name}Type`, attributes, children, value, loc, path: `/${name}` });
  const symbol = node('symbol', { id: 'sym' }, [
    node('shape', { id: 'ab' }, [
      node('expression', { property: 'x' }, [], "prop('abx') + prop('ab.x')"),
      node('link', { property: 'y', source: 'abx' }),
    ]),
  ]);
  const input = node('scene', {}, [
    node('symbols', {}, [symbol]),
    node('composition', {}, [node('instance', { id: 'i', symbol: 'sym' })]),
  ]);
  const out = /** @type {any} */ (expandScene(/** @type {any} */ (input), {}, new Map()));
  const shape = out.children[0].children[0].children.at(-1).children[0];
  assert.equal(shape.children[0].value, "prop('abx') + prop('i__ab.x')");
  assert.equal(shape.children[1].attributes.source, 'abx');
});

test('parameter patterns match the whole value and bound the input length', () => {
  const s = (attrs) =>
    /** @type {any} */ (loadScene(xml(rect('a'), `<parameters><param id="p" type="string" ${attrs}/></parameters>`))).scene;
  assert.throws(() => resolveParameters(s('default="xab" pattern="ab"')), /does not match pattern/);
  assert.equal(resolveParameters(s('default="b" pattern="a|b"')).params.p, 'b');
  assert.throws(() => resolveParameters(s('default="ab" pattern="a|b"')), /does not match pattern/);
  const long = 'a'.repeat(MAX_PATTERN_INPUT + 1);
  assert.throws(() => resolveParameters(s('pattern="a*"'), { parameters: { p: long } }), /exceeds 10000 characters/);
  assert.equal(resolveParameters(s('pattern="a*"'), { parameters: { p: long.slice(1) } }).params.p.length, MAX_PATTERN_INPUT);
});

test('WAV sniffing measures unknown or overstated data sizes and rejects short fmt chunks', () => {
  const base = wav({ channels: 1, rate: 1000, bits: 8, frames: 500 });
  const dataSize = 40;
  const set = (/** @type {number} */ n) => {
    const b = base.slice();
    new DataView(b.buffer).setUint32(dataSize, n, true);
    return b;
  };
  for (const n of [0, 0xffffffff, 10_000]) assert.equal(/** @type {any} */ (sniff(set(n))).duration, 0.5, String(n));
  assert.equal(/** @type {any} */ (sniff(set(250))).duration, 0.25);
  const short = base.slice();
  new DataView(short.buffer).setUint32(16, 8, true);
  assert.deepEqual(sniff(short), { format: 'wav', family: 'audio', malformed: true });
});

test('prepareScene still reports a prototype-named include target as an ordinary error', () => {
  assert.equal(prepareScene(xml('<include id="i" src="constructor"/>')).ok, false);
});
