import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareScene, loadScene, compileRuntime, capabilities } from '../src/index.js';
import { FrameRenderer } from '../src/render/frame.js';
import { Compositor } from '../src/render/compositor.js';
import { Surface } from '../src/render/surface.js';
import { encodePng } from '../src/render/image.js';
import { blendColor, composite } from '../src/render/geometry/blend.js';
import {
  shapePath,
  trimPath,
  modify,
  strokePath,
  modifyPaths,
  trimPaths,
} from '../src/render/geometry/path.js';
import { paint, colorMix } from '../src/render/geometry/paint.js';
import { layout, align, safeArea } from '../src/render/geometry/layout.js';
import {
  length,
  transform,
  inverse,
  point,
  multiply,
  IDENTITY,
} from '../src/render/geometry/matrix.js';
import { MODEL } from '../src/generated/model.js';
const close = (a, b, e = 0.015) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const px = (s, x, y) =>
  Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));
const alpha = (s) => s.data.reduce((sum, v, i) => sum + (i % 4 === 3 ? v : 0), 0);
const rect = (id, attrs = '', children = '') =>
  `<shape id="${id}" shape="rect" width="8" height="8" ${attrs}>${children}</shape>`;
const xml = (body, sections = '', project = '', w = 32, h = 32) =>
  `<scene version="1.1"><project width="${w}" height="${h}" duration="4" fps="4" background="#00000000" ${project}/>${sections}<composition>${body}</composition></scene>`;
function render(
  body,
  {
    sections = '',
    project = '',
    w = 32,
    h = 32,
    scale = 1,
    t = 0,
    files = {},
    ...options
  } = {},
) {
  const source = xml(body, sections, project, w, h),
    p = prepareScene(source, { read: (p) => files[p], ...options });
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const runtime = p.runtime;
  const renderer = new FrameRenderer(
    runtime.scene,
    runtime.tracks,
    { read: (p) => files[p] },
    scale,
    runtime,
  );
  return { surface: renderer.render(t), renderer, runtime, source };
}
const noFiles = { read: () => new Uint8Array() };
test('affine inverse, units and anchor contracts (x/y place the anchor)', () => {
  for (const [u, n] of [
    ['50%', 10],
    ['10vw', 10],
    ['10vh', 5],
    ['10vmin', 5],
    ['10vmax', 10],
  ])
    close(length(u, 20, 100, 50), n);
  assert.equal(length(4, 1, 1, 1), 4);
  assert.throws(() => length('bad', 1, 1, 1));
  assert.equal(inverse([0, 0, 0, 0, 0, 0]), null);
  const m = transform(
    {
      x: 6,
      y: 5,
      anchorX: 2,
      anchorY: 3,
      rotation: 90,
      scaleX: -2,
      scaleY: 3,
      skewX: 10,
      skewY: 5,
    },
    10,
    10,
    32,
    32,
  );
  const p = point(m, 2, 3);
  close(p.x, 6);
  close(p.y, 5);
  const original = point(inverse(m), p.x, p.y);
  close(original.x, 2);
  close(original.y, 3);
  multiply(IDENTITY, m).forEach((v, i) => close(v, m[i]));
});
test('nested pivots, negative scale, skew, explicit parent and offscreen source', () => {
  const { surface } = render(
    `<group id="g" x="20" scaleX="-2" scaleY="2"><group id="h" x="2">${rect('s', 'fill="#FF0000"')}</group></group>`,
  );
  assert.deepEqual(px(surface, 2, 2), [1, 0, 0, 1]);
  assert.equal(px(surface, 20, 2)[3], 0);
  const a = render(
    `<group id="g" x="30" rotation="90">${rect('s', 'x="-8" y="0" fill="#FF0000"')}</group>`,
  ).surface;
  assert.equal(px(a, 26, 0)[3], 0); // the rotated source is above the viewport
  const b = render(
    `<group id="parent" x="4"/><group id="g" parent="parent" x="4">${rect('s', 'x="4" skewX="10" fill="#FFFFFF"')}</group>`,
  ).surface;
  assert.equal(px(b, 14, 2)[3], 1);
  const off = render(
    `<group id="g" x="-100">${rect('s', 'x="108" rotation="90" anchorX="4" anchorY="4"')}</group>`,
  ).surface;
  assert.equal(px(off, 10, 2)[3], 1);
  const collapsed = render(
    `<group id="g" collapse="true" isolate="true">${rect('s')}</group>`,
  ).surface;
  assert.equal(px(collapsed, 2, 2)[3], 1);
});
test('transformed clipping and zero scale', () => {
  const { surface } = render(
    `<group id="g" x="16" y="8" width="8" height="8" rotation="90" clip="true"><shape id="s" shape="rect" x="-4" y="-4" width="16" height="16"/></group>${rect('zero', 'scaleX="0" fill="#FF0000"')}`,
  );
  assert.equal(px(surface, 10, 10)[3], 1);
  assert.equal(px(surface, 6, 10)[3], 0);
  assert.equal(px(surface, 18, 10)[3], 0);
});
test('animated transforms and percent lengths affect actual pixels at multiple resolutions', () => {
  const body = `<group id="g" x="25%"><animate property="rotation"><key time="0" value="0"/><key time="1" value="90"/></animate>${rect('s', 'width="8"'.replace('width="8"', ''))}</group>`;
  const x = render(body).surface,
    y = render(body, { scale: 2 }).surface;
  assert.deepEqual(px(x, 10, 2), px(y, 20, 4));
  const anim = render(
    rect(
      's',
      '',
      `<animate property="x"><key time="0" value="0%"/><key time="2" value="50%"/></animate>`,
    ),
    { t: 1 },
  ).surface;
  assert.equal(px(anim, 10, 2)[3], 1);
  assert.equal(px(anim, 2, 2)[3], 0);
  const rotated = render(body, { t: 1 }).surface;
  assert.equal(px(rotated, 2, 2)[3], 1);
});
const shapes = ['rect', 'rounded-rect', 'ellipse', 'polygon', 'star', 'line', 'path'];
for (const shape of shapes)
  test(`pixel fixture: ${shape}`, () => {
    const extra =
      shape === 'path'
        ? 'path="M0 0H16V16H0Z"'
        : shape === 'rounded-rect'
          ? 'cornerRadii="2 4 6 8"'
          : shape === 'star'
            ? 'points="5" innerRadius="4" outerRadius="8" innerRoundness="0.2" outerRoundness="0.3"'
            : '';
    const { surface } = render(
      `<shape id="s" shape="${shape}" x="8" y="8" width="16" height="16" fill="#FF0000" stroke="#00FF00" strokeWidth="1" ${extra}/>`,
    );
    assert.ok(alpha(surface) > 5);
    assert.equal(px(surface, 0, 0)[3], 0);
    if (shape !== 'line') assert.ok(px(surface, 16, 16)[3] > 0.9);
  });
