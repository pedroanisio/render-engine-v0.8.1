import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main, parseRenderArgs } from '../src/cli.js';

const basic = readFileSync(new URL('./fixtures/basic.xml', import.meta.url), 'utf8');

/** @param {string[]} argv @param {Record<string, string>} files */
function run(argv, files) {
  let out = '';
  let err = '';
  const code = main(argv, {
    readFile: (p) => {
      const f = files[p];
      if (f === undefined) throw Object.assign(new Error(`ENOENT: no such file, open '${p}'`), { code: 'ENOENT' });
      return f;
    },
    stdout: (s) => { out += s; },
    stderr: (s) => { err += s; },
  });
  return { code, out, err };
}

test('validate exits 0 and reports a valid scene', () => {
  const r = run(['validate', 'a.xml'], { 'a.xml': basic });
  assert.deepEqual(r, { code: 0, out: 'a.xml: valid\n', err: '' });
});

test('validate exits 1 and prints one located line per diagnostic', () => {
  const r = run(['validate', 'b.xml'], { 'b.xml': basic.replace('width="1920"', 'width="0" bogus="1"') });
  assert.equal(r.code, 1);
  const lines = r.out.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /^b\.xml:3:\d+: E_ATTR_VALUE \[schema\] @width="0": not a valid xs:positiveInteger at \/scene\/project\[1\]$/);
  assert.match(lines[1] ?? '', /^b\.xml:3:\d+: E_ATTR_UNKNOWN \[schema\] attribute bogus is not declared on <project> at \/scene\/project\[1\]$/);
});

test('--json emits a machine-readable verdict', () => {
  const r = run(['validate', '--json', 'b.xml'], { 'b.xml': '<scene' });
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.file, 'b.xml');
  assert.equal(j.valid, false);
  assert.equal(j.diagnostics[0].code, 'E_XML_SYNTAX');
  const ok = JSON.parse(run(['validate', 'a.xml', '--json'], { 'a.xml': basic }).out);
  assert.deepEqual(ok, { file: 'a.xml', valid: true, diagnostics: [] });
});

