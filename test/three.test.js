import { test } from "node:test";
import assert from "node:assert/strict";
import {
  raster,
  project,
  clipDepth,
  rotate,
  normalize,
  cross,
  dot,
  subtract,
} from "../src/render/three/raster.js";
import { primitive, importedGeometry } from "../src/render/three/geometry.js";
import { Surface } from "../src/render/surface.js";
import { transitionFrame } from "../src/render/transitions.js";
import { prepareScene, loadScene, capabilities } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
const close = (a, b, e = 1e-5) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const camera = { near: 1, far: 10, focal: 4, cx: 4, cy: 4 };
const quad = (z, color = [1, 0, 0, 1]) => ({
  vertices: [
    [-1, -1, z],
    [-1, 1, z],
    [1, 1, z],
    [1, -1, z],
  ].map((p) => ({ p, uv: [(p[0] + 1) / 2, (p[1] + 1) / 2] })),
  color,
});
const pixel = (s, x = 4, y = 4) =>
  Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mesh = {
  rootnode: { transformation: identity, meshes: [0] },
  meshes: [{ vertices: [-1, -1, 0, 0, 1, 0, 1, -1, 0], faces: [[0, 1, 2]] }],
};
const material = (id = "red", extra = "") =>
  `<material id="${id}" unlit="true" baseColor="#FF0000" ${extra}/>`;
const object = (extra = "", body = "") =>
  `<object3D id="o" primitive="box" material="red" width="12" height="12" depth="12" castShadow="false" receiveShadow="false" ${extra}>${body}</object3D>`;
function xml(body, materials = material(), project = "", assets = "") {
  return `<scene version="1.1"><project width="32" height="32" fps="8" duration="4" background="#00000000" ${project}/>${assets}<materials>${materials}</materials><composition>${body}</composition></scene>`;
}
function renderer(source, meshes) {
  const p = prepareScene(source);
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  return new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => new Uint8Array(), meshes },
    1,
    p.runtime,
  );
}
test("analytic perspective, orthographic and rotation", () => {
  assert.deepEqual(project([2, 1, 2], camera), [8, 6, 0.5]);
  assert.deepEqual(project([2, 1, 8], { ...camera, ortho: 2 }), [8, 6, 1]);
  const p = rotate([1, 0, 0], 0, 90, 0);
  close(p[0], 0);
  close(p[2], -1);
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  close(dot(normalize([1, 1, 1]), normalize([1, 1, 1])), 1);
  assert.deepEqual(subtract([3, 2, 1], [1, 1, 1]), [2, 1, 0]);
  assert.throws(() => normalize([0, 0, 0]), /degenerate/);
});
test("near/far clipping intersects attributes before division", () => {
  const vertices = [
    { p: [-1, 0, 0], uv: [0, 0] },
    { p: [1, 0, 2], uv: [1, 0] },
    { p: [0, 1, 2], uv: [0.5, 1] },
  ];
  const clipped = clipDepth(vertices, 1, true);
  assert.equal(clipped.length, 4);
  assert.deepEqual(clipped[0], { p: [0, 0, 1], uv: [0.5, 0] });
  assert.equal(clipDepth(vertices, 3, true).length, 0);
  assert.equal(clipDepth(vertices, 3, false).length, 3);
  assert.ok(
    raster(8, 8, [{ vertices, doubleSided: true }], camera).data.some(
      (v) => v > 0,
    ),
  );
  assert.throws(() => raster(8, 8, [], { ...camera, near: 20 }), /invalid/);
});
test("depth and transparency are independent of submission order; no shared-edge seams", () => {
  const a = quad(2, [0.5, 0, 0, 0.5]),
    b = quad(3, [0, 0, 1, 1]);
  const one = raster(8, 8, [a, b], camera),
    two = raster(8, 8, [b, a], camera);
  assert.deepEqual(one.data, two.data);
  assert.deepEqual(pixel(one), [0.5, 0, 0.5, 1]);
  const transparent = raster(8, 8, [a], camera);
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 6; x++) close(pixel(transparent, x, y)[3], 0.5);
  assert.ok(!raster(8, 8, [quad(0.5), quad(12)], camera).data.some((v) => v));
  const back = quad(2);
  back.vertices.reverse();
  assert.ok(!raster(8, 8, [back], camera).data.some((v) => v));
  back.doubleSided = true;
  assert.equal(pixel(raster(8, 8, [back], camera))[0], 1);
  assert.equal(pixel(raster(8, 8, [quad(2, [0, 0, 0, 0])], camera))[3], 0);
});
test("perspective texture mapping samples a projected plane correctly", () => {
  const texture = new Surface(2, 2);
  texture.data.set([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]);
  const face = quad(2);
  face.texture = texture;
  delete face.color;
  const p = pixel(raster(8, 8, [face], camera), 3, 3);
  close(p[0], 0.625);
  close(p[1], 0.25);
  close(p[2], 0.25);
  assert.equal(pixel(raster(8, 8, [quad(3)], { ...camera, ortho: 2 }))[3], 1);
});
for (const type of [
  "box",
  "plane",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "capsule",
])
  test(`${type}: finite outward geometry and visible render`, () => {
    const g = primitive({
      primitive: type,
      radius: 2,
      width: 4,
      height: 4,
      depth: 2,
      segments: 12,
    });
    assert.ok(g.points.every((p) => p.every(Number.isFinite)));
    assert.ok(g.triangles.length > 0);
    for (const f of g.triangles) {
      const [a, b, c] = f.map((i) => g.points[i]);
      const normal = cross(subtract(b, a), subtract(c, a));
      const center = a.map((v, i) => (v + b[i] + c[i]) / 3);
      if (type !== "torus")
        assert.ok(dot(normal, center) > -1e-8, `${type} winding`);
    }
    const faces = g.triangles.map((t) => ({
      vertices: t.map((i) => ({
        p: [g.points[i][0], g.points[i][1], g.points[i][2] + 5],
        uv: [0, 0],
      })),
    }));
    assert.ok(
      raster(32, 32, faces, {
        near: 0.1,
        far: 20,
        focal: 20,
        cx: 16,
        cy: 16,
      }).data.some((v) => v),
    );
  });