test('fill rules, stroke placement, caps, joins, dashes and paint order', () => {
  const base = 'path="M4 4H28V28H4Z M10 10H22V22H10Z"';
  const even = render(
    `<shape id="s" shape="path" width="32" height="32" ${base} fillRule="evenodd"/>`,
  ).surface;
  const non = render(
    `<shape id="s" shape="path" width="32" height="32" ${base} fillRule="nonzero"/>`,
  ).surface;
  assert.equal(px(even, 16, 16)[3], 0);
  assert.equal(px(non, 16, 16)[3], 1);
  for (const strokePosition of ['center', 'inside', 'outside'])
    for (const strokeCap of ['butt', 'round', 'square'])
      for (const strokeJoin of ['miter', 'round', 'bevel']) {
        const { surface } = render(
          rect(
            's',
            `x="8" y="8" fill="#FF0000" stroke="#0000FF" strokeWidth="4" strokePosition="${strokePosition}" strokeCap="${strokeCap}" strokeJoin="${strokeJoin}" dash="2 1" dashOffset="1" paintOrder="stroke-fill"`,
          ),
        );
        assert.deepEqual(px(surface, 12, 12), [1, 0, 0, 1]);
        assert.equal(px(surface, 0, 0)[3], 0);
      }
  const outside = render(
    rect(
      's',
      'x="8" y="8" fill="#FF0000" stroke="#0000FF" strokeWidth="2" strokePosition="outside"',
    ),
  ).surface;
  assert.equal(px(outside, 7, 12)[2], 1);
  assert.equal(px(outside, 9, 12)[0], 1);
});
for (const type of [
  'repeater',
  'offset-path',
  'pucker-bloat',
  'zig-zag',
  'twist',
  'round-corners',
  'wiggle-path',
  'merge',
  'trim',
])
  test(`modifier fixture: ${type}`, () => {
    const extra =
      type === 'repeater'
        ? 'copies="2.5" offsetX="5" startOpacity="1" endOpacity="0.5" composite="below"'
        : type === 'merge'
          ? 'mode="exclude"'
          : type === 'trim'
            ? 'amount="70" offset="10"'
            : 'amount="30" size="2"';
    const body = rect(
      's',
      'x="8" y="8" stroke="#00FF00" strokeWidth="1"',
      `<shapeModifier type="${type}" ${extra}/>`,
    );
    const a = render(body, { t: 0.2 }).surface,
      b = render(body, { t: 0.2 }).surface;
    assert.ok(alpha(a) > 0);
    assert.deepEqual(a.data, b.data);
  });
