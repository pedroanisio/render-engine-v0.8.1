import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { loadScene, compileRuntime } from '../src/index.js';
import { digest, fingerprint, verifiedPath } from '../src/media/resolve.js';
import {
  decodeImage,
  probe,
  inputOptions,
  VideoDecoder,
  MAX_IMAGE_BYTES,
} from '../src/media/decode.js';
import { decodeAudio } from '../src/media/audio.js';
import { SequenceCache } from '../src/media/sequence.js';
import { svgSurface } from '../src/media/special.js';
import { createTypography } from '../src/media/text.js';
import { importMesh } from '../src/media/mesh.js';
import { prepareMedia } from '../src/media/manager.js';
import { FrameRenderer } from '../src/render/frame.js';
import { Surface } from '../src/render/surface.js';

const root = mkdtempSync(join(tmpdir(), 'review-media-')),
  dir = join(root, 'scene'),
  outside = join(root, 'outside');
const source = (assets, composition = '') =>
  `<scene version="1.1"><project width="64" height="64" duration="1" fps="4"/><output id="o" path="out.mp4" codec="h264" container="mp4" preset="ultrafast"/><assets>${assets}</assets><composition>${composition}</composition></scene>`;
function load(xml) {
  const loaded = loadScene(xml);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return loaded.scene;
}
const png = (r, g, b, alpha = 255) =>
  PNG.sync.write({
    width: 16,
    height: 16,
    data: Buffer.from(
      Array.from({ length: 256 }, () => [r, g, b, alpha]).flat(),
    ),
  });
const hash = (s) => digest(new Uint8Array(s.data.buffer));
const ffmpeg = (...args) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
function host(scene, manager) {
  const runtime = compileRuntime(scene);
  return new FrameRenderer(
    scene,
    runtime.tracks,
    { read: manager.read, media: manager.render },
    1,
    runtime,
  );
}
before(() => {
  mkdirSync(dir);
  mkdirSync(outside);
  writeFileSync(join(dir, 'c.png'), png(200, 100, 50, 128));
  copyFileSync(
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    join(dir, 'font.ttf'),
  );
  // 4 fps, frames 0..3 of distinct brightness, 1 second.
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    "color=black:s=16x16:r=4:d=1,format=gray,geq=lum='40+N*60'",
    '-c:v',
    'ffv1',
    join(dir, 'movie.mkv'),
  );
  // 25 fps, 30 frames: frame N has luma 8N.
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    "color=black:s=16x16:r=25:d=1.2,format=gray,geq=lum='N*8'",
    '-c:v',
    'ffv1',
    join(dir, 'count.mkv'),
  );
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=32x24:rate=10:duration=1',
    '-f',
    'mpegts',
    join(outside, 'secret.ts'),
  );
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-f',
    'mpegts',
    join(outside, 'secret-audio.ts'),
  );
  const playlist = (file) =>
    `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\n${join(outside, file)}\n#EXT-X-ENDLIST\n`;
  writeFileSync(join(dir, 'clip.mp4'), playlist('secret.ts'));
  writeFileSync(join(dir, 'clip.m3u8'), playlist('secret.ts'));
  writeFileSync(join(dir, 'sound.m3u8'), playlist('secret-audio.ts'));
  writeFileSync(
    join(dir, 'list.ffconcat'),
    `ffconcat version 1.0\nfile ${join(outside, 'secret.ts')}\n`,
  );
});
after(() => rmSync(root, { recursive: true, force: true }));

test('FFmpeg inputs cannot follow playlists or concat lists out of the scene', async () => {
  const options = inputOptions();
  assert.deepEqual(options.slice(0, 2), ['-protocol_whitelist', 'file']);
  const allowed = options[3].split(',');
  for (const name of ['hls', 'concat', 'dash', 'imf', 'lavfi'])
    assert.ok(!allowed.includes(name), name);
  assert.ok(allowed.includes('matroska') && allowed.includes('mov'));
  assert.ok(allowed.every((name) => /^\w+$/.test(name)));
  for (const file of ['clip.mp4', 'clip.m3u8', 'list.ffconcat'])
    assert.throws(() => probe(join(dir, file)), file);
  assert.throws(() => decodeAudio(join(dir, 'sound.m3u8')));
  assert.throws(() =>
    new VideoDecoder(join(dir, 'clip.m3u8'), {
      width: 32,
      height: 24,
      fps: '10',
      duration: 1,
    }).frame(0, 1),
  );
  for (const src of ['clip.mp4', 'clip.m3u8'])
    await assert.rejects(
      prepareMedia(
        load(
          source(
            `<video id="v" src="${src}" width="32" height="24" fps="10" duration="1"/>`,
          ),
        ),
        { base: dir },
      ),
      src,
    );
  await assert.rejects(
    prepareMedia(
      load(source('<audio id="a" src="sound.m3u8" duration="1"/>')),
      {
        base: dir,
      },
    ),
  );
  // The FFmpeg image fallback is confined the same way.
  await assert.rejects(
    decodeImage(
      readFileSync(join(dir, 'clip.m3u8')),
      {},
      1,
      join(dir, 'clip.m3u8'),
    ),
  );
});

