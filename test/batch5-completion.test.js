import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { collideParticle } from "../src/render/dynamics/particle-collision.js";
import { particleStates } from "../src/render/dynamics/particles.js";
import {
  projectionMesh,
  projectionBoxes,
  crc32,
} from "../src/render/three/projection-mesh.js";
import { sphericalMetadata } from "../src/render/three/metadata.js";
import { prepareScene } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
import { Compositor } from "../src/render/compositor.js";
const fixed = (t) => ({ x: 0, y: 0, rotation: 0 });
const wall = {
  vertices: [
    { x: 10, y: -50 },
    { x: 11, y: -50 },
    { x: 11, y: 50 },
    { x: 10, y: 50 },
  ],
  pose: fixed,
};
test("continuous particle contacts prevent tunnelling and resolve radius, tangents and moving walls", () => {
  let p = collideParticle(
    [wall],
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    2,
    0,
    0.02,
    1,
  );
  assert.ok(p.vx < 0);
  assert.ok(Math.abs(p.x + 4) < 0.001);
  p = collideParticle(
    [{ ...wall, pose: (t) => ({ x: -100 * t, y: 0, rotation: 0 }) }],
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    2,
    0,
    0.02,
    1,
  );
  assert.ok(Math.abs(p.vx + 1200) < 0.001);
  const circle = { center: { x: 10, y: 0 }, radius: 2, pose: fixed };
  p = collideParticle(
    [circle],
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    1,
    0,
    0.02,
    0.5,
  );
  assert.ok(Math.abs(p.vx + 500) < 0.001);
  p = collideParticle(
    [circle],
    { x: 0, y: 4 },
    { x: 1000, y: 0 },
    1,
    0,
    0.02,
    1,
  );
  assert.equal(p.vx, 1000);
  p = collideParticle([circle], { x: 10, y: 0 }, { x: 0, y: 0 }, 1, 0, 0.02, 1);
  assert.ok(p.x >= 13);
  p = collideParticle([wall], { x: 10.5, y: 0 }, { x: 0, y: 0 }, 1, 0, 0.02, 1);
  assert.ok(p.x < 10 || p.x > 11);
  p = collideParticle([wall], { x: 0, y: 0 }, { x: 0, y: 0 }, 1, 0, 0.02, 1);
  assert.equal(p.x, 0);
  const rotated = { ...wall, pose: (t) => ({ x: 0, y: 0, rotation: 45 }) };
  p = collideParticle(
    [rotated],
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    0,
    0,
    0.03,
    1,
  );
  assert.ok(Math.abs(p.vx) < 0.01 && p.vy < -999);
  const rotor = {
    vertices: [
      { x: 0, y: -0.5 },
      { x: 20, y: -0.5 },
      { x: 20, y: 0.5 },
      { x: 0, y: 0.5 },
    ],
    pose: (t) => ({ x: 0, y: 0, rotation: t * 900 }),
  };
  p = collideParticle([rotor], { x: 10, y: 5 }, { x: 0, y: 0 }, 1, 0, 0.1, 0.5);
  assert.ok(p.vy > 0, "angular velocity transfers momentum");
  assert.deepEqual(
    collideParticle([], { x: 1, y: 2 }, { x: 3, y: 4 }, 1, 0, 1, 1),
    { x: 4, y: 6, vx: 3, vy: 4 },
  );
});
const scene = (body, extras = "", project = "") =>
  `<scene version="1.1"><project width="40" height="40" fps="8" duration="2" quality="draft" background="#00000000" ${project}/>${extras.replace(/<lights>[\s\S]*?<\/lights>/g, "")}<composition>${body}</composition>${extras.match(/<lights>[\s\S]*?<\/lights>/)?.[0] ?? ""}</scene>`;
function render(xml, io = { read: () => new Uint8Array() }) {
  const p = prepareScene(xml);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return new FrameRenderer(p.runtime.scene, p.runtime.tracks, io, 1, p.runtime);
}
const mats =
  '<materials><material id="red" unlit="true" baseColor="#ff0000"/><material id="green" unlit="true" baseColor="#00ff00"/></materials>';