test('trim modes, wrapped offset and path operators have geometric effects', () => {
  const p = shapePath({ shape: 'path', path: 'M0 0L10 0 M0 10L30 10' }, 1, 1);
  assert.ok(
    trimPath(p, { trimStart: 0, trimEnd: 0.5, trimMode: 'individual' })
      .toSVGString()
      .includes('5'),
  );
  assert.equal(trimPath(p, { trimStart: 0.5, trimEnd: 0.5 }).toSVGString(), '');
  assert.ok(
    trimPath(p, {
      trimStart: 0.2,
      trimEnd: 0.8,
      trimOffset: 180,
    }).toSVGString(),
  );
  const square = shapePath({ shape: 'rect' }, 10, 10);
  for (const mode of ['add', 'subtract', 'intersect', 'exclude'])
    assert.ok(modify(p, { type: 'merge', mode }, 0)[0]);
  for (const amount of [-2, 0, 2]) {
    const q = modify(square, { type: 'offset-path', amount, mode: 'miter' }, 0)[0].path;
    const b = q.getBounds();
    close(b[0], -amount);
  }
  for (const mode of ['corner', 'smooth'])
    assert.ok(modify(square, { type: 'zig-zag', mode, size: 2 }, 0)[0].path.toSVGString());
  for (const strokePosition of ['center', 'inside', 'outside'])
    assert.ok(
      strokePath(square, {
        strokeWidth: 2,
        strokePosition,
        strokeCap: 'square',
        strokeJoin: 'bevel',
      }).toSVGString(),
    );
  assert.throws(() => shapePath({ shape: 'unknown' }, 1, 1));
  assert.throws(() => modify(square, { type: 'unknown' }, 0));
});
const blends =
  'normal dissolve add plus-lighter multiply screen overlay difference exclusion subtract divide darken lighten darker-color lighter-color color-dodge color-burn linear-dodge linear-burn soft-light hard-light linear-light vivid-light pin-light hard-mix hue saturation color luminosity stencil-alpha stencil-luma silhouette-alpha silhouette-luma alpha-add behind'.split(
    ' ',
  );