test("geometry input errors and static hierarchy conversion", () => {
  assert.throws(
    () => primitive({ primitive: "sphere", segments: 2 }),
    /segments/,
  );
  assert.throws(() => primitive({ primitive: "extrude" }), /unsupported/);
  const imported = importedGeometry(mesh);
  assert.equal(imported.points.length, 3);
  assert.deepEqual(imported.triangles, [[0, 1, 2]]);
  const tree = structuredClone(mesh);
  tree.rootnode.children = [
    { transformation: identity.map((v, i) => (i === 3 ? 3 : v)), meshes: [0] },
  ];
  assert.equal(importedGeometry(tree).points[3][0], 2);
  const usd = {
    format: "usd",
    meshes: [
      {
        points: [
          [-1, 0, 0],
          [0, 1, 0],
          [1, 0, 0],
        ],
        faceVertexCounts: [3],
        faceVertexIndices: [0, 1, 2],
        transform: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [2, 0, 0, 1],
        ],
      },
    ],
  };
  assert.equal(importedGeometry(usd).points[0][0], 1);
  for (const v of [null, { format: "splat" }, {}])
    assert.throws(() => importedGeometry(v));
  const bad = structuredClone(mesh);
  bad.meshes[0].faces = [[0, 1, 2, 0]];
  assert.throws(() => importedGeometry(bad), /triangulated/);
  bad.meshes[0].faces = [[0, 1, 8]];
  assert.throws(() => importedGeometry(bad), /index/);
  bad.meshes[0].faces = [[0, 1, 2]];
  bad.meshes[0].vertices[0] = NaN;
  assert.throws(() => importedGeometry(bad), /non-finite/);
});
test("scene geometry, camera selection and temporal visibility", () => {
  const base = renderer(xml(object()));
  assert.equal(pixel(base.render(0), 16, 16)[0], 1);
  const hidden = renderer(xml(object('start="1" end="2"')));
  assert.equal(pixel(hidden.render(0), 16, 16)[3], 0);
  assert.equal(pixel(hidden.render(1), 16, 16)[3], 1);
  assert.equal(pixel(hidden.render(2), 16, 16)[3], 0);
  const camera = `<camera id="cam" z="-30" projection="orthographic" orthoHeight="32"/><camera id="cam2" start="2" z="-30" x="30"/>`;
  const r = renderer(xml(object() + camera));
  assert.equal(pixel(r.render(0), 16, 16)[0], 1);
  assert.equal(pixel(r.render(2), 16, 16)[3], 0);
  const focal = renderer(
    xml(
      object() + '<camera id="cam" z="-30" focalLength="36" sensorWidth="36"/>',
    ),
  );
  assert.equal(pixel(focal.render(0), 16, 16)[0], 1);
});
test("camera target, parent transforms, animation and reordered seeking", () => {
  const parent = object('x="8" visible="false"');
  const child = object(
    'parent="o" x="-8"',
    '<animate property="rotationY"><key time="0" value="0"/><key time="2" value="80"/></animate>',
  ).replace('id="o"', 'id="child"');
  const r = renderer(
    xml(parent + child + '<camera id="cam" z="-30" target="child" roll="25"/>'),
  );
  const a = r.render(1);
  r.render(3);
  assert.deepEqual(r.render(1).data, a.data);
  assert.equal(pixel(a, 16, 16)[0], 1);
  const vertical = renderer(
    xml(object() + '<camera id="cam" y="-30" target="o"/>'),
  );
  assert.equal(pixel(vertical.render(0), 16, 16)[0], 1);
});
test("alpha mask, object opacity, emissive exposure and static imported mesh cache", () => {
  const mask = renderer(
    xml(
      object(),
      '<material id="red" unlit="true" baseColor="#FF000040" alphaMode="mask"/>',
    ),
  );
  assert.equal(pixel(mask.render(0), 16, 16)[3], 0);
  const alpha = renderer(
    xml(object('opacity="0.5"'), material("red", 'alphaMode="mask"')),
  );
  close(pixel(alpha.render(0), 16, 16)[3], 0.5);
  const emission = renderer(
    xml(
      object() + '<camera id="cam" z="-30" exposure="1"/>',
      material("red", 'emissive="#00FF00"'),
    ),
  );
  assert.deepEqual(pixel(emission.render(0), 16, 16), [2, 2, 0, 1]);
  const source = xml(
    object().replace(
      'primitive="box"',
      'primitive="mesh" mesh="mesh" scaleX="10" scaleY="10"',
    ),
    material(),
    "",
    '<assets><mesh id="mesh" src="model.obj"/></assets>',
  );
  const r = renderer(source, new Map([["mesh", mesh]]));
  assert.equal(pixel(r.render(0), 16, 16)[0], 1);
  r.render(1);
  assert.equal(r.geometryCache.size, 1);
});
test("pending capabilities fail explicitly before rendering", () => {
  for (const body of [
    object('materialVariant="foo"')
      .replace('primitive="box"', 'primitive="text"')
      .replace('materialVariant="foo"', 'instances="999999"'),
  ]) {
    const p = prepareScene(xml(body));
    assert.equal(p.ok, false, body);
  }
  assert.equal(prepareScene(xml(object(), '<material id="red"/>')).ok, true);
  assert.equal(
    prepareScene(xml(object(), material(), 'motionBlur="true"')).ok,
    true,
  );
});
test("geometry transitions preserve endpoints, transform silhouettes and respect direction", () => {
  const a = new Surface(40, 24),
    b = new Surface(40, 24);
  for (let i = 0; i < a.data.length; i += 4) {
    a.data.set([1, 0, 0, 1], i);
    b.data.set([0, 0, 1, 1], i);
  }
  for (const type of ["flip", "cube", "page-curl"]) {
    assert.deepEqual(transitionFrame(a, b, { type }, 0).data, a.data);
    assert.deepEqual(transitionFrame(a, b, { type }, 1).data, b.data);
    const middle = transitionFrame(a, b, { type }, 0.3);
    assert.ok(middle.data.every(Number.isFinite));
    assert.notDeepEqual(middle.data, a.data);
    assert.deepEqual(middle.data, transitionFrame(a, b, { type }, 0.3).data);
    for (const direction of ["right", "up", "down", "angle"])
      assert.ok(
        transitionFrame(a, b, { type, direction, angle: 30 }, 0.6).data.every(
          Number.isFinite,
        ),
      );
  }
  const edge = transitionFrame(a, b, { type: "flip" }, 0.5);
  assert.ok(!edge.data.some((v) => v));
  assert.notDeepEqual(
    transitionFrame(a, b, { type: "cube" }, 0.25).data,
    transitionFrame(a, b, { type: "cube", direction: "right" }, 0.25).data,
  );
});

