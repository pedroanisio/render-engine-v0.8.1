import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareScene } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
import { needsCycles, cyclesInfo } from "../src/render/three/native.js";
const source = (body, materials = "", sections = "", project = "") =>
  `<scene version="1.1"><project width="48" height="32" duration="2" fps="8" quality="draft" background="#00000000" ${project}/>${materials ? `<materials>${materials}</materials>` : ""}${sections.startsWith("<scene360") ? sections : ""}<composition>${body}</composition>${sections.startsWith("<scene360") ? "" : sections}</scene>`;
// Scene space has its origin at the frame's top-left (CONVENTIONS 2.1): objects, lights and cameras sit at the 48x32 frame centre.
const obj = (extra = "", children = "") =>
  `<object3D id="o" primitive="sphere" radius="9" x="24" y="16" material="m" ${extra}>${children}</object3D>`;
const mat = (extra = "") => `<material id="m" baseColor="#E06020" ${extra}/>`;
const lamp =
  '<lights><light id="l" type="point" x="4" y="-14" z="-35" intensity="1"/></lights>';
function renderer(xml, io = {}) {
  const p = prepareScene(xml);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => new Uint8Array(), ...io },
    1,
    p.runtime,
  );
}
const render = (...args) => renderer(...args).render(0);
const sum = (s) => s.data.reduce((a, v, i) => a + (i % 4 === 3 ? 0 : v), 0);
const alpha = (s) =>
  s.data.filter((v, i) => i % 4 === 3).reduce((a, v) => a + v, 0);