for (const mode of blends)
  test(`blend fixture: ${mode}`, () => {
    const { surface } = render(
      `${rect('base', 'fill="#80402080"')}${rect('top', `fill="#4080C080" blend="${mode}"`)}`,
    );
    for (const v of px(surface, 4, 4)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
    assert.equal(px(surface, 20, 20)[3], 0);
    for (const b of [
      [0, 0, 0],
      [1, 1, 1],
      [0.1, 0.5, 0.9],
      [0.9, 0.1, 0.6],
    ])
      for (const s of [
        [0, 0, 0],
        [1, 1, 1],
        [0.2, 0.7, 0.4],
      ])
        for (const v of blendColor(b, s, mode)) assert.ok(Number.isFinite(v));
  });
test('linear-light blend reference values and isolated group backdrop', () => {
  const a = new Surface(1, 1),
    b = new Surface(1, 1);
  a.data.set([0.2, 0.4, 0.6, 1]);
  b.data.set([0.5, 0.25, 0.75, 1]);
  composite(a, b, 'multiply');
  [0.1, 0.1, 0.45, 1].forEach((v, i) => close(a.data[i], v));
  const pass = render(
    `${rect('b', 'fill="#FF0000"')}<group id="g">${rect('s', 'fill="#0000FF" blend="multiply"')}</group>`,
  ).surface;
  const isolated = render(
    `${rect('b', 'fill="#FF0000"')}<group id="g" isolate="true">${rect('s', 'fill="#0000FF" blend="multiply"')}</group>`,
  ).surface;
  assert.deepEqual(px(pass, 4, 4), [0, 0, 0, 1]);
  assert.deepEqual(px(isolated, 4, 4), [0, 0, 1, 1]);
});
const stops = '<stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>';
const mesh =
  '<point row="0" col="0" color="#FF0000"/><point row="0" col="1" color="#0000FF"/><point row="1" col="0" color="#FF0000"/><point row="1" col="1" color="#0000FF"/>';
for (const kind of ['linearGradient', 'radialGradient', 'conicGradient', 'meshGradient'])
  test(`paint fixture: ${kind}`, () => {
    const extra = kind === 'meshGradient' ? 'rows="2" cols="2"' : '';
    const sections = `<paints><${kind} id="p" ${extra}>${kind === 'meshGradient' ? mesh : stops}</${kind}></paints>`;
    const { surface } = render(
      `<shape id="s" shape="rect" width="32" height="32" fill="url(#p)"/>`,
      { sections },
    );
    assert.equal(px(surface, 16, 16)[3], 1);
    assert.notDeepEqual(px(surface, 2, 16), px(surface, 25, 16));
  });
test('gradient spread, midpoint, opacity, color spaces, rotation and animation', () => {
  for (const interpolationSpace of ['linear', 'srgb', 'oklab', 'oklch'])
    for (const spread of ['pad', 'repeat', 'reflect']) {
      const { surface } = render(
        `<shape id="s" shape="rect" width="32" height="32" fill="url(#p)"/>`,
        {
          sections: `<paints><linearGradient id="p" x1="0" x2="8" units="user" spread="${spread}" interpolationSpace="${interpolationSpace}" rotation="30" dither="true"><stop offset="0" color="#FF0000" midpoint="0.2" opacity="0.5"/><stop offset="1" color="#0000FF"/></linearGradient></paints>`,
        },
      );
      assert.ok(alpha(surface) > 500);
      assert.notDeepEqual(px(surface, 1, 2), px(surface, 10, 2));
    }
  close(colorMix([0, 0, 0, 1], [1, 1, 1, 1], 0.5, 'srgb')[0], 0.214, 0.001);
  const sections = `<styles><token name="ink" value="#FF0000"/></styles><paints><linearGradient id="p"><stop offset="0" color="var(--ink)"><animate property="color"><key time="0" value="#FF0000"/><key time="1" value="#00FF00"/></animate></stop><stop offset="1" color="#0000FF"/></linearGradient></paints>`;
  const a = render(rect('s', 'fill="url(#p)"'), { sections, t: 0 }).surface,
    b = render(rect('s', 'fill="url(#p)"'), { sections, t: 1 }).surface;
  assert.notDeepEqual(a.data, b.data);
});
for (const type of ['rect', 'rounded-rect', 'ellipse', 'polygon', 'star', 'path'])
  for (const mode of [
    'intersect',
    'add',
    'subtract',
    'lighten',
    'darken',
    'difference',
    'none',
  ])
    test(`mask fixture: ${type}/${mode}`, () => {
      const body = `<shape id="s" shape="rect" width="32" height="32"><mask type="rect" width="20" height="20"/><mask type="${type}" mode="${mode}" x="8" y="8" width="16" height="16" radius="3" innerRadius="4" ${type === 'path' ? 'path="M0 0H16V16H0Z"' : ''}/></shape>`;
      const { surface } = render(body);
      assert.ok(alpha(surface) > 0);
      assert.equal(px(surface, 31, 31)[3], 0);
      if (mode === 'subtract' || mode === 'difference') assert.ok(px(surface, 16, 16)[3] < 0.1);
    });
test('mask expansion, inversion, opacity, feather and transformed matte modes', () => {
  const a = render(
    rect(
      's',
      '',
      `<mask type="rect" x="2" y="2" width="4" height="4" expansion="1" opacity="0.5"/>`,
    ),
  ).surface;
  close(px(a, 1, 3)[3], 0.5);
  assert.equal(px(a, 0, 0)[3], 0);
  const inv = render(
    rect('s', '', `<mask type="ellipse" width="8" height="8" invert="true" feather="1"/>`),
  ).surface;
  assert.ok(px(inv, 0, 0)[3] > 0.1);
  assert.ok(px(inv, 4, 4)[3] < 0.1);
  for (const matteMode of ['alpha', 'alpha-inverted', 'luma', 'luma-inverted']) {
    const { surface } = render(
      `${rect('s', `matte="m" matteMode="${matteMode}" fill="#FF0000"`)}${rect('m', 'x="4" fill="#FFFFFF"')}`,
    );
    assert.equal(px(surface, 6, 4)[3], matteMode.endsWith('inverted') ? 0 : 1);
    assert.equal(px(surface, 10, 4)[3], 0);
  }
  const visible = render(
    `${rect('s', 'matte="m" matteVisible="true"')}${rect('m', 'x="4" fill="#00FF00"')}`,
  ).surface;
  assert.deepEqual(px(visible, 10, 4), [0, 1, 0, 1]);
});
test('adjustment mask is applied once and effects preserve XML order', () => {
  const source = xml(
    `${rect('s', 'fill="#808080"')}<adjustment id="a" effects="fx" opacity="0.5"><mask type="rect" width="4" height="8" opacity="0.5"/></adjustment>`,
  ).replace(
    '</scene>',
    '<effects><effect id="fx" type="scanlines" size="2" intensity="1" mix="1"/></effects></scene>',
  );
  const p = prepareScene(source);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const r = new FrameRenderer(p.runtime.scene, p.runtime.tracks, noFiles, 1, p.runtime),
    s = r.render(0);
  const ref = render(rect('s', 'fill="#808080"')).surface;
  const orig = px(ref, 2, 1)[0];
  const out = px(s, 2, 1)[0];
  assert.ok(out >= orig * 0.75 - 0.001 && out <= orig + 0.001);
  close(px(s, 6, 1)[0], orig);
});
const image = new Surface(8, 4);
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 8; x++)
    image.data.set(x < 4 ? [1, 0, 0, 1] : [0, 0, 1, 1], (y * 8 + x) * 4);
const imageOptions = {
  sections: '<assets><image id="i" src="i.png" width="8" height="4"/></assets>',
  files: { 'i.png': encodePng(image) },
};
for (const fit of ['none', 'contain', 'cover', 'fill', 'scale-down', 'contain-blur'])
  test(`image fit ${fit} and focus`, () => {
    const { surface } = render(
      `<layer id="l" asset="i" boxWidth="16" boxHeight="16" fit="${fit}" focusX="0" focusY="0"/>`,
      imageOptions,
    );
    assert.ok(px(surface, 1, 1)[0] > 0.9);
    assert.equal(px(surface, 20, 20)[3], 0);
    if (fit === 'fill' || fit === 'cover') assert.equal(px(surface, 1, 14)[3], 1);
    if (fit === 'contain') assert.equal(px(surface, 1, 14)[3], 0);
  });