test("mirrored geometry retains the front face and accepts 2D parenting and shadow animation", () => {
  const source = object().replace('primitive="box"', 'primitive="plane"');
  const a = renderer(xml(source)),
    b = renderer(xml(source.replace('width="12"', 'scaleX="-1" width="12"')));
  assert.deepEqual(a.render(0).data, b.render(0).data);
  assert.equal(
    prepareScene(
      xml(
        object() +
          '<shape id="s" shape="rect" width="5" height="5" parent="o"/>',
      ),
    ).ok,
    true,
  );
  assert.equal(
    prepareScene(
      xml(
        object(
          "",
          '<animate property="castShadow"><key time="0" value="false"/><key time="1" value="true"/></animate>',
        ),
      ),
    ).ok,
    true,
  );
});
test("real imported OBJ renders through encoder, resumes, and invalidates on geometry change", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { renderEpisode } = await import("../src/render/pipeline.js");
  const dir = mkdtempSync(join(tmpdir(), "geometry-render-"));
  try {
    const obj = "v -10 -10 0\nv 0 10 0\nv 10 -10 0\nf 1 2 3\n";
    writeFileSync(join(dir, "mesh.obj"), obj);
    const source = xml(
      object().replace('primitive="box"', 'primitive="mesh" mesh="mesh"'),
      material(),
      "",
      '<assets><mesh id="mesh" src="mesh.obj"/></assets>',
    )
      .replace('duration="4"', 'duration="1"')
      .replace(
        "<assets>",
        '<output id="out" path="out.mp4" codec="h264" container="mp4" audio="false"/><assets>',
      );
    writeFileSync(join(dir, "scene.xml"), source);
    const options = { sceneFile: join(dir, "scene.xml") };
    assert.equal((await renderEpisode(options)).rendered, 1);
    const decode = () =>
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        join(dir, "out.mp4"),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
    const pixels = decode();
    assert.equal(pixels.length, 32 * 32 * 3 * 8);
    assert.ok(pixels.some((v) => v > 100));
    assert.equal((await renderEpisode(options)).cached, 1);
    assert.deepEqual(decode(), pixels);
    writeFileSync(join(dir, "mesh.obj"), obj.replace("v 0 10 0", "v 0 -5 0"));
    assert.equal((await renderEpisode(options)).rendered, 1);
    assert.notDeepEqual(decode(), pixels);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("object3D matte isolates its projected silhouette and hides it from the main pass", () => {
  const r = renderer(
    xml(
      object() +
        '<shape id="s" shape="rect" width="32" height="32" fill="#00FF00" matte="o"/>',
    ),
  );
  const s = r.render(0);
  assert.equal(pixel(s, 16, 16)[1], 1);
  assert.equal(pixel(s, 16, 16)[0], 0);
  assert.equal(pixel(s, 0, 0)[3], 0);
  assert.equal(r.geometryFilter, undefined);
  assert.equal(r.geometryExcluded.size, 0);
});
