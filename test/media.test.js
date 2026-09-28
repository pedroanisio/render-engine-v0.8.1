import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { loadScene, compileRuntime } from '../src/index.js';
import {
  assetPath,
  digest,
  sequencePath,
  sequenceFrames,
  resolveGenerated,
  selectRepresentations,
} from '../src/media/resolve.js';
import { linearize, rgbaSurface } from '../src/media/color.js';
import {
  decodeImage,
  VideoDecoder,
  resizeSurface,
} from '../src/media/decode.js';
import { mediaTime, mediaRemap } from '../src/media/clock.js';
import { prepareMedia } from '../src/media/manager.js';
import {
  generatorSurface,
  chartSurface,
  codeSurface,
  formulaSurface,
  vectorSurface,
  svgSurface,
} from '../src/media/special.js';
import { textStyle, settings, createTypography } from '../src/media/text.js';
import {
  selection,
  textTransform,
  textPathPoint,
} from '../src/media/text-animation.js';
import {
  decodeAudio,
  spectrum,
  audiogramSurface,
  videoAudio,
} from '../src/media/audio.js';
import { FrameRenderer } from '../src/render/frame.js';
import { encodePng } from '../src/render/image.js';
import { renderEpisode } from '../src/render/pipeline.js';
const dir = mkdtempSync(join(tmpdir(), 'scene-media-'));
const source = (assets, composition = '', styles = '') =>
  `<scene version="1.1"><project width="64" height="64" duration="1" fps="4"/>${styles}<output id="o" path="out.mp4" codec="h264" container="mp4" preset="ultrafast"/><assets>${assets}</assets><composition>${composition}</composition></scene>`;