test('source crop and flip affect content before fit', () => {
  const cropped = render(
    '<layer id="l" asset="i" cropLeft="0.5" boxWidth="16" boxHeight="16" fit="contain"/>',
    imageOptions,
  ).surface;
  assert.deepEqual(px(cropped, 1, 1), [0, 0, 1, 1]);
  assert.deepEqual(px(cropped, 14, 14), [0, 0, 1, 1]);
  const flipped = render(
    '<layer id="l" asset="i" flipX="true" flipY="true"/>',
    imageOptions,
  ).surface;
  assert.deepEqual(px(flipped, 1, 1), [0, 0, 1, 1]);
});
test('pattern tile, offset, scale, rotation and transparent samples', () => {
  const options = {
    ...imageOptions,
    sections:
      imageOptions.sections +
      '<paints><pattern id="p" asset="i" tileWidth="8" tileHeight="4" offsetX="1" offsetY="1" rotation="0" scale="1"/></paints>',
  };
  const { surface } = render(
    '<shape id="s" shape="rect" width="32" height="32" fill="url(#p)"/>',
    options,
  );
  assert.deepEqual(px(surface, 2, 2), [1, 0, 0, 1]);
  assert.deepEqual(px(surface, 6, 2), [0, 0, 1, 1]);
  assert.deepEqual(px(surface, 10, 2), [1, 0, 0, 1]);
});
test('layouts row, column, grid and stack support spacing and alignment', () => {
  for (const kind of ['row', 'column', 'grid', 'stack'])
    for (const justify of [
      'start',
      'center',
      'end',
      'space-between',
      'space-around',
      'space-evenly',
    ])
      for (const alignItems of ['start', 'center', 'end', 'stretch', 'baseline']) {
        const boxes = layout(
          {
            layout: kind,
            justify,
            alignItems,
            padding: 2,
            gap: 2,
            gridColumns: 2,
          },
          [
            { width: 4, height: 8, baseline: 6 },
            { width: 8, height: 4, baseline: 3 },
          ],
          32,
          32,
          32,
          32,
        );
        assert.equal(boxes.length, 2);
        for (const b of boxes) for (const v of Object.values(b)) assert.ok(Number.isFinite(v));
        if (kind === 'row' && alignItems === 'baseline') close(boxes[0].y + 6, boxes[1].y + 3);
      }
  const { surface } = render(
    `<group id="g" width="32" height="32" layout="row" padding="2" gap="4">${rect('a', 'fill="#FF0000"')}${rect('b', 'fill="#0000FF"')}</group>`,
  );
  assert.deepEqual(px(surface, 3, 3), [1, 0, 0, 1]);
  assert.deepEqual(px(surface, 15, 3), [0, 0, 1, 1]);
  assert.equal(px(surface, 11, 3)[3], 0);
  const boxes = layout(
    {
      layout: 'grid',
      gap: 2,
      padding: 2,
      gridColumns: 2,
      alignItems: 'stretch',
    },
    Array.from({ length: 4 }, () => ({ width: 8, height: 8 })),
    32,
    32,
    32,
    32,
  );
  assert.equal(boxes[2].y, 12);
  assert.equal(boxes[0].width, 13);
});
test('relative alignment, safe areas and enforcement', () => {
  for (const alignX of ['left', 'center', 'right', 'stretch'])
    for (const alignY of ['top', 'middle', 'bottom', 'stretch']) {
      const { surface } = render(
        rect('s', `alignX="${alignX}" alignY="${alignY}" alignTo="frame" margin="2"`),
      );
      assert.ok(alpha(surface) > 0);
    }
  const options = {
    sections: '<safeAreas><safeArea id="safe" preset="title-safe" enforce="warn"/></safeAreas>',
    project: 'safeArea="safe"',
  };
  const warn = render(rect('s', 'tags="logo"'), options);
  assert.equal(warn.renderer.warnings.size, 1);
  assert.throws(
    () =>
      render(rect('s', 'tags="cta"'), {
        ...options,
        sections: options.sections.replace('warn', 'error'),
      }),
    /outside the safe area/,
  );
  const aligned = render(
    rect('s', 'alignX="left" alignY="top" alignTo="safe-area"'),
    options,
  ).surface;
  assert.equal(px(aligned, 0, 0)[3], 0);
  assert.equal(px(aligned, 4, 4)[3], 1);
  for (const preset of [
    'custom',
    'title-safe',
    'action-safe',
    'instagram-reels',
    'instagram-stories',
    'instagram-feed',
    'facebook-reels',
    'tiktok',
    'youtube-shorts',
    'snapchat',
    'pinterest-idea',
  ])
    assert.ok(safeArea({ preset }, 100, 100).width > 0);
  assert.throws(() => safeArea({ preset: 'missing' }, 100, 100));
  assert.throws(() => safeArea({ left: 0.6, right: 0.6 }, 100, 100));
});
for (const reframe of ['reflow', 'crop', 'fit', 'fit-blur'])
  test(`output reframe ${reframe}`, () => {
    const sections = `<layouts><layout id="portrait" width="16" height="32" reframe="${reframe}"/></layouts>`;
    const { surface } = render(
      `<shape id="s" shape="rect" width="32" height="32" fill="#FF0000"/>`,
      { sections, layout: 'portrait' },
    );
    assert.equal(surface.width, 16);
    assert.equal(surface.height, 32);
    assert.equal(px(surface, 8, 16)[0], 1);
    if (reframe === 'fit') assert.equal(px(surface, 8, 0)[3], 0);
    if (reframe === 'fit-blur') assert.ok(px(surface, 8, 0)[3] > 0);
  });