// scene space has its origin at the frame's top-left: (20, 20) is the centre of the 40×40 frame
const obj = (id, extra = "") =>
  `<object3D id="${id}" primitive="plane" width="20" height="20" material="red" castShadow="false" receiveShadow="false" ${/\bx=/.test(extra) ? "" : 'x="20" '}${/\by=/.test(extra) ? "" : 'y="20" '}${extra}/>`;
const pixel = (s, x, y) =>
  Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));
test("3D stack shares depth, respects 2D interleaving and isolated group opacity/masks", () => {
  const r = render(
    scene(
      obj("front", 'z="-3"') +
        obj("back", 'z="3"').replace('material="red"', 'material="green"'),
      mats,
    ),
  );
  assert.equal(pixel(r.render(0), 20, 20)[0], 1);
  const overlay =
    '<shape id="overlay" shape="rect" x="10" y="10" width="20" height="20" fill="#0000ff"/>';
  assert.equal(
    pixel(render(scene(obj("a") + overlay, mats)).render(0), 20, 20)[2],
    1,
  );
  assert.equal(
    pixel(render(scene(overlay + obj("a"), mats)).render(0), 20, 20)[0],
    1,
  );
  const isolated = render(
    scene(
      `<group id="g" opacity="0.5"><mask type="rect" width="20" height="40"/>${obj("a")}</group>`,
      mats,
    ),
  ).render(0);
  assert.ok(Math.abs(pixel(isolated, 15, 20)[3] - 0.5) < 0.01);
  assert.equal(pixel(isolated, 25, 20)[3], 0);
  const clipped = render(
    scene(
      `<group id="g" clip="true" width="20" height="40">${obj("a")}</group>`,
      mats,
    ),
  ).render(0);
  assert.equal(pixel(clipped, 25, 20)[3], 0);
  const nested = render(
    scene(
      `<group id="g">${obj("a", 'z="-3"')}</group>${obj("b", 'z="3"').replace('material="red"', 'material="green"')}`,
      mats,
    ),
  ).render(0);
  assert.ok(pixel(nested, 20, 20)[0] > 0.99);
});
test("3D parenting projects a 2D layer and native shadow visibility can animate", () => {
  const r = render(
    scene(
      obj("parent", 'x="10" visible="false"') +
        '<shape id="label" parent="parent" x="0" y="0" width="8" height="8" shape="rect" fill="#00ff00"/>',
      mats,
    ),
  );
  // Hidden geometry can still act as a transform parent for overlays.
  const s = r.render(0);
  assert.ok(s.data.every(Number.isFinite));
  const moving = render(
    scene(
      obj("parent", 'x="12"') +
        '<shape id="label" parent="parent" x="0" y="0" width="8" height="8" shape="rect" fill="#00ff00"/>',
      mats,
    ),
  );
  assert.ok(moving.render(0).data.some((v, i) => i % 4 === 1 && v > 0.8));
});
test("3D reframing preserves image geometry under crop and fit", () => {
  const r = render(scene(obj("a"), mats)),
    original = r.render(0);
  r.scene.reframe = {
    width: 40,
    height: 40,
    mode: "crop",
    focusX: 0.5,
    focusY: 0.5,
  };
  assert.deepEqual(r.render(0).data, original.data);
  r.width = 80;
  r.height = 40;
  r.scene.reframe.mode = "fit";
  const fit = r.render(0);
  assert.equal(pixel(fit, 0, 20)[3], 0);
  assert.equal(pixel(fit, 40, 20)[0], 1);
  r.scene.reframe.mode = "crop";
  assert.equal(pixel(r.render(0), 40, 20)[0], 1);
});
test("automatic layout reserves the deformed extent without changing the source box", () => {
  const r = render(
    scene(
      '<group id="row" layout="row" gap="2"><shape id="a" shape="rect" width="10" height="10"><deform><modifier type="stretch" axis="x" amount="1"/></deform></shape><shape id="b" shape="rect" width="5" height="5"/></group>',
    ),
  );
  const c = new Compositor(r);
  c.measure(r.composition, [1, 0, 0, 1, 0, 0], 40, 40);
  assert.equal(c.boxes.get(c.nodes.get("b")).x, 22);
  assert.equal(c.boxes.get(c.nodes.get("a")).width, 10);
  assert.equal(c.boxes.get(c.nodes.get("a")).x, 5);
  assert.ok(r.render(0).data.some((v) => v));
});
function boxes(b, start = 0) {
  const out = [];
  for (let i = start; i < b.length;) {
    const n = b.readUInt32BE(i);
    assert.ok(n >= 8);
    out.push({
      type: b.toString("ascii", i + 4, i + 8),
      data: b.subarray(i + 8, i + n),
    });
    i += n;
  }
  return out;
}
function decodeMesh(b) {
  let at = 0;
  const uint = () => {
      const n = b.readUInt32BE(at);
      at += 4;
      return n;
    },
    count = uint(),
    coords = [];
  for (let i = 0; i < count; i++) {
    coords.push(b.readFloatBE(at));
    at += 4;
  }
  const nv = uint(),
    bits = Math.ceil(Math.log2(count * 2));
  let bit = at * 8;
  const read = (n) => {
      let v = 0;
      while (n--) {
        v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1);
        bit++;
      }
      return v;
    },
    unzig = (n) => (n & 1 ? -(n + 1) / 2 : n / 2),
    prev = [0, 0, 0, 0, 0],
    vertices = [];
  for (let i = 0; i < nv; i++)
    vertices.push(
      prev.map((v, k) => {
        prev[k] += unzig(read(bits));
        return coords[prev[k]];
      }),
    );
  at = Math.ceil(bit / 8);
  assert.equal(uint(), 1);
  assert.equal(b[at++], 0);
  assert.equal(b[at++], 0);
  const ni = uint();
  bit = at * 8;
  const vb = Math.ceil(Math.log2(nv * 2)),
    indices = [];
  let index = 0;
  for (let i = 0; i < ni; i++) {
    index += unzig(read(vb));
    assert.ok(index >= 0 && index < nv);
    indices.push(index);
  }
  return { vertices, indices };
}
test("V2 compressed meshes decode to the rendered atlas and include CRC/stereo", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  for (const layout of ["cubemap", "eac", "fisheye-180"])
    for (const stereo of ["mono", "left-right", "top-bottom"]) {
      const root = boxes(projectionBoxes(layout, stereo));
      assert.equal(
        root[0].data[4],
        stereo === "mono" ? 0 : stereo === "left-right" ? 2 : 1,
      );
      const proj = boxes(root[1].data).find((b) => b.type === "proj"),
        m = boxes(proj.data).find((b) => b.type === "mshp").data;
      assert.equal(m.readUInt32BE(4), crc32(m.subarray(8)));
      const decoded = decodeMesh(boxes(inflateRawSync(m.subarray(12)))[0].data),
        reference = projectionMesh(layout);
      assert.deepEqual(decoded.indices, reference.indices);
      decoded.vertices.forEach((v, i) =>
        v.forEach((x, k) =>
          assert.ok(Math.abs(x - reference.vertices[i][k]) < 1e-6),
        ),
      );
      assert.ok(
        decoded.vertices.every(
          (v) => Math.abs(Math.hypot(...v.slice(0, 3)) - 1) < 1e-6,
        ),
      );
    }
  assert.throws(() => projectionBoxes("bad", "mono"), /unknown/);
});
test("all panorama metadata survives fast-start remux and repeated injection without altering decoded pixels", () => {
  const dir = mkdtempSync(join(tmpdir(), "batch5-mp4-"));
  try {
    for (const fast of [false, true]) {
      const file = join(dir, "a.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=48x32:d=0.1",
        "-c:v",
        "libx264",
        ...(fast ? ["-movflags", "+faststart"] : []),
        "-y",
        file,
      ]);
      const raw = readFileSync(file),
        decode = () =>
          execFileSync("ffmpeg", [
            "-v",
            "error",
            "-i",
            file,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
          ]),
        before = decode();
      for (const layout of [
        "equirectangular",
        "cubemap",
        "eac",
        "fisheye-180",
      ]) {
        const p = { layout, stereo: "left-right" },
          out = sphericalMetadata(raw, p);
        assert.deepEqual(sphericalMetadata(out, p), out);
        writeFileSync(file, out);
        assert.deepEqual(decode(), before);
        assert.ok(out.includes(Buffer.from("sv3d")));
        assert.ok(
          out.includes(
            Buffer.from(layout === "equirectangular" ? "equi" : "mshp"),
          ),
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("burst particle budget is enforced before allocation", () => {
  const n = {
    name: "particleEmitter",
    attributes: { rate: 0 },
    children: [{ name: "burst", attributes: { count: 200001 }, children: [] }],
  };
  assert.throws(
    () => particleStates(n, 0, (n) => n.attributes),
    /birth budget/,
  );
});
test("authored shadow map resolution and bias change depth comparisons, while castShadow disables them", () => {
  const body =
    '<object3D id="floor" primitive="plane" width="38" height="38" material="m"/><object3D id="ball" primitive="sphere" radius="5" x="-3" y="-3" z="-10" material="m"/>';
  const materials =
    '<materials><material id="m" baseColor="#ffffff" roughness="1"/></materials>';
  const image = (params, type = "point") =>
    render(
      scene(
        body,
        materials +
          `<lights><light id="l" type="${type}" x="-12" y="-10" z="-30" intensity="1" castShadow="true" ${params}/></lights>`,
      ),
    ).render(0);
  const low = image('shadowMapSize="16"'),
    high = image('shadowMapSize="256"'),
    biased = image('shadowMapSize="256" shadowBias="0.5"');
  assert.ok(low.data.every(Number.isFinite));
  const diff = (a, b) =>
    a.data.reduce((n, v, i) => n + Math.abs(v - b.data[i]), 0);
  assert.ok(diff(low, high) > 0.1, "map texel resolution changes shadow edge");
  assert.ok(diff(high, biased) > 0.1, "depth bias changes occlusion");
  const sun = image('shadowMapSize="32" yaw="20"', "directional");
  assert.ok(sun.data.some((v) => v > 0));
});
test("environment receiveShadow overrides and diffuse/specular filters affect native pixels", () => {
  const materials =
    '<materials><material id="m" baseColor="#ffffff" roughness="1"/></materials>';
  const source = (extra) =>
    scene(
      `<object3D id="floor" primitive="plane" width="38" height="38" material="m" ${extra}/><object3D id="ball" primitive="sphere" radius="7" z="-8" material="m"/>`,
      materials + '<lights><light id="d" type="dome" intensity="1"/></lights>',
    );
  const shadow = render(source("")).render(0),
    clear = render(source('receiveShadow="false"')).render(0);
  assert.ok(
    clear.data.reduce(
      (s, v, i) => s + (i % 4 !== 3 ? v - shadow.data[i] : 0),
      0,
    ) > 0,
  );
  const black = render(
    source("").replace(
      'type="dome"',
      'type="dome" affectsDiffuse="false" affectsSpecular="false"',
    ),
  ).render(0);
  assert.ok(
    black.data.reduce((s, v, i) => s + (i % 4 !== 3 ? v : 0), 0) <
      shadow.data.reduce((s, v, i) => s + (i % 4 !== 3 ? v : 0), 0),
  );
});
test("particle collisions use historical moving fixtures and preserve backward seeks with animated emitters", () => {
  const body =
    '<shape id="wall" shape="rect" x="24" y="0" width="2" height="40" fill="#00000000"><rigidBody type="kinematic" shape="box"/><animate property="x"><key time="0" value="24"/><key time="2" value="10"/></animate></shape><shape id="disc" shape="ellipse" x="100" width="4" height="4"><rigidBody type="static" shape="circle" sensor="true"/></shape><particleEmitter id="e" emitterShape="point" x="3" y="20" rate="0" lifetime="2" size="2" speed="30" direction="0" spread="0" collide="true" bounce="1"><burst count="1" time="0"/><animate property="x"><key time="0" value="3"/><key time="2" value="7"/></animate></particleEmitter>';
  const xml = scene(body).replace(
      "</scene>",
      '<physics gravityY="0" fixedStep="0.004166666666666667"/></scene>',
    ),
    r = render(xml),
    a = r.render(0.8);
  r.render(1.5);
  assert.deepEqual(r.render(0.8).data, a.data);
  assert.deepEqual(render(xml).render(0.8).data, a.data);
  const miss = render(xml.replace('collide="true"', 'collide="false"')).render(
    0.8,
  );
  assert.notDeepEqual(miss.data, a.data);
  assert.equal(r.physics.particleColliders().length, 1);
});
test("custom OCIO working space round-trips projected textures without display grading", () => {
  const config =
    "ocio_profile_version: 2\nroles: {scene_linear: linear-srgb, default: linear-srgb}\ndisplays:\n  srgb:\n    - !<View> {name: standard, colorspace: linear-srgb}\ncolorspaces:\n  - !<ColorSpace>\n    name: linear-srgb\n    bitdepth: 32f\n    isdata: false\n    allocation: uniform\n  - !<ColorSpace>\n    name: acescg\n    bitdepth: 32f\n    isdata: false\n    allocation: uniform\n    from_scene_reference: !<MatrixTransform> {matrix: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]}\n";
  const xml = scene(
    '<shape id="s" shape="rect" x="10" y="10" width="20" height="20" fill="#406080" threeD="true"/>',
  ).replace(
    "<composition>",
    '<colorManagement ocioConfig="color.ocio" workingSpace="acescg" bitDepth="32f"/><composition>',
  );
  const r = render(xml, { read: () => Buffer.from(config) }),
    a = r.render(0),
    b = render(xml.replace('threeD="true"', ""), {
      read: () => Buffer.from(config),
    }).render(0);
  pixel(a, 20, 20).forEach((v, i) =>
    assert.ok(Math.abs(v - pixel(b, 20, 20)[i]) < 1e-4),
  );
});
test("projected deformations retain pixels outside the undeformed box", () => {
  const base =
    '<shape id="s" shape="rect" x="10" y="10" width="10" height="10" fill="#ff0000" threeD="true"><deform><modifier type="stretch" axis="x" amount="1"/></deform></shape>';
  const a = render(scene(base)).render(0),
    b = render(
      scene(
        base.replace(
          '<deform><modifier type="stretch" axis="x" amount="1"/></deform>',
          "",
        ),
      ),
    ).render(0);
  assert.ok(
    a.data.filter((v, i) => i % 4 === 3).reduce((s, v) => s + v, 0) >
      1.8 * b.data.filter((v, i) => i % 4 === 3).reduce((s, v) => s + v, 0),
  );
});
test("puppet position, bend and starch constraints interpolate pins and preserve affine motion", async () => {
  const { puppetPoint } = await import("../src/render/dynamics/puppet.js");
  const base = [
    { restX: 0, restY: 0, x: 3, y: 2 },
    { restX: 10, restY: 0, x: 3, y: 2 },
    { restX: 0, restY: 10, x: 3, y: 2 },
  ];
  assert.deepEqual(puppetPoint({ x: 0, y: 0 }, base, 10), { x: 3, y: 2 });
  const p = puppetPoint({ x: 4, y: 4 }, base, 10);
  assert.ok(Math.abs(p.x - 7) < 1e-8 && Math.abs(p.y - 6) < 1e-8);
  const rot = puppetPoint(
    { x: 1, y: 0 },
    [{ kind: "bend", restX: 0, restY: 0, rotation: 90 }],
    10,
  );
  assert.ok(Math.abs(rot.x) < 1e-8 && Math.abs(rot.y - 1) < 1e-8);
  const starch = puppetPoint(
    { x: 1, y: 1 },
    [{ kind: "starch", restX: 0, restY: 0, rotation: 90, x: 20 }],
    10,
  );
  assert.ok(Math.abs(starch.x - 1) < 1e-8 && Math.abs(starch.y - 1) < 1e-8);
  assert.deepEqual(
    puppetPoint({ x: 1, y: 2 }, [{ amount: 0, restX: 0, restY: 0 }], 10),
    { x: 1, y: 2 },
  );
  assert.deepEqual(
    puppetPoint({ x: 1, y: 2 }, [{ restX: 0, restY: 0, x: 2, y: 3 }], 10),
    { x: 3, y: 5 },
  );
  const line = puppetPoint({ x: 5, y: 2 }, base.slice(0, 2), 10);
  assert.ok(Math.abs(line.x - 8) < 1e-8 && Math.abs(line.y - 4) < 1e-8);
});
test("projection triangles face the viewer inside the spherical mesh", () => {
  for (const layout of ["cubemap", "eac", "fisheye-180"]) {
    const { vertices, indices } = projectionMesh(layout);
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertices[indices[i]],
        b = vertices[indices[i + 1]],
        c = vertices[indices[i + 2]],
        u = b.map((v, k) => v - a[k]),
        v = c.map((v, k) => v - a[k]),
        normal = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
      assert.ok(normal.reduce((s, v, k) => s + v * a[k], 0) <= 1e-12, layout);
    }
  }
});
test("native 3D group effects and geometry mattes remain isolated from sibling overlays", () => {
  const effects = '<effects><effect id="inv" type="invert"/></effects>',
    body = `<group id="g" effects="inv">${obj("o")}</group><shape id="overlay" shape="rect" x="0" y="0" width="5" height="5" fill="#ff0000"/>`;
  const r = render(scene(body, mats).replace("</scene>", effects + "</scene>")),
    s = r.render(0);
  assert.ok(pixel(s, 20, 20)[1] > 0.9 && pixel(s, 20, 20)[2] > 0.9);
  assert.ok(pixel(s, 2, 2)[0] > 0.9);
  const nativeMatte = obj("mask").replace(
    'castShadow="false"',
    'castShadow="true"',
  );
  const a = render(
    scene(
      nativeMatte +
        '<shape id="s" shape="rect" width="40" height="40" fill="#00ff00" matte="mask"/>',
      mats,
    ),
  ).render(0);
  assert.ok(pixel(a, 20, 20)[1] > 0.9);
  assert.equal(pixel(a, 0, 0)[3], 0);
  assert.ok(a.data.filter((v, i) => i % 4 === 0).every((v) => v < 0.001));
});
test("native camera parenting and physical sensor width affect projection; fov stays horizontal", () => {
  const body =
    obj("parent", 'x="28"') +
    '<group id="rig" x="28"><camera id="cam" y="20" z="-50" focalLength="35" sensorWidth="36" sensorHeight="24"/></group>';
  const a = render(scene(body, mats)).render(0),
    b = render(
      scene(body.replace('sensorWidth="36"', 'sensorWidth="18"'), mats),
    ).render(0),
    c = render(
      scene(body.replace('id="rig" x="28"', 'id="rig" x="20"'), mats),
    ).render(0),
    // fov = 2·atan(sensorWidth / (2·focalLength)): sensorHeight does not change it
    d = render(
      scene(body.replace('sensorHeight="24"', 'sensorHeight="12"'), mats),
    ).render(0);
  assert.notDeepEqual(a.data, b.data);
  assert.notDeepEqual(a.data, c.data);
  assert.deepEqual(a.data, d.data);
});
