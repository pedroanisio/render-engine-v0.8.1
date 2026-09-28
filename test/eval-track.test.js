import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene } from '../src/index.js';
import { compileAnimations } from '../src/eval/track.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** @param {string} animate @param {string} [shapeAttrs] */
function scene(animate, shapeAttrs = '') {
  const r =
    loadScene(`<scene version="1.1"><project width="64" height="64" fps="24" duration="20"/>
    <composition><shape id="s" shape="rect" width="10" height="10"${shapeAttrs}>${animate}</shape></composition></scene>`);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  return compileAnimations(r.scene);
}
/** @param {string} animate @param {string} [attrs] */
function track(animate, attrs) {
  const c = scene(animate, attrs);
  assert.deepEqual(c.diagnostics, []);
  const t = c.tracks.get('s')?.[0];
  assert.ok(t);
  return t;
}
/** @param {string} animate */
const codes = (animate) => scene(animate).diagnostics.map((d) => d.code);

const two = (extra = '', k0 = '', k1 = '') =>
  `<animate property="x" ${extra}><key time="2" value="10" ${k0}/><key time="6" value="30" ${k1}/></animate>`;

test('interpolates between keys with the default and per-key curves', () => {
  const lin = track(two());
  assert.equal(lin.property, 'x');
  close(lin.valueAt(4), 20);
  close(lin.valueAt(2), 10);
  close(lin.valueAt(6), 30);
  const eio = track(two('defaultInterpolation="ease-in-out"'));
  close(eio.valueAt(4), 20, 1e-7);
  assert.ok(eio.valueAt(2.5) < 10 + 20 * (0.5 / 4));
  const quad = track(two('defaultInterpolation="linear"', 'interpolation="quad-in"'));
  close(quad.valueAt(4), 15);
});

test('holds outside the key range by default', () => {
  const t = track(two());
  assert.equal(t.valueAt(0), 10);
  assert.equal(t.valueAt(99), 30);
});

test('supports every extrapolation mode on both sides', () => {
  const lin = track(two('extrapolateBefore="linear" extrapolateAfter="linear"'));
  close(lin.valueAt(0), 0);
  close(lin.valueAt(8), 40);
  const loop = track(two('extrapolateAfter="loop" extrapolateBefore="loop"'));
  close(loop.valueAt(8), 20);
  close(loop.valueAt(0), 20);
  const pp = track(two('extrapolateAfter="ping-pong" extrapolateBefore="ping-pong"'));
  close(pp.valueAt(7), 25);
  close(pp.valueAt(11), 15);
  close(pp.valueAt(1), 15);
  const off = track(two('extrapolateAfter="offset" extrapolateBefore="offset"'));
  close(off.valueAt(8), 40);
  close(off.valueAt(0), 0);
  const single = track(
    '<animate property="x" extrapolateAfter="loop" extrapolateBefore="linear"><key time="1" value="5"/></animate>',
  );
  assert.equal(single.valueAt(0), 5);
  assert.equal(single.valueAt(9), 5);
});

test('step, hold and steps curves', () => {
  for (const c of ['step', 'hold']) {
    const t = track(two(`defaultInterpolation="${c}"`));
    assert.equal(t.valueAt(5.99), 10);
    assert.equal(t.valueAt(6), 30);
  }
  const end = track(two('', 'interpolation="steps" steps="4"'));
  close(end.valueAt(2.9), 10);
  close(end.valueAt(3), 15);
  const start = track(two('', 'interpolation="steps" steps="4" stepPosition="start"'));
  close(start.valueAt(2.1), 15);
  close(start.valueAt(2), 10);
});

test('cubic-bezier reads key/@bezier', () => {
  const t = track(two('', 'interpolation="cubic-bezier" bezier="0,0,1,1"'));
  close(t.valueAt(3), 15, 1e-7);
});

test('equal key times make a jump; the later key wins at that instant', () => {
  const t = track(
    '<animate property="x"><key time="1" value="0"/><key time="2" value="5"/><key time="2" value="50"/><key time="3" value="60"/></animate>',
  );
  close(t.valueAt(1.5), 2.5);
  assert.equal(t.valueAt(2), 50);
  close(t.valueAt(2.5), 55);
});

test('local and normalized time bases follow the owning node span', () => {
  const local = track(two('timeBase="local"'), ' start="10"');
  close(local.valueAt(14), 20);
  const norm = track(
    '<animate property="x" timeBase="normalized"><key time="0" value="0"/><key time="1" value="100"/></animate>',
    ' start="4" end="8"',
  );
  close(norm.valueAt(5), 25);
  const open = track(
    '<animate property="x" timeBase="normalized"><key time="0" value="0"/><key time="1" value="100"/></animate>',
    ' start="10"',
  );
  close(open.valueAt(15), 50);
});

test('reports what cannot be evaluated instead of approximating it', () => {
  assert.deepEqual(
    codes('<animate property="x"><key time="2" value="1"/><key time="1" value="2"/></animate>'),
    ['E_ANIM_ORDER'],
  );
  assert.deepEqual(codes('<animate property="x"><key time="1" value="invalid%"/></animate>'), [
    'E_ANIM_VALUE',
  ]);
  assert.deepEqual(codes('<animate property="nope"><key time="1" value="1"/></animate>'), [
    'E_ANIM_PROPERTY',
  ]);
  assert.deepEqual(
    codes('<animate property="fill.color"><key time="1" value="1"/></animate>'),
    ['E_ANIM_PROPERTY'],
  );
  assert.ok(Number.isFinite(track(two('', 'interpolation="spring"')).valueAt(4)));
  assert.deepEqual(codes(two('', 'interpolation="steps"')), ['E_ANIM_VALUE']);
  assert.deepEqual(codes(two('', 'interpolation="cubic-bezier"')), ['E_ANIM_VALUE']);
  assert.deepEqual(codes(two('', 'interpolation="cubic-bezier" bezier="2,0,1,1"')), [
    'E_ANIM_VALUE',
  ]);
  assert.deepEqual(codes(two('', 'interpolation="cubic-bezier" bezier="1,2,3"')), [
    'E_ANIM_VALUE',
  ]);
  assert.ok(track(two('', 'easeOut="0.5,0.3"')).valueAt(3) < 15);
  assert.deepEqual(codes(two('', 'roving="true"')), ['E_ANIM_VALUE']);
  assert.equal(track(two('additive="true"')).additive, true);
  const d = scene(two('', 'roving="true"')).diagnostics[0];
  assert.equal(d?.stage, 'semantic');
  assert.match(d?.path ?? '', /\/scene\/composition\[1\]\/shape\[1\]\/animate\[1\]/);
});

test('compiles every animation of The Last Floor episode 01', () => {
  const r = loadScene(
    readFileSync(new URL('./fixtures/the-last-floor-ep01.xml', import.meta.url), 'utf8'),
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  const c = compileAnimations(r.scene);
  assert.deepEqual(c.diagnostics, []);
  const all = [...c.tracks.values()].flat();
  assert.equal(all.length, 405);
  const bg = c.tracks.get('shot_001_bg_layer')?.find((t) => t.property === 'x');
  assert.ok(bg);
  close(bg.valueAt(0), -233);
  close(bg.valueAt(11.541667), -215, 1e-6);
  close(bg.valueAt(11.541667 / 2), -224, 1e-6);
});