test('sequence places children on distinct clocks and honors gaps', () => {
  const body = `<sequence id="seq" timeGap="0.5">${rect('a', 'end="1" fill="#FF0000"')}${rect('b', 'end="1" fill="#0000FF"')}</sequence>`;
  assert.deepEqual(px(render(body, { t: 0.5 }).surface, 2, 2), [1, 0, 0, 1]);
  assert.equal(px(render(body, { t: 1.25 }).surface, 2, 2)[3], 0);
  assert.deepEqual(px(render(body, { t: 1.75 }).surface, 2, 2), [0, 0, 1, 1]);
});
const symbolSection = `<symbols><symbol id="sym" width="16" height="16" duration="2">${rect('inner', 'fill="#FF0000"', `<animate property="x"><key time="0" value="0"/><key time="2" value="8"/></animate>`)}</symbol></symbols>`;
test('instances render scoped overrides and independent source clocks', () => {
  const { surface, runtime } = render(
    '<instance id="a" symbol="sym" speed="2"/><instance id="b" symbol="sym" y="16" reverse="true"><override target="inner" property="fill" value="#0000FF"/></instance>',
    { sections: symbolSection, t: 0.5 },
  );
  assert.deepEqual(px(surface, 5, 2), [1, 0, 0, 1]);
  assert.equal(px(surface, 1, 2)[3], 0);
  assert.deepEqual(px(surface, 7, 18), [0, 0, 1, 1]);
  assert.equal(runtime.ids.get('a__inner').attributes.fill, '#FF0000');
  assert.equal(runtime.ids.get('b__inner').attributes.fill, '#0000FF');
  const loop = render('<instance id="a" symbol="sym" clipIn="0.5" clipOut="1.5" loop="2"/>', {
    sections: symbolSection,
    t: 1.25,
  }).surface;
  assert.deepEqual(px(loop, 4, 2), [1, 0, 0, 1]);
});
test('repeat count, offsets, stagger, behaviours and expression contexts', () => {
  const body = `<repeat id="r" count="3" offsetX="10" timeStep="0.5"><mask type="rect" width="32" height="16"/>${rect('s', '', `<expression property="y">index*2</expression><expression property="opacity">param('item')/2</expression>`)}</repeat>`;
  const a = render(body, { t: 1.5 }).surface;
  assert.equal(px(a, 1, 1)[3], 0);
  close(px(a, 11, 3)[3], 0.5);
  assert.equal(px(a, 21, 5)[3], 1);
  const before = render(body, { t: 0.25 }).surface;
  assert.equal(px(before, 11, 3)[3], 0);
  const sections =
    '<parameters><param id="items" type="list" default="[2,4,6,8]"/></parameters>';
  const list = render(
    `<repeat id="r" over="items" from="1" step="2" offsetX="12">${rect('s', '', `<expression property="y">param('item')</expression>`)}</repeat>`,
    { sections },
  ).surface;
  assert.equal(px(list, 1, 5)[3], 1);
  assert.equal(px(list, 13, 9)[3], 1);
});
test('repeat data rows allow safe field reads and scoped references', () => {
  const sections = '<parameters><data id="rows" src="rows.json" format="json"/></parameters>';
  const files = { 'rows.json': '[{"offset":2},{"offset":10}]' };
  const body = `<repeat id="r" over="rows" var="row" offsetX="12">${rect('s', '', `<expression property="y">row.offset</expression>`)}</repeat>`;
  const { surface } = render(body, { sections, files });
  assert.equal(px(surface, 1, 3)[3], 1);
  assert.equal(px(surface, 13, 11)[3], 1);
});
test('includes namespace IDs, tokens, overrides and relative asset dependencies', () => {
  const foreign = xml(
    rect('s', 'fill="var(--ink)"'),
    '<styles><token name="ink" value="#0000FF"/></styles>',
  );
  const files = { 'part.xml': foreign };
  const hash = createHash('sha256').update(foreign).digest('hex');
  const { surface, runtime } = render(
    `<include id="inc" src="part.xml" sha256="${hash}" x="8"/>${rect('s', 'fill="var(--ink)"')}`,
    { sections: '<styles><token name="ink" value="#FF0000"/></styles>', files },
  );
  assert.deepEqual(px(surface, 2, 2), [1, 0, 0, 1]);
  assert.deepEqual(px(surface, 10, 2), [0, 0, 1, 1]);
  assert.ok(runtime.ids.has('inc__s'));
  const override = render(
    '<include id="inc" src="part.xml"><override target="s" property="fill" value="#00FF00"/></include>',
    { files },
  ).surface;
  assert.deepEqual(px(override, 2, 2), [0, 1, 0, 1]);
  const bads = [
    ['../escape.xml', files],
    ['https://a.test/x.xml', files],
    ['part.xml', { 'part.xml': '<bad/>' }],
    ['part.xml', { 'part.xml': xml('<include id="again" src="part.xml"/>') }],
  ];
  for (const [src, files] of bads)
    assert.equal(
      prepareScene(xml(`<include id="inc" src="${src}"/>`), {
        read: (p) => files[p],
      }).ok,
      false,
    );
  assert.equal(prepareScene(xml('<include id="inc" src="part.xml"/>')).ok, false);
  assert.equal(
    prepareScene(xml('<include id="inc" src="part.xml" sha256="' + '0'.repeat(64) + '"/>'), {
      read: (p) => files[p],
    }).ok,
    false,
  );
});
test('preflight detects geometry, masks, mesh, crop, recursion and expansion limits', () => {
  const bad = [
    xml('<shape id="s" shape="path" width="8" height="8"/>'),
    xml('<layer id="l" asset="i" cropLeft="0.6" cropRight="0.6"/>', imageOptions.sections),
    xml(
      '',
      `<paints><meshGradient id="m" rows="2" cols="2"><point row="0" col="0" color="#FFFFFF"/></meshGradient></paints>`,
    ),
    xml(
      '<instance id="i" symbol="sym"><override target="absent" property="x" value="1"/></instance>',
      symbolSection,
    ),
    xml(
      '<instance id="i" symbol="sym"/>',
      '<symbols><symbol id="sym"><instance id="i2" symbol="sym"/></symbol></symbols>',
    ),
    xml(`${rect('a', 'matte="b"')}${rect('b', 'matte="a"')}`),
  ];
  for (const source of bad) assert.equal(prepareScene(source).ok, false, source);
  assert.equal(
    prepareScene(xml(`<repeat id="r" count="10001">${rect('s')}</repeat>`)).ok,
    false,
  );
});
test('instance fitting preserves vector resolution and mapped source time', () => {
  for (const fit of ['none', 'contain', 'cover', 'fill', 'scale-down', 'contain-blur']) {
    const { surface } = render(
      `<instance id="a" symbol="sym" boxWidth="32" boxHeight="16" fit="${fit}"/>`,
      { sections: symbolSection, t: 0 },
    );
    assert.ok(alpha(surface) > 0);
  }
  const body =
    '<instance id="a" symbol="sym"><timeRemap><key time="0" value="1"/><key time="1" value="1"/></timeRemap></instance>';
  const { surface } = render(body, { sections: symbolSection, t: 0.5 });
  assert.equal(px(surface, 2, 2)[3], 0);
  assert.deepEqual(px(surface, 5, 2), [1, 0, 0, 1]);
});
test('nested includes resolve dependencies once and symbols get local references', () => {
  const assetScene = xml(
    '<layer id="l" asset="i"/>',
    '<assets><image id="i" src="i.png" width="8" height="4"/></assets>',
  );
  const files = {
    'sub/a.xml': xml('<include id="b" src="b.xml"/>'),
    'sub/b.xml': assetScene,
    'sub/i.png': encodePng(image),
  };
  const { surface } = render('<include id="a" src="sub/a.xml"/>', { files });
  assert.deepEqual(px(surface, 1, 1), [1, 0, 0, 1]);
  const foreign = xml(
    '',
    `<symbols><symbol id="part" width="8" height="8">${rect('s', 'fill="#00FF00"')}</symbol></symbols>`,
  );
  const selected = render('<include id="a" src="foreign.xml" symbol="part"/>', {
    files: { 'foreign.xml': foreign },
  }).surface;
  assert.deepEqual(px(selected, 1, 1), [0, 1, 0, 1]);
});
test('baseline alignment uses first text baselines', () => {
  const sections =
    '<assets><font id="f" src="f.ttf" family="D"/><text id="t1" text="Hi" width="12" height="16" size="8" fontAsset="f"/><text id="t2" text="Hi" width="12" height="16" size="12" fontAsset="f"/></assets>';
  const { renderer } = render(
    '<group id="g" layout="row" alignItems="baseline"><layer id="l1" asset="t1"/><layer id="l2" asset="t2"/></group>',
    {
      sections,
      files: {
        'f.ttf': new Uint8Array(
          readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
        ),
      },
    },
  );
  const c = new Compositor(renderer);
  c.measure(renderer.composition, IDENTITY, 32, 32);
  const a = c.nodes.get('l1'),
    b = c.nodes.get('l2');
  close(
    c.boxes.get(a).y + renderer.baselines.get('t1'),
    c.boxes.get(b).y + renderer.baselines.get('t2'),
  );
});
test('mesh is bicubic, not bilinear, and placement animation keeps parent time', () => {
  const points = [0, 1]
    .flatMap((row) =>
      [0, 1, 2].map(
        (col) =>
          `<point row="${row}" col="${col}" color="${col === 1 ? '#FFFFFF' : '#000000'}"/>`,
      ),
    )
    .join('');
  const loaded = loadScene(
    xml(
      '',
      `<paints><meshGradient id="mesh" rows="2" cols="3" interpolationSpace="linear">${points}</meshGradient></paints>`,
    ),
  );
  assert.ok(loaded.ok);
  const node = loaded.scene.children.find((n) => n.name === 'paints').children[0];
  const sample = paint(
    'url(#mesh)',
    {
      paints: new Map([['mesh', node]]),
      tokens: new Map(),
      attributes: (n) => n.attributes,
      image: () => image,
      scale: 1,
    },
    100,
    100,
  );
  close(sample(25, 50)[0], 0.5625, 0.0001);
  close(sample(50, 50)[0], 1, 0.0001);
  const result = render(
    '<instance id="a" symbol="sym" speed="2"><animate property="y"><key time="0" value="0"/><key time="2" value="8"/></animate></instance>',
    { sections: symbolSection, t: 0.5 },
  );
  assert.equal(result.runtime.value(result.runtime.ids.get('a'), 'y', 0.5), 2);
  const reversed = render('<instance id="a" symbol="sym" reverse="true"/>', {
    sections: symbolSection,
    t: 0,
  }).surface;
  assert.ok(alpha(reversed) > 0);
});
test('frame alignment compensates nested translation and group safe-area enforcement', () => {
  const { surface } = render(
    `<group id="g" x="12">${rect('s', 'alignTo="frame" alignX="left"')}</group>`,
  );
  assert.equal(px(surface, 1, 1)[3], 1);
  assert.equal(px(surface, 13, 1)[3], 0);
  assert.throws(
    () =>
      render(`<group id="g" tags="logo" width="32" height="32">${rect('s')}</group>`, {
        project: 'safeArea="safe"',
        sections:
          '<safeAreas><safeArea id="safe" preset="title-safe" enforce="error"/></safeAreas>',
      }),
    /safe area/,
  );
});