test('ImageMagick layers use a coder chosen by signature, never by the file', async () => {
  writeFileSync(
    join(dir, 'fake.psd'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>',
  );
  await assert.rejects(
    decodeImage(
      readFileSync(join(dir, 'fake.psd')),
      { layer: '0' },
      1,
      join(dir, 'fake.psd'),
    ),
    /layered image must be/,
  );
  // A genuine layered TIFF still decodes, from the verified bytes.
  execFileSync('convert', [
    '-size',
    '4x4',
    'xc:red',
    'xc:blue',
    join(dir, 'layers.tiff'),
  ]);
  const bytes = readFileSync(join(dir, 'layers.tiff')),
    layer = await decodeImage(
      bytes,
      { layer: '1', alpha: 'straight' },
      1,
      join(dir, 'gone.tiff'),
    );
  assert.equal(layer.metadata.width, 4);
  assert.ok(layer.surface.data[2] > 0.9 && layer.surface.data[0] < 0.1);
  const ico = Buffer.from([0, 0, 1, 0, 0, 0]),
    gif = Buffer.from('GIF89a'),
    png8 = Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    psd = Buffer.from('8BPS');
  for (const b of [ico, gif, png8, psd])
    await assert.rejects(
      decodeImage(b, { layer: '0' }, 1, join(dir, 'x.bin')),
      (e) => !/layered image must be/.test(String(e)),
    );
});

test('video frames use the snapped frame index and clamp past the stream end', () => {
  const count = new VideoDecoder(join(dir, 'count.mkv'), {
    width: 16,
    height: 16,
    fps: '25',
    duration: 1.2,
  });
  const at = (t) => hash(count.frame(t, 1));
  assert.equal((29 / 25) * 25 < 29, true);
  assert.equal(at(29 / 25), at(29.5 / 25));
  assert.notEqual(at(29 / 25), at(28.5 / 25));
  // frame-mix between exact frames equals the frame; halfway blends them.
  const mix = count.frame(28.5 / 25, 1, 'frame-mix'),
    lo = count.frame(28 / 25, 1),
    hi = count.frame(29 / 25, 1);
  assert.ok(Math.abs(mix.data[0] - (lo.data[0] + hi.data[0]) / 2) < 1e-6);
  assert.equal(
    hash(count.frame(3 / 25, 1, 'frame-mix')),
    hash(count.frame(3 / 25, 1)),
  );
  // Declared 1.25 s (within tolerance of 1 s at 4 fps) names frame 4, which does not exist.
  const movie = new VideoDecoder(join(dir, 'movie.mkv'), {
    width: 16,
    height: 16,
    fps: '4',
    duration: 1.25,
  });
  assert.equal(hash(movie.frame(1.2, 1)), hash(movie.frame(0.8, 1)));
  assert.equal(movie.last, 3);
  const mixed = movie.frame(0.9, 1, 'frame-mix');
  assert.equal(hash(mixed), hash(movie.frame(0.75, 1)));
  const gone = new VideoDecoder(join(dir, 'movie.mkv'), {
    width: 16,
    height: 16,
    fps: '4',
    duration: 100,
  });
  assert.throws(() => gone.frame(50, 1), /unavailable/);
});

test('image cache keys include decode attributes and replace accounting', async () => {
  const cache = new SequenceCache({}, 1 << 20),
    a = new Surface(2, 2),
    b = new Surface(2, 2);
  b.data[0] = 1;
  const k1 = cache.add('p', 'h', a, { id: 'x', alpha: 'straight' }),
    k2 = cache.add('p', 'h', b, { id: 'y', alpha: 'premultiplied' }),
    k3 = cache.add('p', 'h', a, { alpha: 'straight', id: 'z' });
  assert.notEqual(k1, k2);
  assert.equal(k1, k3);
  assert.equal(cache.frame(k1), a);
  assert.equal(cache.frame(k2), b);
  cache.put(k1, a);
  cache.put(k1, a);
  assert.equal(cache.bytes, a.data.byteLength + b.data.byteLength);
  const scene = load(
      source(
        '<image id="a" src="c.png" width="16" height="16"/><image id="b" src="c.png" width="16" height="16" alpha="premultiplied"/>',
      ),
    ),
    manager = await prepareMedia(scene, { base: dir }),
    h = host(scene, manager);
  assert.notEqual(
    hash(manager.render(h.assets.get('a'), h)),
    hash(manager.render(h.assets.get('b'), h)),
  );
  manager.close();
});

test('decoders read verified bytes; changed or relinked sources fail', async () => {
  // Streamed hashing matches a whole-file digest and captures identity.
  const big = join(dir, 'big.bin');
  writeFileSync(big, Buffer.alloc(3 << 20, 7));
  const print = fingerprint(big),
    kept = fingerprint(big, true);
  assert.equal(print.sha256, digest(readFileSync(big)));
  assert.equal(print.bytes, undefined);
  assert.equal(kept.bytes.length, 3 << 20);
  assert.equal(verifiedPath(dir, 'big.bin', print.identity), big);
  writeFileSync(big, Buffer.alloc(3 << 20, 8));
  assert.throws(() => verifiedPath(dir, 'big.bin', print.identity), /changed/);
  writeFileSync(join(dir, 'empty.bin'), '');
  assert.equal(fingerprint(join(dir, 'empty.bin'), true).bytes.length, 0);

  // Video: hashed as a stream and guarded at every later decode.
  copyFileSync(join(dir, 'movie.mkv'), join(dir, 'guarded.mkv'));
  const sha = digest(readFileSync(join(dir, 'guarded.mkv'))),
    scene = load(
      source(
        `<video id="v" src="guarded.mkv" width="16" height="16" fps="4" duration="1" sha256="${sha}"/>`,
        '<layer id="l" asset="v"/>',
      ),
    ),
    manager = await prepareMedia(scene, { base: dir }),
    h = host(scene, manager);
  assert.equal(manager.dependencies.get('v')[0].sha256, sha);
  h.time = 0;
  manager.render(h.assets.get('v'), h);
  writeFileSync(join(dir, 'guarded.mkv'), readFileSync(join(dir, 'movie.mkv')));
  h.time = 0.5;
  assert.throws(
    () => manager.render(h.assets.get('v'), h),
    /changed after verification/,
  );
  manager.close();

  // Evicted sequence frames re-check containment via locate().
  const cache = new SequenceCache({ width: 16, height: 16 }, 1),
    decoded = (
      await decodeImage(readFileSync(join(dir, 'c.png')), {
        width: 16,
        height: 16,
      })
    ).surface,
    key = cache.add(
      join(dir, 'c.png'),
      digest(readFileSync(join(dir, 'c.png'))),
      decoded,
      { width: 16, height: 16, x: 1 },
      () => {
        throw new Error('asset escapes scene directory');
      },
    );
  cache.add(join(dir, 'c.png'), 'other', decoded, {
    width: 16,
    height: 16,
    x: 2,
  });
  assert.throws(() => cache.frame(key), /escapes/);

  // EXR decodes the given bytes even when the path no longer holds them.
  execFileSync(process.env.SCENE_RENDER_PYTHON ?? 'python3', [
    '-c',
    `import OpenEXR,numpy as np,sys
p=np.ones((2,2),dtype='float32')
OpenEXR.File({}, {'R':p*3,'G':p,'B':p,'A':p}).write(sys.argv[1])`,
    join(dir, 'hdr.exr'),
  ]);
  const exr = await decodeImage(
    readFileSync(join(dir, 'hdr.exr')),
    {},
    1,
    join(dir, 'moved.exr'),
  );
  assert.equal(exr.surface.data[0], 3);
});

test('decoded surfaces are bounded before allocation', async () => {
  assert.equal(MAX_IMAGE_BYTES, 1 << 30);
  await assert.rejects(
    decodeImage(png(1, 2, 3), { width: 100000, height: 100000 }),
    /surface limit/,
  );
  const huge = PNG.sync.write({
    width: 1,
    height: 1,
    data: Buffer.from([0, 0, 0, 255]),
  });
  // Patch the IHDR to 9000x9000 (81M pixels): refused from metadata, before decoding.
  huge.writeUInt32BE(9000, 16);
  huge.writeUInt32BE(9000, 20);
  huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29);
  await assert.rejects(
    decodeImage(huge, {}, 1, join(dir, 'huge.png')),
    /pixel limit|surface limit/i,
  );
});