test('prints parse errors without an element path', () => {
  const r = run(['validate', 'c.xml'], { 'c.xml': '<scene>' });
  assert.equal(r.code, 1);
  assert.match(r.out, /^c\.xml:1:\d+: E_XML_SYNTAX \[parse\] [^\n]*[^h]\n$/);
  assert.doesNotMatch(r.out, / at \//);
});

test('reports non-Error read failures', () => {
  let err = '';
  const code = main(['validate', 'x'], {
    readFile: () => { throw 'EACCES'; }, // eslint-disable-line no-throw-literal
    stdout: () => {},
    stderr: (s) => { err += s; },
  });
  assert.equal(code, 2);
  assert.equal(err, 'cannot read x: EACCES\n');
});

test('exits 2 on usage and I/O errors', () => {
  assert.equal(run([], {}).code, 2);
  assert.match(run([], {}).err, /usage: scene-render validate/);
  assert.equal(run(['render', 'a.xml'], {}).code, 2);
  assert.equal(run(['validate'], {}).code, 2);
  assert.equal(run(['validate', 'a', 'b'], {}).code, 2);
  assert.equal(run(['validate', '--nope', 'a'], {}).code, 2);
  const missing = run(['validate', 'missing.xml'], {});
  assert.equal(missing.code, 2);
  assert.match(missing.err, /cannot read missing\.xml: ENOENT/);
});

import { png, wav } from './support/media.js';

const assetScene = `<scene version="1.1">
  <project width="64" height="64" fps="24" duration="1"/>
  <assets>
    <image id="ok" src="a/p.png" width="4" height="3"/>
    <image id="bad" src="a/q.png" width="4" height="3"/>
    <audio id="gone" src="a/s.wav" duration="0.5" sampleRate="48000" channels="2"/>
    <audio id="gone2" src="b/t.wav"/>
    <font id="up" src="../outside.ttf" family="X"/>
    <font id="web" src="https://example.com/f.ttf" family="X"/>
    <imageSequence id="seq" src="seq/%04d.png" width="4" height="3" first="1" last="2" fps="24"/>
    <image id="denied" src="a/locked.png" width="4" height="3"/>
  </assets>
  <composition/>
</scene>`;

/** @param {string[]} argv @param {Record<string, string | Uint8Array>} files */
function runBytes(argv, files) {
  let out = '';
  let err = '';
  const get = (/** @type {string} */ p) => {
    const f = files[p];
    if (f === 'EACCES') throw Object.assign(new Error(`EACCES: permission denied, open '${p}'`), { code: 'EACCES' });
    if (f === undefined) throw Object.assign(new Error(`ENOENT: no such file, open '${p}'`), { code: 'ENOENT' });
    return f;
  };
  const code = main(argv, {
    readFile: (p) => /** @type {string} */ (get(p)),
    readBytes: (p) => /** @type {Uint8Array} */ (get(p)),
    stdout: (s) => { out += s; },
    stderr: (s) => { err += s; },
  });
  return { code, out, err };
}

const assetFiles = {
  'proj/scene.xml': assetScene,
  'proj/a/p.png': png(4, 3),
  'proj/a/q.png': png(8, 3),
  'proj/a/locked.png': 'EACCES',
};

test('assets reports every file dependency and exits 1 when any is missing or wrong', () => {
  const r = runBytes(['assets', 'proj/scene.xml'], assetFiles);
  assert.equal(r.code, 1);
  assert.equal(r.out, [
    'INVALID    image a/q.png (bad): width is 8, declared 4',
    'MISSING    audio a/s.wav (gone)',
    'MISSING    audio b/t.wav (gone2)',
    'OUTSIDE    font ../outside.ttf (up): resolves outside the scene directory; not read',
    'UNCHECKED  font https://example.com/f.ttf (web): remote or absolute URI',
    'UNCHECKED  imageSequence seq/%04d.png (seq): sequence pattern',
    'INVALID    image a/locked.png (denied): cannot read: EACCES: permission denied, open \'proj/a/locked.png\'',
    '8 file dependencies: 1 ok, 2 missing, 2 invalid, 1 outside, 2 unchecked',
    'missing by element: audio 2',
    '',
  ].join('\n'));
});

test('assets --json carries hashes and sniffed facts for machine intake', () => {
  const r = runBytes(['assets', '--json', 'proj/scene.xml'], assetFiles);
  const j = JSON.parse(r.out);
  assert.deepEqual(j.summary, { total: 8, ok: 1, missing: 2, invalid: 2, outside: 1, unchecked: 2 });
  assert.deepEqual(j.missingByElement, { audio: 2 });
  const ok = j.dependencies[0];
  assert.equal(ok.status, 'ok');
  assert.match(ok.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(ok.sniffed, { format: 'png', family: 'image', width: 4, height: 3 });
  assert.equal(ok.file, 'proj/a/p.png');
});

test('assets exits 0 when every dependency is present and consistent', () => {
  const scene = assetScene.replace(/<image id="bad"[\s\S]*<\/assets>/, '</assets>');
  const r = runBytes(['assets', 's.xml'], { 's.xml': scene, 'a/p.png': png(4, 3) });
  assert.equal(r.code, 0);
  assert.equal(r.out, '1 file dependencies: 1 ok, 0 missing, 0 invalid, 0 outside, 0 unchecked\n');
  const w = runBytes(['assets', 's.xml'], {
    's.xml': assetScene.replace(/<image id="ok"[\s\S]*<\/assets>/, '<audio id="gone" src="a/s.wav" duration="0.5" sampleRate="48000" channels="2"/></assets>'),
    'a/s.wav': wav({ channels: 2, rate: 48000, bits: 24, frames: 24000 }),
  });
  assert.equal(w.code, 0);
});

test('assets refuses an invalid scene with its diagnostics', () => {
  const r = runBytes(['assets', 's.xml'], { 's.xml': '<scene/>' });
  assert.equal(r.code, 1);
  assert.match(r.out, /E_CONTENT_INCOMPLETE/);
  assert.equal(runBytes(['assets'], {}).code, 2);
  assert.equal(runBytes(['assets', 'nope.xml'], {}).code, 2);
});


test('parseRenderArgs reads options and rejects bad ones', () => {
  assert.deepEqual(parseRenderArgs(['s.xml', '--output', 'o', '--scale', '0.5', '--from', '1', '--to', '2', '--work', 'w']),
    { ok: true, options: { sceneFile: 's.xml', outputId: 'o', scale: 0.5, from: 1, to: 2, work: 'w' } });
  assert.deepEqual(parseRenderArgs(['s.xml']), { ok: true, options: { sceneFile: 's.xml' } });
  assert.equal(parseRenderArgs([]).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--scale', '0']).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--from', 'x']).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--bogus', '1']).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--to']).ok, false);
  assert.deepEqual(parseRenderArgs(['s.xml', '--jobs', '4', '--shard', '1/4']),
    { ok: true, options: { sceneFile: 's.xml', jobs: 4, shard: [1, 4] } });
  assert.equal(parseRenderArgs(['s.xml', '--jobs', '0']).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--shard', '4/4']).ok, false);
  assert.equal(parseRenderArgs(['s.xml', '--shard', 'x']).ok, false);
  assert.deepEqual(parseRenderArgs(['s.xml', '--available', 'yes']), { ok: true, options: { sceneFile: 's.xml', available: true } });
  assert.equal(parseRenderArgs(['s.xml', '--available', 'no']).ok, false);
});