function load(xml) {
  const loaded = loadScene(xml);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return loaded.scene;
}
function png(r, g, b, alpha = 255) {
  return PNG.sync.write({
    width: 16,
    height: 16,
    data: Buffer.from(
      Array.from({ length: 256 }, () => [r, g, b, alpha]).flat(),
    ),
  });
}
const env = {
  paints: new Map(),
  tokens: new Map(),
  attributes: (n) => n.attributes,
  image: () => rgbaSurface(new Uint8Array([255, 0, 0, 255]), 1, 1),
  scale: 1,
};
const hash = (s) => digest(new Uint8Array(s.data.buffer));
before(() => {
  writeFileSync(join(dir, 'a.png'), png(255, 0, 0));
  writeFileSync(join(dir, 'b.png'), png(0, 0, 255));
  writeFileSync(join(dir, 'f01.png'), png(255, 0, 0));
  writeFileSync(join(dir, 'f03.png'), png(0, 0, 255));
  copyFileSync(
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    join(dir, 'font.ttf'),
  );
  for (let i = 0; i < 4; i++)
    writeFileSync(
      join(dir, `v${i}.png`),
      i < 2 ? png(255, 0, 0) : png(0, 0, 255),
    );
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-framerate',
    '4',
    '-i',
    join(dir, 'v%d.png'),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-t',
    '1',
    '-c:v',
    'ffv1',
    '-c:a',
    'pcm_s16le',
    join(dir, 'movie.mkv'),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=1',
    '-c:a',
    'pcm_s16le',
    join(dir, 'audio.wav'),
  ]);
});
after(() => rmSync(dir, { recursive: true, force: true }));
test('asset paths, symlinks and generated providers are frozen and audited', async () => {
  assert.equal(assetPath(dir, 'a.png'), join(dir, 'a.png'));
  for (const p of ['../escape', 'https://example.test/a', '/tmp/a', ''])
    assert.throws(() => assetPath(dir, p, true));
  const outside = mkdtempSync(join(tmpdir(), 'scene-outside-'));
  symlinkSync(outside, join(dir, 'escape'));
  assert.throws(() => assetPath(dir, 'escape/new.bin', true), /escapes/);
  rmSync(outside, { recursive: true });
  assert.throws(() => assetPath(dir, 'missing'), /missing/);
  assert.equal(sequencePath('f%04d.png', -2), 'f-002.png');
  assert.equal(sequencePath('f##.png', 3), 'f03.png');
  assert.throws(() => sequencePath('x.png', 0));
  assert.throws(() => sequenceFrames({ first: 3, last: 1, src: 'f%d.png' }));
  const a = load(
    source(
      `<generated id="g" kind="image" provider="fixture" model="v1" prompt="red" seed="3" cache="generated/a.png" cacheSha256="${'0'.repeat(64)}" width="16" height="16"/>`,
    ),
  );
  let calls = 0;
  const providers = {
    fixture: async (request) => {
      calls++;
      assert.equal(request.seed, '3');
      return png(255, 0, 0);
    },
  };
  const frozen = await resolveGenerated(a, { base: dir, providers });
  await resolveGenerated(frozen, { base: dir, providers });
  assert.equal(calls, 1);
  await assert.rejects(
    resolveGenerated(a, { base: dir, providers: {} }),
    /adapter/,
  );
  await assert.rejects(
    resolveGenerated(a, {
      base: dir,
      providers: { fixture: async () => new Uint8Array() },
    }),
    /no media/,
  );
  const selected = selectRepresentations(frozen);
  const manager = await prepareMedia(selected, { base: dir });
  const runtime = compileRuntime(selected),
    renderer = new FrameRenderer(
      selected,
      runtime.tracks,
      { read: manager.read, media: manager.render },
      1,
      runtime,
    );
  const asset = selected.children.find((n) => n.name === 'assets').children[0];
  assert.equal(manager.render(asset, renderer).data[0], 1);
  manager.close();
  writeFileSync(join(dir, 'generated/a.png'), png(0, 0, 255));
  await assert.rejects(prepareMedia(selected, { base: dir }), /SHA-256/);
});
test('representations select bytes and replace declared dimensions/hash', async () => {
  const a = load(
    source(
      '<image id="a" src="missing.png" proxy="a.png" width="32" height="32"><representation name="small" src="b.png" width="16" height="16"/></image>',
    ),
  );
  const selected = selectRepresentations(a, 'small'),
    manager = await prepareMedia(selected, { base: dir });
  assert.equal(manager.manifest()[0].files[0].src, 'b.png');
  manager.close();
  assert.equal(
    selectRepresentations(a, 'proxy').children.find((n) => n.name === 'assets')
      .children[0].attributes.src,
    'a.png',
  );
});
test('linear premultiplied alpha survives resize and PNG roundtrip without dark fringes', async () => {
  const surface = rgbaSurface(
    new Uint8Array([255, 0, 0, 128, 0, 0, 255, 0]),
    2,
    1,
  );
  const small = resizeSurface(surface, 1, 1);
  assert.ok(Math.abs(small.data[0] - 128 / 510) < 1e-6);
  assert.equal(small.data[2], 0);
  const decoded = PNG.sync.read(Buffer.from(encodePng(small)));
  assert.equal(decoded.data[0], 255);
  assert.equal(decoded.data[3], 64);
  assert.ok(
    Math.abs(
      rgbaSurface(new Uint8Array([128, 0, 0, 128]), 1, 1, {
        alpha: 'premultiplied',
      }).data[0] -
        128 / 255,
    ) < 1e-7,
  );
  assert.equal(
    rgbaSurface(new Uint8Array([0, 0, 0, 0]), 1, 1, { alpha: 'none' }).data[3],
    1,
  );
  assert.equal(linearize(0.5, 'linear'), 0.5);
  for (const transfer of [
    'srgb',
    'gamma22',
    'gamma26',
    'bt1886',
    'pq',
    'hlg',
    'slog3',
    'logc3',
    'logc4',
    'vlog',
    'clog3',
    'redlog3g10',
    'flog2',
    'nlog',
    'acescc',
    'acescct',
  ])
    assert.ok(Number.isFinite(linearize(0.5, transfer)));
  assert.ok(linearize(0.8, 'hlg') > 0.1);
  for (const colorSpace of [
    'display-p3',
    'acescg',
    'aces2065-1',
    'xyz-d65',
    'raw',
    'acescct',
    'rec709',
    'dci-p3',
  ])
    assert.ok(
      rgbaSurface(new Float32Array([0.5, 0.25, 0.1, 0.5]), 1, 1, {
        colorSpace,
      }).data.every(Number.isFinite),
    );
  for (const format of ['png', 'jpeg', 'webp', 'tiff', 'avif']) {
    const bytes = await sharp(png(200, 80, 30))
      .toFormat(format)
      .toBuffer();
    const result = await decodeImage(bytes, { width: 16, height: 16 }, 0.5);
    assert.equal(result.surface.width, 8);
    assert.equal(result.metadata.width, 16);
  }
  await assert.rejects(
    decodeImage(new Uint8Array([1, 2, 3]), { width: 1, height: 1 }),
  );
});
test('video sampling, blend, rotation and source-time policies are random-access', () => {
  const a = { width: 16, height: 16, duration: 1, fps: '4/1' },
    video = new VideoDecoder(join(dir, 'movie.mkv'), a);
  const last = video.frame(0.75, 1),
    first = video.frame(0, 1);
  assert.ok(last.data[2] > 0.9);
  assert.ok(first.data[0] > 0.9);
  assert.equal(hash(video.frame(0.75, 1)), hash(last));
  assert.equal(video.frame(0, 1), first);
  const mix = video.frame(0.375, 1, 'frame-mix');
  assert.ok(mix.data[0] > 0.2 && mix.data[2] > 0.2);
  assert.equal(
    new VideoDecoder(join(dir, 'movie.mkv'), {
      ...a,
      pixelAspect: 2,
      rotation: 90,
    }).frame(0, 1).height,
    32,
  );
  for (const rotation of [180, 270])
    assert.equal(
      new VideoDecoder(join(dir, 'movie.mkv'), { ...a, rotation }).frame(0, 1)
        .width,
      16,
    );
  assert.equal(mediaTime({ speed: 2, timeStretch: 2 }, 0.25, 1), 0.25);
  assert.equal(mediaTime({ reverse: true }, 0.25, 1), 0.75);
  assert.equal(mediaTime({ loop: 2 }, 1.25, 1), 0.25);
  assert.equal(mediaTime({ freezeAt: 0.4 }, 0.2, 1), 0.4);
  assert.equal(mediaTime({}, 0.2, 1, { valueAt: () => 0.8 }), 0.8);
});
test('sequences expand all dependencies and enforce missing-frame policies', async () => {
  for (const policy of ['hold', 'black', 'transparent']) {
    const scene = load(
        source(
          `<imageSequence id="seq" src="f%02d.png" first="1" last="3" width="16" height="16" fps="3" missingFrame="${policy}"/>`,
          '<layer id="l" asset="seq"/>',
        ),
      ),
      runtime = compileRuntime(scene),
      manager = await prepareMedia(scene, { base: dir }),
      host = new FrameRenderer(
        scene,
        runtime.tracks,
        { read: manager.read, media: manager.render },
        1,
        runtime,
      ),
      asset = host.assets.get('seq'),
      layer = host.composition.children[0];
    host.time = 0.4;
    const middle = manager.render(asset, host, layer);
    assert.equal(middle.data[3], policy === 'transparent' ? 0 : 1);
    assert.equal(middle.data[0], policy === 'hold' ? 1 : 0);
    assert.equal(manager.dependencies.get('seq').length, 2);
    host.time = 0.9;
    assert.equal(manager.render(asset, host, layer).data[2], 1);
    manager.close();
  }
  await assert.rejects(
    prepareMedia(
      load(
        source(
          '<imageSequence id="seq" src="f##.png" first="1" last="3" width="16" height="16" fps="3"/>',
        ),
      ),
      { base: dir },
    ),
    /missing sequence/,
  );
  await assert.rejects(
    prepareMedia(
      load(source('<image id="bad" src="a.png" width="32" height="16"/>')),
      { base: dir },
    ),
    /width declared/,
  );
});
test('specialized assets draw deterministic procedural images, codes, vectors, formulas and charts', () => {
  for (const kind of [
    'solid',
    'gradient',
    'noise',
    'fractal-noise',
    'film-grain',
    'checkerboard',
    'stripes',
    'grid',
    'cells',
    'light-rays',
  ]) {
    const a = {
      kind,
      width: 16,
      height: 16,
      paint: '#FF0000',
      paint2: '#0000FF',
      scale: 4,
      angle: 10,
      evolution: 0.25,
      contrast: 1,
      seed: 8n,
      octaves: 3,
    };
    assert.equal(
      hash(generatorSurface(a, 1, env)),
      hash(generatorSurface(a, 1, env)),
    );
  }
  assert.throws(() =>
    generatorSurface(
      { kind: 'invalid', width: 1, height: 1, paint: '#FFF', paint2: '#000' },
      1,
      env,
    ),
  );
  for (const kind of [
    'bar',
    'column',
    'line',
    'area',
    'scatter',
    'pie',
    'donut',
    'counter',
    'progress',
  ]) {
    const chart = chartSurface(
      {
        kind,
        width: 64,
        height: 64,
        progress: 0.5,
        showAxes: true,
        showValues: true,
        labels: 'A,B,C',
        format: '0.00',
      },
      [{ values: [1, 3, 2] }],
      1,
    );
    assert.ok(chart.data.some((v) => v > 0));
  }
  for (const kind of [
    'qr',
    'datamatrix',
    'pdf417',
    'ean13',
    'upc-a',
    'code128',
  ]) {
    const data =
      kind === 'ean13'
        ? '5901234123457'
        : kind === 'upc-a'
          ? '012345678905'
          : 'scene renderer';
    assert.ok(
      codeSurface({ kind, data, width: 64, height: 64 }, 1).data.some(
        (v) => v > 0,
      ),
    );
  }
  assert.ok(
    formulaSurface(
      { tex: 'x^2+\\frac{1}{2}', size: 16, width: 64, height: 32 },
      1,
    ).data.some((v) => v > 0),
  );
  assert.throws(
    () =>
      formulaSurface(
        { tex: '\\badCommand', size: 16, width: 64, height: 32 },
        1,
      ),
    /TeX/,
  );
  assert.ok(
    svgSurface(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
      16,
      8,
    ).data[0] > 0.9,
  );
  assert.throws(() => svgSurface('<svg><script/></svg>', 1, 1), /forbidden/);
  for (const position of ['inside', 'outside', 'center'])
    for (const paintOrder of ['fill-stroke', 'stroke-fill'])
      assert.ok(
        vectorSurface(
          {
            width: 16,
            height: 16,
            shape: 'rect',
            fill: '#FF0000',
            stroke: '#00FF00',
            strokeWidth: 2,
            strokePosition: position,
            paintOrder,
          },
          1,
          env,
        ).data.some((v) => v > 0),
      );
});
test('font cascade preserves explicitly specified defaults and text layout supports RTL and variable fonts', () => {
  const scene = load(
    source(
      '<font id="f" src="font.ttf" family="DejaVu Sans"/><text id="t" text="مرحبا 123 hello" width="64" height="64" size="12" style="derived" fontAsset="f" direction="rtl"/>',
      '',
      '<styles><textStyle id="base" color="#FF0000"/><textStyle id="derived" basedOn="base" lineHeight="1.5"/></styles>',
    ),
  );
  const styles = new Map(
      scene.children
        .find((n) => n.name === 'styles')
        .children.map((n) => [n.attributes.id, n]),
    ),
    asset = scene.children.find((n) => n.name === 'assets').children[1];
  assert.equal(textStyle(asset, styles).color, '#FF0000');
  assert.equal(
    textStyle(
      {
        ...asset,
        specifiedAttributes: [...asset.specifiedAttributes, 'color'],
      },
      styles,
    ).color,
    '#FFFFFFFF',
  );
  assert.deepEqual(settings('wght=700,wdth=80'), { wght: 700, wdth: 80 });
  assert.throws(() => settings('broken'));
  const typography = createTypography(scene, (_n, src) =>
    readFileSync(join(dir, src)),
  );
  const rendered = typography.render(asset, 1);
  assert.ok(rendered.surface.data.some((v) => v > 0));
  assert.equal(rendered.layout.root.lineHeight, 1.5);
  for (const autoFit of ['none', 'shrink', 'grow', 'fit'])
    for (const wrap of ['word', 'character', 'none', 'balance']) {
      const n = {
        ...asset,
        attributes: {
          ...asset.attributes,
          text: 'A long title with multiple words',
          autoFit,
          wrap,
          maxLines: 2,
          overflow: 'ellipsis',
          background: '#000000',
          backgroundMode: 'line',
          highlight: '#FFFF00',
          decoration: 'underline',
          strokeColor: '#00FF00',
          strokeWidth: 0.4,
          tracking: 20,
        },
        specifiedAttributes: undefined,
      };
      assert.ok(typography.render(n, 1).surface.data.every(Number.isFinite));
    }
});
test('text selectors, presets and paths are deterministic at arbitrary times', () => {
  const unit = {
    index: 1,
    count: 4,
    word: 1,
    words: 3,
    line: 0,
    lines: 2,
    span: 0,
    spans: 2,
    role: 'em',
    text: 'x',
    size: 20,
  };
  for (const order of [
    'forward',
    'reverse',
    'center-out',
    'edges-in',
    'random',
  ])
    for (const shape of [
      'square',
      'ramp-up',
      'ramp-down',
      'triangle',
      'round',
      'smooth',
    ])
      assert.ok(Number.isFinite(selection({ order, shape }, unit, 0.5).amount));
  for (const selector of ['range', 'wiggly', 'expression'])
    for (const unitName of [
      'character',
      'word',
      'line',
      'span',
      'character-no-space',
    ])
      assert.ok(
        Number.isFinite(
          selection(
            { selector, unit: unitName, rangeUnits: 'index', end: 4 },
            unit,
            0.5,
            50,
          ).amount,
        ),
      );
  assert.equal(selection({ span: 'other' }, unit, 0).amount, 0);
  assert.notDeepEqual(
    textTransform({ preset: 'karaoke' }, unit, 0.5),
    textTransform({ preset: 'highlight' }, unit, 0.5),
  );
  assert.equal(
    selection({ unit: 'character-no-space' }, { ...unit, text: ' ' }, 0).amount,
    0,
  );
  for (const preset of [
    'typewriter',
    'fade-in',
    'fade-out',
    'word-by-word',
    'letter-by-letter',
    'line-by-line',
    'slide-up',
    'slide-down',
    'slide-left',
    'slide-right',
    'pop',
    'scale-in',
    'blur-in',
    'wave',
    'bounce',
    'spin',
    'ascend',
    'shift',
    'scramble',
    'counter',
    'karaoke',
    'highlight',
    'tracking-in',
    'mask-reveal',
  ]) {
    const a = {
      preset,
      seed: 5,
      rotationX: 10,
      rotationY: 20,
      fill: '#FF0000',
      stroke: '#00FF00',
      strokeWidth: 2,
      variation: 'wght=700',
    };
    assert.deepEqual(textTransform(a, unit, 0.5), textTransform(a, unit, 0.5));
  }
  const p = textPathPoint(
    { path: 'M0 0 L100 0', startOffset: '10%' },
    20,
    10,
    40,
  );
  assert.equal(p.x, 35);
  assert.equal(
    textPathPoint(
      {
        path: 'M0 0 L100 0',
        reverse: true,
        perpendicular: false,
        forceAlignment: true,
      },
      20,
      0,
      40,
    ).x,
    50,
  );
});
test('audio spectrum and audiograms are seek invariant; embedded video audio is placed on its bus', () => {
  const pcm = decodeAudio(join(dir, 'audio.wav'));
  assert.equal(pcm.length, 48000);
  const input = Float64Array.from({ length: 1024 }, (_, i) =>
    Math.sin((2 * Math.PI * 32 * i) / 1024),
  );
  assert.ok(spectrum(input)[32] > 0.99);
  for (const style of ['bars', 'line', 'wave', 'circle', 'spectrum']) {
    const a = {
      width: 64,
      height: 32,
      color: '#FFFFFF',
      style,
      bars: 16,
      smoothing: 0.5,
    };
    assert.equal(
      hash(audiogramSurface(pcm, a, 0.5, 1)),
      hash(audiogramSurface(pcm, a, 0.5, 1)),
    );
  }
  const scene = load(
      source(
        '<video id="v" src="movie.mkv" width="16" height="16" fps="4" duration="1" hasAudio="true"/>',
        '<layer id="l" asset="v" start="0.25" reverse="true" volume="0.5"/>',
      ),
    ),
    runtime = compileRuntime(scene),
    baked = videoAudio(scene, runtime, dir, join(dir, 'baked'));
  assert.equal(baked.paths.size, 1);
  const raw = readFileSync([...baked.paths.values()][0]);
  assert.equal(raw.readFloatLE(44 + 100 * 8), 0);
  assert.ok(Math.abs(raw.readFloatLE(44 + 18001 * 8)) > 0);
});
test('media integration renders full video, reuses fixed bytes and writes provenance', async () => {
  const xml = source(
    '<video id="v" src="movie.mkv" width="16" height="16" fps="4" duration="1" hasAudio="true" credit="fixture"/><generator id="g" kind="checkerboard" width="64" height="64" scale="8"/>',
    '<layer id="background" asset="g"/><layer id="l" asset="v" x="8" y="8"/>',
  );
  writeFileSync(join(dir, 'scene.xml'), xml);
  const first = await renderEpisode({ sceneFile: join(dir, 'scene.xml') });
  assert.equal(first.rendered, 1);
  const second = await renderEpisode({ sceneFile: join(dir, 'scene.xml') });
  assert.equal(second.cached, 1);
  assert.equal(
    JSON.parse(readFileSync(first.video + '.assets.json', 'utf8')).assets[0]
      .credit,
    'fixture',
  );
});