test('the FFmpeg image fallback decodes a private copy of the verified bytes', async () => {
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'color=red:s=4x4:d=1',
    '-frames:v',
    '1',
    join(dir, 'red.bmp'),
  );
  const bytes = readFileSync(join(dir, 'red.bmp')),
    // The path only names the format: nothing is read from it.
    image = await decodeImage(bytes, {}, 1, join(dir, 'elsewhere.bmp'));
  assert.equal(image.metadata.width, 4);
  assert.ok(image.surface.data[0] > 0.9 && image.surface.data[3] === 1);
  ffmpeg('-f', 'lavfi', '-i', 'sine=duration=0.1', join(dir, 'tone.wav'));
  await assert.rejects(
    decodeImage(readFileSync(join(dir, 'tone.wav')), {}, 1, 'tone.wav'),
    /no video stream/,
  );
});

test('resvg premultiplied pixels are unassociated once', () => {
  const s = svgSurface(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ffffff" fill-opacity="0.5"/></svg>',
    2,
    2,
  );
  assert.ok(Math.abs(s.data[3] - 128 / 255) < 1e-6);
  assert.ok(Math.abs(s.data[0] - s.data[3]) < 1e-6);
});

test('USD root is found from a normalized src', async () => {
  writeFileSync(
    join(dir, 'tri.usda'),
    '#usda 1.0\ndef Mesh "Triangle" {\n point3f[] points = [(0,0,0),(1,0,0),(0,1,0)]\n int[] faceVertexCounts = [3]\n int[] faceVertexIndices = [0,1,2]\n}\n',
  );
  const read = [];
  for (const src of ['./tri.usda', 'sub/..//tri.usda']) {
    const imported = await importMesh(
      src,
      readFileSync(join(dir, 'tri.usda')),
      (p) => (read.push(p), readFileSync(join(dir, p))),
      join(dir, 'tri.usda'),
    );
    assert.deepEqual(imported.dependencies, ['tri.usda']);
  }
  assert.deepEqual(read, ['tri.usda', 'tri.usda']);
  let checks = 0;
  await importMesh(
    'tri.usda',
    new Uint8Array(),
    () => new Uint8Array(),
    join(dir, 'tri.usda'),
    undefined,
    () => checks++,
  );
  assert.equal(checks, 2);
});