test('trim and merge span repeater copies and transparent gradient stops do not bleed', () => {
  const line = shapePath({ shape: 'line' }, 10, 0),
    copies = modify(line, { type: 'repeater', copies: 2, offsetX: 20 }, 0);
  const trimmed = modifyPaths(copies, { type: 'trim', offset: 0, amount: 50 }, 0);
  assert.ok(trimmed[0].path.toSVGString());
  assert.equal(trimmed[1].path.toSVGString(), '');
  const wrapped = trimPaths(copies, { trimStart: 0.25, trimEnd: 0.75, trimOffset: 180 });
  assert.ok(wrapped.every((p) => p.path.toSVGString()));
  assert.equal(trimPaths(copies, { trimStart: 1, trimEnd: 0 }).length, 0);
  assert.ok(modifyPaths(copies, { type: 'merge', mode: 'add' }, 0).length === 1);
  assert.deepEqual(colorMix([1, 0, 0, 0], [0, 0, 1, 1], 0.5, 'linear'), [0, 0, 1, 0.5]);
  assert.deepEqual(colorMix([1, 0, 0, 0], [0, 1, 0, 0], 0.5, 'linear'), [0, 0, 0, 0]);
});
test('adjustment blend applies to the filtered backdrop', () => {
  const source = xml(
    `${rect('s', 'fill="#808080"')}<adjustment id="a" effects="fx" blend="multiply"/>`,
  ).replace(
    '</scene>',
    '<effects><effect id="fx" type="scanlines" enabled="false"/></effects></scene>',
  );
  const p = prepareScene(source);
  assert.ok(p.ok);
  const f = new FrameRenderer(p.runtime.scene, p.runtime.tracks, noFiles, 1, p.runtime);
  close(px(f.render(0), 2, 2)[0], 0.21586 ** 2, 0.001);
});
test('instance procedural expressions repeat with their source clock',()=>{
 const sections=`<symbols><symbol id="sym" width="16" height="16" duration="2">${rect('s','',`<expression property="x">8+wiggle(2,2)</expression>`)}</symbol></symbols>`;
 const a=render('<instance id="i" symbol="sym" loop="1"/>',{sections,t:.5}).surface;
 const b=render('<instance id="i" symbol="sym" loop="1"/>',{sections,t:2.5}).surface;
 assert.deepEqual(a.data,b.data);
});