test('Lottie JSON, dotLottie, segments and slots use the offline player', async () => {
  const { loadLottie } = await import('../src/media/lottie.js');
  const { zipSync, strToU8 } = await import('fflate');
  const json = {
    v: '5.7.4',
    fr: 10,
    ip: 0,
    op: 10,
    w: 16,
    h: 16,
    nm: 'fixture',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 1,
        nm: 'solid',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [0, 0, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        sw: 16,
        sh: 16,
        sc: '#ff0000',
        ip: 0,
        op: 10,
        st: 0,
        bm: 0,
      },
    ],
    markers: [{ tm: 2, cm: 'middle', dr: 3 }],
  };
  const bytes = strToU8(JSON.stringify(json));
  writeFileSync(join(dir, 'anim.json'), bytes);
  const player = await loadLottie(
    bytes,
    { width: 16, height: 16, segment: '2,4' },
    () => {
      throw new Error('unexpected dependency');
    },
  );
  assert.equal(player.duration, 0.3);
  assert.ok(player.frame(0).data[0] > 0.9);
  assert.equal(hash(player.frame(0.2)), hash(player.frame(0)));
  player.close();
  const packed = zipSync({
    'manifest.json': strToU8(
      JSON.stringify({ version: '1.0', animations: [{ id: 'red' }] }),
    ),
    'animations/red.json': bytes,
  });
  writeFileSync(join(dir, 'anim.lottie'), packed);
  const zipped = await loadLottie(
    packed,
    { width: 16, height: 16, animation: 'red', segment: 'middle' },
    () => new Uint8Array(),
  );
  assert.ok(zipped.frame(0, {}).data.some((v) => v > 0));
  zipped.close();
  const scene = load(
      source(
        '<lottie id="animation" src="anim.json" width="16" height="16"><slot id="unused" value="0"/></lottie>',
        '<layer id="l" asset="animation"/>',
      ),
    ),
    media = await prepareMedia(scene, { base: dir }),
    runtime = compileRuntime(scene),
    host = new FrameRenderer(
      scene,
      runtime.tracks,
      { read: media.read, media: media.render },
      1,
      runtime,
    );
  assert.ok(host.render(0.2).data[0] > 0.9);
  media.close();
});
test('mesh import accepts OBJ/MTL, PLY, glTF/GLB, splats and USD packages', async () => {
  const { importMesh } = await import('../src/media/mesh.js');
  const { zipSync, strToU8 } = await import('fflate');
  const obj =
    'mtllib tri.mtl\no triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\n';
  writeFileSync(join(dir, 'tri.obj'), obj);
  writeFileSync(join(dir, 'tri.mtl'), 'newmtl red\nKd 1 0 0\nmap_Kd a.png\n');
  const deps = [];
  const mesh = await importMesh('tri.obj', Buffer.from(obj), (p) => {
    deps.push(p);
    return readFileSync(join(dir, p));
  });
  assert.equal(mesh.meshes.length, 1);
  assert.ok(deps.includes('a.png'));
  const ply =
    'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n';
  assert.equal(
    (await importMesh('tri.ply', Buffer.from(ply), () => new Uint8Array()))
      .meshes.length,
    1,
  );
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) =>
    positions.writeFloatLE(v, i * 4),
  );
  writeFileSync(join(dir, 'tri.bin'), positions);
  const gltf = {
    asset: { version: '2.0' },
    buffers: [{ uri: 'tri.bin', byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  assert.equal(
    (
      await importMesh('tri.gltf', Buffer.from(JSON.stringify(gltf)), (p) =>
        readFileSync(join(dir, p)),
      )
    ).meshes.length,
    1,
  );
  const inline = { ...gltf, buffers: [{ byteLength: 36 }] },
    json = Buffer.from(
      JSON.stringify(inline).padEnd(
        Math.ceil(JSON.stringify(inline).length / 4) * 4,
        ' ',
      ),
    ),
    glb = Buffer.alloc(12 + 8 + json.length + 8 + positions.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.write('JSON', 16);
  json.copy(glb, 20);
  glb.writeUInt32LE(positions.length, 20 + json.length);
  glb.write('BIN\0', 24 + json.length);
  positions.copy(glb, 28 + json.length);
  assert.equal(
    (await importMesh('tri.glb', glb, () => new Uint8Array())).meshes.length,
    1,
  );
  const splat = Buffer.alloc(32);
  splat.writeFloatLE(1, 0);
  assert.equal(
    (await importMesh('p.splat', splat, () => new Uint8Array())).points[0]
      .position[0],
    1,
  );
  await assert.rejects(
    importMesh('p.splat', new Uint8Array(1), () => new Uint8Array()),
    /truncated/,
  );
  const usd =
    '#usda 1.0\ndef Mesh "Triangle" {\n point3f[] points = [(0,0,0),(1,0,0),(0,1,0)]\n int[] faceVertexCounts = [3]\n int[] faceVertexIndices = [0,1,2]\n}\n';
  writeFileSync(join(dir, 'tri.usda'), usd);
  assert.equal(
    (
      await importMesh(
        'tri.usda',
        Buffer.from(usd),
        (p) => readFileSync(join(dir, p)),
        join(dir, 'tri.usda'),
      )
    ).meshes.length,
    1,
  );
  writeFileSync(
    join(dir, 'tri.usdz'),
    zipSync({ 'tri.usda': strToU8(usd) }, { level: 0 }),
  );
  assert.equal(
    (
      await importMesh(
        'tri.usdz',
        readFileSync(join(dir, 'tri.usdz')),
        (p) => readFileSync(join(dir, p)),
        join(dir, 'tri.usdz'),
      )
    ).meshes.length,
    1,
  );
  const manager = await prepareMedia(
    load(source('<mesh id="m" src="tri.obj"/>')),
    { base: dir },
  );
  assert.equal(manager.meshes.get('m').meshes.length, 1);
  manager.close();
  await assert.rejects(
    importMesh('wrong.obj', new Uint8Array([1, 2]), () => new Uint8Array()),
    /failed/,
  );
});
test('variable font axis changes pixels; per-glyph animation, selectors and paths reach the compositor', async () => {
  copyFileSync(
    new URL(
      '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
      import.meta.url,
    ),
    join(dir, 'variable.woff2'),
  );
  const text =
      '<font id="varfont" src="variable.woff2" family="Inter"/><text id="t" text="Wave" width="64" height="48" size="20" fontAsset="varfont" variation="wght=300" features="kern=1,liga=1"/>',
    scene = load(
      source(
        text,
        '<layer id="l" asset="t"><textAnimator preset="fade-in" selector="expression" presetDuration="0.5" stagger="0"><expression property="selector">textIndex &lt; textTotal ? 100 : 0</expression></textAnimator><textPath path="M2 26 L60 26"/></layer>',
      ),
    );
  const typography = createTypography(scene, (_n, p) =>
      readFileSync(join(dir, p)),
    ),
    asset = scene.children.find((n) => n.name === 'assets').children[1];
  assert.notEqual(
    hash(typography.render(asset, 1).surface),
    hash(typography.render(asset, 1, { variation: 'wght=900' }).surface),
  );
  const runtime = compileRuntime(scene),
    manager = await prepareMedia(runtime.scene, { base: dir }),
    host = new FrameRenderer(
      runtime.scene,
      runtime.tracks,
      { read: manager.read, media: manager.render },
      1,
      runtime,
    );
  const dark = hash(host.render(0)),
    full = hash(host.render(0.75));
  assert.notEqual(dark, full);
  assert.equal(hash(host.render(0.75)), full);
  assert.equal(hash(host.render(0)), dark);
  manager.close();
  for (const direction of ['ltr', 'rtl', 'auto'])
    for (const writingMode of ['horizontal-tb', 'vertical-rl', 'vertical-lr']) {
      const n = {
        ...asset,
        attributes: {
          ...asset.attributes,
          text: 'A B',
          direction,
          writingMode,
          hyphenate: true,
          language: 'pt',
          textTransform: 'uppercase',
          overflow: 'clip',
        },
      };
      assert.ok(typography.render(n, 1).surface.data.some((v) => v > 0));
    }
});

test('high precision EXR, image orientation and layered images retain their declared semantics', async () => {
  execFileSync('python3', [
    '-c',
    `import OpenEXR,numpy as np,sys
p=np.ones((4,4),dtype='float32')
OpenEXR.File({}, {'R':p*2,'G':p*.25,'B':p*.125,'A':p*.5}).write(sys.argv[1])`,
    join(dir, 'hdr.exr'),
  ]);
  const exr = await decodeImage(
    readFileSync(join(dir, 'hdr.exr')),
    { width: 4, height: 4, colorSpace: 'linear-srgb' },
    1,
    join(dir, 'hdr.exr'),
  );
  assert.equal(exr.surface.data[0], 2);
  assert.equal(exr.surface.data[3], 0.5);
  const part = await decodeImage(
    readFileSync(join(dir, 'hdr.exr')),
    { width: 4, height: 4, layer: '0', alpha: 'straight' },
    1,
    join(dir, 'hdr.exr'),
  );
  assert.equal(part.surface.data[0], 1);
  const rotated = await sharp({
    create: { width: 8, height: 4, channels: 3, background: 'red' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const oriented = await decodeImage(rotated, { width: 4, height: 8 });
  assert.equal(oriented.metadata.width, 4);
  assert.equal(oriented.metadata.height, 8);
  execFileSync('convert', [
    join(dir, 'a.png'),
    join(dir, 'b.png'),
    join(dir, 'layers.psd'),
  ]);
  const layer = await decodeImage(
    readFileSync(join(dir, 'layers.psd')),
    { width: 16, height: 16, layer: '1' },
    1,
    join(dir, 'layers.psd'),
  );
  assert.equal(layer.surface.width, 16);
  await assert.rejects(
    decodeImage(
      readFileSync(join(dir, 'layers.psd')),
      { width: 16, height: 16, layer: 'missing' },
      1,
      join(dir, 'layers.psd'),
    ),
    /missing image layer/,
  );
});
test('evicted image/sequence frames decode identically and detect changed sources', async () => {
  const { SequenceCache } = await import('../src/media/sequence.js');
  const a = { width: 16, height: 16 },
    first = (await decodeImage(readFileSync(join(dir, 'a.png')), a)).surface,
    second = (await decodeImage(readFileSync(join(dir, 'b.png')), a)).surface,
    cache = new SequenceCache(a, first.data.byteLength);
  const one = cache.add(
      join(dir, 'a.png'),
      digest(readFileSync(join(dir, 'a.png'))),
      first,
    ),
    two = cache.add(
      join(dir, 'b.png'),
      digest(readFileSync(join(dir, 'b.png'))),
      second,
    );
  assert.equal(hash(cache.frame(one)), hash(first));
  assert.equal(hash(cache.frame(two)), hash(second));
  assert.equal(cache.frames.size, 1);
  assert.throws(() => cache.frame('missing'), /unknown/);
  copyFileSync(join(dir, 'a.png'), join(dir, 'mutable.png'));
  cache.add(
    join(dir, 'mutable.png'),
    digest(readFileSync(join(dir, 'mutable.png'))),
    first,
  );
  cache.frame(two);
  writeFileSync(join(dir, 'mutable.png'), png(0, 255, 0));
  assert.throws(() => cache.frame(join(dir, 'mutable.png')), /changed/);
});
test('optical flow and timeRemap use source seconds, independent of frame request order', () => {
  const decoder = new VideoDecoder(join(dir, 'movie.mkv'), {
    width: 16,
    height: 16,
    duration: 1,
    fps: '4',
  });
  const blended = decoder.frame(0.375, 1, 'optical-flow');
  assert.ok(blended.data.every(Number.isFinite));
  assert.equal(hash(blended), hash(decoder.frame(0.375, 1, 'optical-flow')));
  const scene = load(
    source(
      '<video id="v" src="movie.mkv" width="16" height="16" fps="4" duration="1"/>',
      '<layer id="l" asset="v"><timeRemap frameBlend="frame-mix"><key time="0" value="0.75"/><key time="1" value="0"/></timeRemap></layer>',
    ),
  );
  const track = mediaRemap(
    scene,
    scene.children.find((n) => n.name === 'composition').children[0],
  );
  assert.equal(mediaTime({}, 0, 1, track), 0.75);
  assert.equal(mediaTime({}, 1, 1, track), 0);
});
test('SVG dependencies are contained, painted text uses gradients, and transparent codes export alpha', async () => {
  const { inlineSvg } = await import('../src/media/svg.js');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><image href="a.png" width="16" height="16"/></svg>';
  writeFileSync(join(dir, 'linked.svg'), svg);
  assert.match(
    inlineSvg(svg, 'linked.svg', (p) => readFileSync(assetPath(dir, p))),
    /data:image\/png;base64/,
  );
  assert.throws(
    () =>
      inlineSvg(svg.replace('a.png', '../outside.png'), 'linked.svg', (p) =>
        readFileSync(assetPath(dir, p)),
      ),
    /escapes/,
  );
  const code = codeSurface(
    {
      kind: 'qr',
      data: 'transparent',
      width: 64,
      height: 64,
      foreground: '#FF000080',
      background: '#00000000',
    },
    1,
  );
  assert.ok(code.data.some((v, i) => i % 4 === 3 && v === 0));
  assert.ok(code.data.some((v, i) => i % 4 === 3 && v > 0.49 && v < 0.51));
  const xml = source(
    '<font id="f" src="font.ttf" family="DejaVu"/><text id="t" text="ABC" width="64" height="40" size="24" fontAsset="f" color="url(#gradient)"/>',
    '<layer id="l" asset="t"/>',
  ).replace(
    '</assets>',
    '</assets><paints><linearGradient id="gradient" units="user" x1="0" y1="0" x2="64" y2="0"><stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/></linearGradient></paints>',
  );
  const runtime = compileRuntime(load(xml)),
    media = await prepareMedia(runtime.scene, { base: dir }),
    host = new FrameRenderer(
      runtime.scene,
      runtime.tracks,
      { read: media.read, media: media.render },
      1,
      runtime,
    ),
    pixels = host.render(0).data;
  assert.ok(pixels.some((v, i) => i % 4 === 0 && v > 0.1));
  assert.ok(pixels.some((v, i) => i % 4 === 2 && v > 0.1));
  media.close();
});

test('FBX geometry is imported through Assimp', async () => {
  const { importMesh } = await import('../src/media/mesh.js');
  const fbx = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
 FBXHeaderVersion: 1003
 FBXVersion: 7400
}
Definitions:  {
 Version: 100
 Count: 2
 ObjectType: "Geometry" { Count: 1 }
 ObjectType: "Model" { Count: 1 }
}
Objects:  {
 Geometry: 100, "Geometry::Triangle", "Mesh" {
  Vertices: *9 { a: 0,0,0,1,0,0,0,1,0 }
  PolygonVertexIndex: *3 { a: 0,1,-3 }
  GeometryVersion: 124
 }
 Model: 200, "Model::Triangle", "Mesh" { Version: 232 }
}
Connections:  {
 C: "OO",100,200
 C: "OO",200,0
}
`;
  const mesh = await importMesh(
    'triangle.fbx',
    Buffer.from(fbx),
    () => new Uint8Array(),
  );
  assert.equal(mesh.meshes.length, 1);
  assert.equal(mesh.meshes[0].vertices.length, 9);
});

test('colour emoji and WOFF containers render with the declared font', () => {
  copyFileSync(
    new URL(
      '../node_modules/@fontsource/noto-color-emoji/files/noto-color-emoji-9-400-normal.woff',
      import.meta.url,
    ),
    join(dir, 'emoji.woff'),
  );
  const scene = load(
    source(
      '<font id="emoji" src="emoji.woff" family="Fixture Emoji"/><text id="face" text="😀" width="48" height="48" size="36" fontAsset="emoji" emoji="color"/>',
    ),
  );
  const typography = createTypography(scene, (_n, p) =>
      readFileSync(join(dir, p)),
    ),
    asset = scene.children.find((n) => n.name === 'assets').children[1],
    surface = typography.render(asset, 1).surface;
  assert.ok(
    surface.data.some(
      (v, i) =>
        i % 4 === 0 && v > 0.2 && Math.abs(v - surface.data[i + 2]) > 0.1,
    ),
  );
});

test('explicit tracks preserve a selected mono video stream on both output channels', async () => {
  const xml = source(
    '<video id="v" src="movie.mkv" width="16" height="16" fps="4" duration="1"/>',
    '<layer id="l" asset="v"/>',
  ).replace(
    '</scene>',
    '<audioMix><audioTrack id="track" asset="v"/></audioMix></scene>',
  );
  writeFileSync(join(dir, 'mono.xml'), xml);
  const rendered = await renderEpisode({
      sceneFile: join(dir, 'mono.xml'),
      work: join(dir, 'mono-work'),
    }),
    pcm = decodeAudio(rendered.video, 0, 2);
  let left = 0,
    right = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    left += pcm[i] ** 2;
    right += pcm[i + 1] ** 2;
  }
  assert.ok(left > 0);
  assert.ok(right / left > 0.95 && right / left < 1.05);
});

test('audio stream timestamp offsets remain synchronized with video source time', () => {
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    join(dir, 'movie.mkv'),
    '-itsoffset',
    '0.25',
    '-i',
    join(dir, 'audio.wav'),
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c',
    'copy',
    join(dir, 'delayed.mkv'),
  ]);
  const pcm = decodeAudio(join(dir, 'delayed.mkv'));
  assert.ok(pcm.subarray(0, 11000).every((v) => v === 0));
  assert.ok(pcm.subarray(13000, 18000).some((v) => Math.abs(v) > 0.01));
});