test('sequence manifest hashes compare case-insensitively', async () => {
  writeFileSync(join(dir, 's1.png'), png(10, 20, 30));
  const files = [
      { src: 's1.png', sha256: digest(readFileSync(join(dir, 's1.png'))) },
    ],
    manifest = digest(new TextEncoder().encode(JSON.stringify(files))),
    scene = load(
      source(
        `<imageSequence id="q" src="s%d.png" first="1" last="1" width="16" height="16" fps="1" sha256="${manifest}"/>`,
      ),
    ),
    withHash = (sha256) => ({
      ...scene,
      children: scene.children.map((n) =>
        n.name === 'assets'
          ? {
              ...n,
              children: n.children.map((c) => ({
                ...c,
                attributes: { ...c.attributes, sha256 },
              })),
            }
          : n,
      ),
    });
  // The schema asks for lowercase; programmatic scenes may carry uppercase.
  (await prepareMedia(withHash(manifest.toUpperCase()), { base: dir })).close();
  await assert.rejects(
    prepareMedia(withHash('0'.repeat(64)), { base: dir }),
    /manifest SHA-256/,
  );
});

function typography(text, extra = {}) {
  const attributes = Object.entries({
    width: 64,
    height: 64,
    size: 20,
    lineHeight: 1.5,
    fontAsset: 'f',
    ...extra,
  })
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const scene = load(
    source(
      `<font id="f" src="font.ttf" family="DejaVu"/><text id="t" text="${text}" ${attributes}/>`,
    ),
  );
  return {
    t: createTypography(scene, (_n, p) => readFileSync(join(dir, p))),
    asset: scene.children.find((n) => n.name === 'assets').children[1],
  };
}
const widthOf = (line) => line.reduce((n, t) => n + t.width, 0);

