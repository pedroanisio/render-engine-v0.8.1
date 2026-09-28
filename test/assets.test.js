import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScene } from '../src/index.js';
import { fileDependencies, inspect, sniff } from '../src/assets.js';
import { png, wav } from './support/media.js';


const scene = `<scene version="1.1">
  <project width="64" height="64" fps="24" duration="1"/>
  <assets>
    <image id="img" src="a/p.png" width="4" height="3" proxy="a/p-proxy.png"/>
    <audio id="snd" src="a/s.wav" duration="0.5" sampleRate="48000" channels="2"/>
    <font id="f" src="f.ttf" family="X" sha256="${'0'.repeat(64)}"/>
    <imageSequence id="seq" src="seq/%04d.png" width="4" height="3" first="1" last="2" fps="24"/>
  </assets>
  <composition/>
</scene>`;

test('lists every file the scene depends on with its declared expectations', () => {
  const r = loadScene(scene);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  if (!r.ok) return;
  const deps = fileDependencies(r.scene);
  assert.deepEqual(deps.map((d) => [d.element, d.id, d.role, d.uri]), [
    ['image', 'img', 'src', 'a/p.png'],
    ['image', 'img', 'proxy', 'a/p-proxy.png'],
    ['audio', 'snd', 'src', 'a/s.wav'],
    ['font', 'f', 'src', 'f.ttf'],
    ['imageSequence', 'seq', 'src', 'seq/%04d.png'],
  ]);
  assert.deepEqual(deps[0]?.declared, { width: 4, height: 3 });
  assert.deepEqual(deps[1]?.declared, {});
  assert.deepEqual(deps[2]?.declared, { duration: 0.5, sampleRate: 48000, channels: 2 });
  assert.deepEqual(deps[3]?.declared, { sha256: '0'.repeat(64) });
  assert.equal(deps[4]?.pattern, true);
});

test('sniffs PNG, WAV, fonts and JPEG by content', () => {
  assert.deepEqual(sniff(png(4, 3)), { format: 'png', family: 'image', width: 4, height: 3 });
  assert.deepEqual(sniff(wav({ channels: 2, rate: 48000, bits: 24, frames: 24000, list: true })),
    { format: 'wav', family: 'audio', channels: 2, sampleRate: 48000, bitsPerSample: 24, duration: 0.5 });
  assert.deepEqual(sniff(Uint8Array.of(0, 1, 0, 0, 9)), { format: 'truetype', family: 'font' });
  assert.deepEqual(sniff(new TextEncoder().encode('OTTO....')), { format: 'opentype', family: 'font' });
  assert.deepEqual(sniff(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)), { format: 'jpeg', family: 'image' });
  assert.deepEqual(sniff(new TextEncoder().encode('hello')), { format: 'unknown', family: 'unknown' });
  assert.deepEqual(sniff(new TextEncoder().encode('RIFF\0\0\0\0WAVEjunk')), { format: 'wav', family: 'audio', malformed: true });
});

test('flags mismatches against declared dimensions, audio format and hash', () => {
  const r = loadScene(scene);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [img, , snd, font] = fileDependencies(r.scene);
  assert.ok(img && snd && font);
  assert.deepEqual(inspect(img, png(4, 3), 'ab').problems, []);
  assert.deepEqual(inspect(img, png(5, 3), 'ab').problems, ['width is 5, declared 4']);
  assert.deepEqual(inspect(img, png(4, 2), 'ab').problems, ['height is 2, declared 3']);
  assert.deepEqual(inspect(snd, wav({ channels: 2, rate: 48000, bits: 24, frames: 24000 }), 'ab').problems, []);
  assert.deepEqual(inspect(snd, wav({ channels: 1, rate: 44100, bits: 16, frames: 44100 }), 'ab').problems,
    ['channels is 1, declared 2', 'sampleRate is 44100, declared 48000', 'duration is 1s, declared 0.5s']);
  assert.deepEqual(inspect(snd, wav({ channels: 2, rate: 48000, bits: 24, frames: 24001 }), 'ab').problems, []);
  assert.deepEqual(inspect(snd, wav({ channels: 2, rate: 48000, bits: 24, frames: 24002 }), 'ab').problems,
    ['duration is 0.500042s, declared 0.5s']);
  assert.deepEqual(inspect(snd, png(1, 1), 'ab').problems, ['expected audio data, found png']);
  assert.deepEqual(inspect(snd, new TextEncoder().encode('RIFF\0\0\0\0WAVE'), 'ab').problems, ['malformed wav data']);
  assert.deepEqual(inspect(font, Uint8Array.of(0, 1, 0, 0), '0'.repeat(64)).problems, []);
  assert.deepEqual(inspect(font, Uint8Array.of(0, 1, 0, 0), 'f'.repeat(64)).problems,
    [`sha256 is ${'f'.repeat(64)}, declared ${'0'.repeat(64)}`]);
  assert.deepEqual(inspect(img, new TextEncoder().encode('?'), 'ab').problems, []);
});
