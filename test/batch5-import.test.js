import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { prepareScene } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
import { Tracking } from "../src/render/dynamics/tracking.js";
import {
  alphaHull,
  pathTriangles,
  convexHull,
} from "../src/render/dynamics/collision.js";
import { Surface } from "../src/render/surface.js";
import { materialXResources } from "../src/render/three/materialx.js";
import { sphericalMetadata } from "../src/render/three/metadata.js";
function gltf(skin = false) {
  const chunks = [],
    views = [],
    accessors = [];
  function data(values, type, width, componentType = 5126) {
    const b = Buffer.from(
      (componentType === 5121
        ? new Uint8Array(values)
        : new Float32Array(values)
      ).buffer,
    );
    const offset = chunks.reduce((a, b) => a + b.length, 0);
    views.push({ buffer: 0, byteOffset: offset, byteLength: b.length });
    chunks.push(b);
    accessors.push({
      bufferView: views.length - 1,
      componentType,
      count: values.length / width,
      type,
      ...(type === "VEC3"
        ? { min: [-10, -10, 0], max: [10, 10, 0] }
        : type === "SCALAR"
          ? { min: [0], max: [1] }
          : {}),
    });
    return accessors.length - 1;
  }
  const position = data([-10, -10, 0, 10, -10, 0, 0, 10, 0], "VEC3", 3),
    morph = data([0, 0, 0, 0, 0, 0, 10, 0, 0], "VEC3", 3),
    times = data([0, 1], "SCALAR", 1),
    translation = data([0, 0, 0, 12, 0, 0], "VEC3", 3);
  const joints = skin
    ? data([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], "VEC4", 4, 5121)
    : undefined;
  const weights = skin
    ? data([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], "VEC4", 4)
    : undefined;
  const binds = skin
    ? data(
        [
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0,
          0, 0, 0, 1, 0, 0, 0, 0, 1,
        ],
        "MAT4",
        16,
      )
    : undefined;
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: skin ? [0, 1] : [0] }],
    nodes: skin
      ? [{ mesh: 0, skin: 0 }, { name: "root", children: [2] }, { name: "tip" }]
      : [{ mesh: 0 }],
    ...(skin
      ? { skins: [{ joints: [1, 2], inverseBindMatrices: binds }] }
      : {}),
    meshes: [
      {
        weights: [0],
        primitives: [
          {
            attributes: {
              POSITION: position,
              ...(skin ? { JOINTS_0: joints, WEIGHTS_0: weights } : {}),
            },
            targets: [{ POSITION: morph }],
            material: 0,
            extensions: {
              KHR_materials_variants: {
                mappings: [{ material: 1, variants: [0] }],
              },
            },
          },
        ],
      },
    ],
    materials: [
      {
        name: "red",
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
        extensions: { KHR_materials_unlit: {} },
      },
      {
        name: "green",
        pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] },
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    extensionsUsed: ["KHR_materials_unlit", "KHR_materials_variants"],
    extensions: { KHR_materials_variants: { variants: [{ name: "green" }] } },
    animations: [
      {
        name: "move",
        samplers: [
          { input: times, output: translation, interpolation: "LINEAR" },
        ],
        channels: [
          { sampler: 0, target: { node: skin ? 2 : 0, path: "translation" } },
        ],
      },
    ],
    buffers: [
      {
        byteLength: Buffer.concat(chunks).length,
        uri:
          "data:application/octet-stream;base64," +
          Buffer.concat(chunks).toString("base64"),
      },
    ],
    bufferViews: views,
    accessors,
  };
}
test("glTF named clips, morph targets and material variants survive real native import", () => {
  const bytes = Buffer.from(JSON.stringify(gltf()));
  const render = (extra, time = 0) => {
    const p = prepareScene(
      `<scene version="1.1"><project width="48" height="32" fps="8" duration="2" quality="draft" background="#00000000"/><assets><mesh id="asset" src="mesh.gltf"/></assets><composition><object3D id="o" primitive="mesh" mesh="asset" ${extra}/></composition></scene>`,
    );
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    const r = new FrameRenderer(
      p.runtime.scene,
      p.runtime.tracks,
      { read: () => bytes, meshes: new Map([["asset", {}]]) },
      1,
      p.runtime,
    );
    return r.render(time);
  };
  const base = render('animationClip="move"'),
    moved = render('animationClip="move"', 0.75),
    morph = render('morphWeights="1"'),
    variant = render('materialVariant="green"');
  assert.ok(base.data.some((v) => v > 0));
  assert.notDeepEqual(base.data, moved.data);
  assert.notDeepEqual(base.data, morph.data);
  const rgb = [0, 0, 0];
  variant.data.forEach((v, i) => {
    if (i % 4 < 3) rgb[i % 4] += v;
  });
  assert.ok(rgb[1] > rgb[0] + 10);
  assert.throws(() => render('animationClip="absent"'), /Command failed/);
  assert.throws(() => render('materialVariant="absent"'), /Command failed/);
});
test("FBX camera tracking samples real authored keyframes", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbx-track-test-"));
  try {
    const file = join(dir, "track.fbx");
    execFileSync(
      resolve(".venv-3d/bin/python"),
      [
        "-c",
        `import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.object.camera_add()\nc=bpy.context.object\nc.location=(0,0,0);c.keyframe_insert(data_path='location',frame=1)\nc.location=(1,0,0);c.keyframe_insert(data_path='location',frame=9)\nbpy.context.scene.render.fps=8;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=9\nbpy.ops.export_scene.fbx(filepath=${JSON.stringify(file)},bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False)`,
      ],
      { stdio: "pipe" },
    );
    const p = prepareScene(
      '<scene version="1.1"><project width="32" height="32" fps="8" duration="2"/><tracking><trackData id="t" kind="camera" src="track.fbx" format="fbx"/></tracking><composition/></scene>',
    );
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    const track = new Tracking(p.runtime.scene, () => readFileSync(file), 8);
    assert.ok(
      Math.abs(track.sample("t", 9 / 8).x - track.sample("t", 1 / 8).x - 100) <
        0.01,
      JSON.stringify([track.sample("t", 0), track.sample("t", 1)]),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("collision hulls preserve concave area and reject empty alpha", () => {
  assert.deepEqual(
    convexHull([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
    ]),
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const triangles = pathTriangles("M0 0L10 0L10 2L2 2L2 10L0 10Z");
  const area = triangles.reduce(
    (sum, [a, b, c]) =>
      sum +
      Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) /
        2,
    0,
  );
  assert.ok(Math.abs(area - 36) < 1e-8);
  const image = new Surface(4, 4);
  assert.throws(() => alphaHull(image, 4, 4), /nonempty/);
  image.data.fill(1);
  assert.equal(alphaHull(image, 4, 4).length, 2);
  assert.throws(() => pathTriangles("M0 0L1 0"), /no area/);
});
test("MaterialX dependency graph audits includes, textures, cycles and unsafe paths", () => {
  const data = new Map([
    [
      "m/a.mtlx",
      '<materialx><xi:include href="b.mtlx"/><image><input type="filename" value="tex.png"/></image></materialx>',
    ],
    ["m/b.mtlx", '<materialx><xi:include href="a.mtlx"/></materialx>'],
    ["m/tex.png", "png"],
  ]);
  const files = new Map();
  materialXResources("m/a.mtlx", (s) => Buffer.from(data.get(s)), files);
  assert.equal(files.size, 3);
  for (const xml of [
    "<!DOCTYPE x><materialx/>",
    "<materialx><implementation/></materialx>",
    '<materialx><input type="filename" value="/etc/passwd"/></materialx>',
    '<materialx><xi:include href="../../secret"/></materialx>',
  ])
    assert.throws(() =>
      materialXResources("a.mtlx", () => Buffer.from(xml), new Map()),
    );
  assert.throws(
    () => materialXResources("../a.mtlx", () => Buffer.alloc(0), new Map()),
    /unsafe/,
  );
});
test("spherical MP4 metadata preserves decodability and records stereo in ffprobe", () => {
  const dir = mkdtempSync(join(tmpdir(), "spherical-test-"));
  try {
    for (const faststart of [false, true]) {
      const path = join(dir, "video.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=48x32:d=0.1",
        "-c:v",
        "libx264",
        ...(faststart ? ["-movflags", "+faststart"] : []),
        "-y",
        path,
      ]);
      const before = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        path,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      writeFileSync(
        path,
        sphericalMetadata(readFileSync(path), {
          layout: "equirectangular",
          stereo: "top-bottom",
        }),
      );
      const after = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        path,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      assert.deepEqual(before, after);
      const info = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          path,
        ]),
      );
      assert.ok(
        info.streams[0].side_data_list.some(
          (x) => x.projection === "equirectangular",
        ),
      );
    }
    assert.throws(
      () =>
        sphericalMetadata(Buffer.from("broken"), { layout: "equirectangular" }),
      /truncated/,
    );
    const b = Buffer.alloc(0);
    assert.throws(() => sphericalMetadata(b, { layout: "eac" }), /no moov/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("imported glTF skinning moves only the vertices weighted to the animated joint", () => {
  const bytes = Buffer.from(JSON.stringify(gltf(true))),
    p = prepareScene(
      '<scene version="1.1"><project width="48" height="32" fps="8" duration="2" quality="draft" background="#00000000"/><assets><mesh id="asset" src="skin.gltf"/></assets><composition><object3D id="o" primitive="mesh" mesh="asset" animationClip="move"/></composition></scene>',
    );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const r = new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    { read: () => bytes, meshes: new Map([["asset", {}]]) },
    1,
    p.runtime,
  );
  const first = r.render(0),
    last = r.render(1);
  assert.notDeepEqual(first.data, last.data);
  const bounds = (s) => {
    let min = Infinity,
      max = -Infinity;
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++)
        if (s.data[(y * s.width + x) * 4 + 3] > 0.5) {
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
    return [min, max];
  };
  const a = bounds(first),
    b = bounds(last);
  assert.ok(Number.isFinite(a[0]));
  assert.ok(Math.abs(a[0] - b[0]) <= 1);
  assert.ok(b[1] > a[1]);
});
test("static glTF keeps imported material slots without requiring animation flags", () => {
  const bytes = Buffer.from(JSON.stringify(gltf())),
    p = prepareScene(
      '<scene version="1.1"><project width="48" height="32" fps="8" duration="1" quality="draft"/><assets><mesh id="asset" src="static.gltf"/></assets><composition><object3D id="o" primitive="mesh" mesh="asset"/></composition></scene>',
    );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const r = new FrameRenderer(
      p.runtime.scene,
      p.runtime.tracks,
      { read: () => bytes, meshes: new Map([["asset", {}]]) },
      1,
      p.runtime,
    ),
    s = r.render(0);
  assert.ok(s.data.some((v, i) => i % 4 === 0 && v > 0.9));
  assert.ok(s.data.filter((v, i) => i % 4 === 1).every((v) => v < 0.01));
});
test("static Assimp material slots, UVs and audited textures survive the native fallback", async () => {
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 2, height: 2 });
  png.data.set([
    255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255,
  ]);
  const bytes = PNG.sync.write(png);
  const g = {
    rootnode: {
      transformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      meshes: [0],
    },
    meshes: [
      {
        vertices: [-10, -10, 0, 10, -10, 0, 10, 10, 0, -10, 10, 0],
        faces: [[0, 3, 2, 1]],
        texturecoords: [[0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]],
        materialindex: 0,
      },
    ],
    materials: [
      {
        properties: [
          { key: "$clr.diffuse", value: [0, 0, 0] },
          { key: "$clr.emissive", value: [1, 1, 1] },
          { key: "$tex.file", semantic: 4, value: "texture.png" },
        ],
      },
    ],
  };
  const p = prepareScene(
    '<scene version="1.1"><project width="48" height="32" fps="8" duration="1" quality="draft"/><assets><mesh id="asset" src="mesh.dae"/></assets><composition><object3D id="o" primitive="mesh" mesh="asset"/></composition></scene>',
  );
  assert.ok(p.ok, JSON.stringify(p.diagnostics));
  const s = new FrameRenderer(
    p.runtime.scene,
    p.runtime.tracks,
    {
      read: (src) => {
        assert.equal(src, "texture.png");
        return bytes;
      },
      meshes: new Map([["asset", g]]),
    },
    1,
    p.runtime,
  ).render(0);
  assert.ok(s.data.some((v, i) => i % 4 === 0 && v > 0.5));
  assert.ok(s.data.some((v, i) => i % 4 === 1 && v > 0.5));
});
test("static USD material bindings and indexed UV primvars retain their image colours", async () => {
  const { importMesh } = await import("../src/media/mesh.js"),
    { PNG } = await import("pngjs"),
    dir = mkdtempSync(join(tmpdir(), "batch5-usd-"));
  try {
    const png = new PNG({ width: 2, height: 2 });
    png.data.set([
      255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    ]);
    writeFileSync(join(dir, "check.png"), PNG.sync.write(png));
    const usd = `#usda 1.0
(
 upAxis = "Z"
 metersPerUnit = 1
)
def Xform "Root" {
 def Mesh "Quad" {
  point3f[] points = [(-10,-10,0),(10,-10,0),(10,10,0),(-10,10,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0,3,2,1]
  uniform token subdivisionScheme = "none"
  texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)] (interpolation = "vertex")
  rel material:binding = </Root/Material>
 }
 def Material "Material" {
  token outputs:surface.connect = </Root/Material/Surface.outputs:surface>
  def Shader "Surface" {
   uniform token info:id = "UsdPreviewSurface"
   color3f inputs:diffuseColor = (0,0,0)
   color3f inputs:emissiveColor.connect = </Root/Material/Texture.outputs:rgb>
   token outputs:surface
  }
  def Shader "Texture" {
   uniform token info:id = "UsdUVTexture"
   asset inputs:file = @check.png@
   float2 inputs:st.connect = </Root/Material/UV.outputs:result>
   float3 outputs:rgb
  }
  def Shader "UV" {
   uniform token info:id = "UsdPrimvarReader_float2"
   token inputs:varname = "st"
   float2 outputs:result
  }
 }
}`;
    const file = join(dir, "mesh.usda");
    writeFileSync(file, usd);
    const read = (src) => readFileSync(join(dir, src)),
      g = await importMesh("mesh.usda", read("mesh.usda"), read, file);
    const p = prepareScene(
      '<scene version="1.1"><project width="48" height="32" fps="8" duration="1" quality="draft"/><assets><mesh id="asset" src="mesh.usda"/></assets><composition><object3D id="o" primitive="mesh" mesh="asset"/></composition></scene>',
    );
    assert.ok(p.ok, JSON.stringify(p.diagnostics));
    const r = new FrameRenderer(
        p.runtime.scene,
        p.runtime.tracks,
        {
          read,
          meshes: new Map([["asset", g]]),
          meshDependencies: new Map([
            ["asset", g.dependencies.map((src) => ({ src }))],
          ]),
        },
        1,
        p.runtime,
      ),
      s = r.render(0);
    assert.ok(s.data.some((v, i) => i % 4 === 0 && v > 0.5));
    assert.ok(s.data.some((v, i) => i % 4 === 1 && v > 0.5));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