test('wrapped lines drop trailing whitespace from width, alignment and ellipsis', () => {
  const { t, asset } = typography('aaaa bbbb cccc', {
      align: 'end',
      wrap: 'word',
    }),
    layout = t.layout(asset);
  assert.ok(layout.lines.length > 1);
  for (const line of layout.lines) {
    assert.ok(!/^\s+$/.test(line.at(-1).text));
    assert.ok(Math.abs(line[0].x + widthOf(line) - 64) < 1e-9);
  }
  const hard = typography('ab  &#10;cd');
  assert.equal(
    hard.t
      .layout(hard.asset)
      .lines[0].map((i) => i.text)
      .join(''),
    'ab',
  );
  const e = typography('aaaa bbbb cccc dddd eeee', {
      overflow: 'ellipsis',
      height: 30,
      maxLines: 1,
    }),
    last = e.t.layout(e.asset).lines.at(-1);
  assert.equal(last.at(-1).text, '…');
  assert.ok(!/^\s+$/.test(last.at(-2)?.text ?? 'x'));
});

test('word selectors count words, not whitespace tokens or syllables', () => {
  const { t, asset } = typography('extraordinary  words&#10;here', {
      hyphenate: true,
      language: 'en',
      wrap: 'word',
    }),
    layout = t.layout(asset);
  assert.equal(layout.words, 3);
  const all = layout.lines.flat(),
    first = all
      .filter((i) => i.word === 0)
      .map((i) => i.text)
      .join('');
  assert.match(first.replace(/-/g, ''), /^extraordinary/);
  assert.deepEqual(
    [...new Set(all.filter((i) => !/^\s+$/.test(i.text)).map((i) => i.word))],
    [0, 1, 2],
  );
  const blank = typography(' ');
  assert.equal(blank.t.layout(blank.asset).words, 0);
  assert.ok(blank.t.render(blank.asset, 1).surface);
});

test('letter spacing is measured per rendered glyph (ligatures included)', () => {
  const plain = typography('office', { features: 'liga=1' }),
    spaced = typography('office', { features: 'liga=1', letterSpacing: 10 }),
    w0 = widthOf(plain.t.layout(plain.asset).lines[0]),
    w1 = widthOf(spaced.t.layout(spaced.asset).lines[0]);
  assert.ok(Math.abs(w1 - w0 - 40) < 1e-9, `${w1 - w0}`); // 4 glyphs: o, ffi, c, e
});

/** Crop the inked bounding box of a surface's alpha. */
function ink(surface) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < surface.height; y++)
    for (let x = 0; x < surface.width; x++)
      if (surface.data[(y * surface.width + x) * 4 + 3] > 0.01) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const rows = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      rows.push(
        Math.round(surface.data[(y * surface.width + x) * 4 + 3] * 255),
      );
  return { x0, x1, y0, y1, pixels: rows.join(',') };
}

test('vertical-lr rotates like vertical-rl (no mirrored glyphs) and stacks lines left to right', () => {
  const rl = typography('FL', { writingMode: 'vertical-rl', overflow: 'clip' }),
    lr = typography('FL', { writingMode: 'vertical-lr', overflow: 'clip' }),
    a = ink(rl.t.render(rl.asset, 1).surface),
    b = ink(lr.t.render(lr.asset, 1).surface);
  assert.equal(b.pixels, a.pixels);
  assert.ok(a.x0 > 32 && b.x1 < 32, `${a.x0} ${b.x1}`);
  // Two lines: the first (longer) line is on the left in vertical-lr.
  const two = typography('FFF&#10;F', {
      writingMode: 'vertical-lr',
      overflow: 'clip',
    }),
    s = two.t.render(two.asset, 1).surface,
    lowest = (fromX, toX) => {
      let bottom = -1;
      for (let y = 0; y < s.height; y++)
        for (let x = fromX; x < toX; x++)
          if (s.data[(y * s.width + x) * 4 + 3] > 0.01) bottom = y;
      return bottom;
    };
  assert.ok(lowest(0, 30) > lowest(30, 64) + 10);
});