test("Cycles reports its pinned CPU runtime and renders finite PBR pixels deterministically", () => {
  const r = renderer(source(obj(), mat(), lamp));
  assert.equal(needsCycles(r.scene), true);
  assert.match(JSON.stringify(cyclesInfo()), /4\.5\.0/);
  const a = r.render(0),
    b = r.render(0);
  assert.ok(
    a.data.every((v, i) => Math.abs(v - b.data[i]) < 1e-5),
    "Cycles CPU floating-point reproducibility within 1e-5",
  );
  assert.ok(a.data.every(Number.isFinite));
  assert.ok(sum(a) > 10);
  assert.ok(alpha(a) > 100);
  const dark = render(source(obj(), mat()));
  assert.ok(sum(a) > sum(dark) + 10);
});
test("native primitives, extruded paths, text and bevel create visible silhouettes", () => {
  for (const primitive of [
    "box",
    "plane",
    "sphere",
    "cylinder",
    "cone",
    "torus",
    "capsule",
    "extrude",
    "text",
  ]) {
    const details =
      primitive === "extrude"
        ? 'path="M-8 -8L8 -8L8 8L-8 8Z"'
        : primitive === "text"
          ? 'text="B5"'
          : "";
    const s = render(
      source(
        `<object3D id="o" primitive="${primitive}" x="24" y="16" width="18" height="18" radius="8" depth="4" bevel="0.5" segments="12" material="m" ${details}/>`,
        mat('unlit="true"'),
      ),
    );
    assert.ok(alpha(s) > 3, primitive);
  }
});
test("lighting and physical material controls change rendered radiance", () => {
  const baseline = render(source(obj(), mat(), lamp));
  for (const attrs of [
    'metallic="1" roughness="0.15"',
    'clearcoat="1" clearcoatRoughness="0.1"',
    'emissive="#2080FF" emissiveStrength="2"',
    'transmission="1" ior="1.5"',
    'sheenColor="#FFFFFF" sheenRoughness="0.5"',
    'iridescence="1" metallic="1"',
    'specular="0"',
  ]) {
    const s = render(source(obj(), mat(attrs), lamp));
    assert.ok(s.data.every(Number.isFinite), attrs);
    assert.notDeepEqual(s.data, baseline.data, attrs);
  }
  for (const type of [
    "ambient",
    "directional",
    "spot",
    "rect-area",
    "disk-area",
    "dome",
  ]) {
    const s = render(
      source(
        obj(),
        mat(),
        `<lights><light id="l" type="${type}" x="24" y="16" z="-30" width="30" height="30" spotAngle="90"/></lights>`,
      ),
    );
    assert.ok(sum(s) > 0, type);
  }
});
test("native DOF, lens distortion, shake, hierarchy, constraints and shutter sampling are observable", () => {
  const camera = '<camera id="c" x="24" y="16" z="-45"/>';
  const base = render(source(camera + obj(), mat('unlit="true"')));
  for (const extra of [
    'depthOfField="true" focusDistance="10" fStop="0.5"',
    'lensDistortion="0.8"',
  ]) {
    const s = render(
      source(`<camera id="c" x="24" y="16" z="-45" ${extra}/>${obj()}`, mat('unlit="true"')),
    );
    assert.ok(s.data.every(Number.isFinite));
    assert.notDeepEqual(s.data, base.data);
  }
  const shaken = renderer(
    source(
      `<camera id="c" x="24" y="16" z="-45"><shake amplitude="8" seed="4"/></camera>${obj()}`,
      mat('unlit="true"'),
    ),
  );
  assert.notDeepEqual(shaken.render(0).data, shaken.render(0.5).data);
  const nested = render(
    source(`<group id="g" x="8">${obj()}</group>`, mat('unlit="true"')),
  );
  assert.notDeepEqual(nested.data, base.data);
  const constrained = render(
    source(
      `${camera}<object3D id="target" primitive="sphere" x="34" y="16" visible="false"/>${obj("", '<transformConstraint type="copy-position" target="target"/>')}`,
      mat('unlit="true"'),
    ),
  );
  assert.ok(alpha(constrained) > 10);
});
test("threeD planes preserve 2D colour and alpha, while rotating changes projected area", () => {
  const plane = (extra) =>
    source(
      `<shape id="s" shape="rect" x="12" y="8" width="24" height="16" fill="#FF0000" threeD="true" ${extra}/>`,
    );
  const front = render(plane("")),
    turned = render(plane('rotationY="60"'));
  assert.ok(alpha(front) > 100);
  assert.ok(alpha(turned) < alpha(front));
  assert.ok(sum(front) > 100);
});
test("360 layouts and stereo produce finite frames", () => {
  for (const layout of ["equirectangular", "fisheye-180", "cubemap", "eac"]) {
    const s = render(
      source(
        obj(),
        mat('emissive="#FF8000" emissiveStrength="1"'),
        `<scene360 layout="${layout}" width="48" height="32"/>`,
      ),
    );
    assert.equal(s.data.length, 48 * 32 * 4);
    assert.ok(s.data.every(Number.isFinite));
    assert.ok(alpha(s) > 0, layout);
  }
  for (const stereo of ["left-right", "top-bottom"]) {
    const s = render(
      source(
        obj(),
        mat('unlit="true"'),
        `<scene360 stereo="${stereo}" width="48" height="32"/>`,
      ),
    );
    assert.ok(alpha(s) > 0);
  }
});
test("MaterialX standard surface is compiled as an OSL closure and replaces XML material parameters", () => {
  const document =
    '<materialx version="1.39"><standard_surface name="surface" type="surfaceshader"><input name="base_color" type="color3" value="0.05,0.8,0.02"/></standard_surface><surfacematerial name="mat" type="material"><input name="surfaceshader" type="surfaceshader" nodename="surface"/></surfacematerial></materialx>';
  const s = render(source(obj(), mat('materialX="material.mtlx"'), lamp), {
    read: () => Buffer.from(document),
  });
  assert.ok(sum(s) > 10);
  const rgb = [0, 0, 0];
  s.data.forEach((v, i) => {
    if (i % 4 < 3) rgb[i % 4] += v;
  });
  assert.ok(rgb[1] > rgb[0] * 2);
});
test("3D shutter integration samples moving geometry and respects motionBlur off", () => {
  const moving = (extra) =>
    obj(
      extra,
      '<animate property="x"><key time="0" value="-12"/><key time="1" value="12"/></animate>',
    );
  const settings =
    'motionBlur="true" motionBlurSamples="3" adaptiveMotionBlur="false" shutterAngle="360" shutterPhase="-180"';
  const blur = renderer(source(moving(""), mat('unlit="true"'), "", settings));
  const still = renderer(source(moving(""), mat('unlit="true"')));
  const off = renderer(
    source(moving('motionBlur="off"'), mat('unlit="true"'), "", settings),
  );
  const a = blur.render(0.5),
    b = still.render(0.5),
    c = off.render(0.5);
  assert.notDeepEqual(a.data, b.data);
  assert.ok(c.data.every((v, i) => Math.abs(v - b.data[i]) < 1e-5));
  assert.equal(blur.time, 0.5);
  assert.equal(blur.shutterSampling, false);
});
test("PBR image maps, fonts, follow paths and instance parenting are exercised by native renders", async () => {
  const { PNG } = await import("pngjs");
  const { readFileSync } = await import("node:fs");
  const png = new PNG({ width: 2, height: 2 });
  for (let i = 0; i < 4; i++) png.data.set([20, 230, 80, 255], i * 4);
  const bytes = PNG.sync.write(png);
  const maps = render(
    source(
      obj(),
      mat(
        'baseColorMap="map.png" metallicRoughnessMap="map.png" normalMap="map.png" occlusionMap="map.png" emissiveMap="map.png" emissive="#FFFFFF" emissiveStrength="1"',
      ),
      lamp,
    ),
    { read: () => bytes },
  );
  assert.ok(sum(maps) > 20);
  const text = source(
    '<object3D id="text" primitive="text" text="B5" font="font" height="14" depth="2" material="m"/>',
    mat('unlit="true"'),
  ).replace(
    "<materials>",
    '<assets><font id="font" src="font.woff2" family="Inter"/></assets><materials>',
  );
  assert.ok(
    alpha(
      render(text, {
        read: () => readFileSync("examples/batch5/assets/inter.woff2"),
      }),
    ) > 5,
  );
  const path = render(
    source(
      obj(
        'instances="2"',
        '<transformConstraint type="follow-path" path="M-10 0L10 0" progress="0.75" autoOrient="true" offsetX="2"/>',
      ),
      mat('unlit="true"'),
    ),
  );
  assert.ok(alpha(path) > 30);
});
test("OpenPBR MaterialX graph and visible environment render without geometry", () => {
  const document =
    '<materialx version="1.39"><open_pbr_surface name="surface" type="surfaceshader"><input name="base_color" type="color3" value="0.05,0.8,0.02"/></open_pbr_surface><surfacematerial name="mat" type="material"><input name="surfaceshader" type="surfaceshader" nodename="surface"/></surfacematerial></materialx>';
  const s = render(source(obj(), mat('materialX="material.mtlx"'), lamp), {
    read: () => Buffer.from(document),
  });
  assert.ok(sum(s) > 10);
  const sky = render(
    source(
      "",
      "",
      '<lights><light id="sky" type="dome" color="#204080" environmentVisible="true"/></lights>',
    ),
  );
  assert.ok(alpha(sky) > 1500);
  assert.ok(sum(sky) > 10);
});
