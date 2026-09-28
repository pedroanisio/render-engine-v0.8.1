import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { renderEpisode } from "../src/render/pipeline.js";
import { loadScene, compileRuntime, prepareScene } from "../src/index.js";
import { FrameRenderer } from "../src/render/frame.js";
import { main, parseRenderArgs } from "../src/cli.js";
const xml = (shape, other = "") =>
  `<scene version="1.1"><project width="16" height="16" duration="1" fps="4"/><composition>${shape}</composition>${other}</scene>`;
test("animated z and effect strength are consumed by the raster backend", () => {
  const loaded = loadScene(
    xml(
      '<shape id="red" shape="rect" width="16" height="16" fill="#FF0000"><animate property="z"><key time="0" value="0"/><key time="1" value="2"/></animate></shape><shape id="blue" shape="rect" width="16" height="16" fill="#0000FF" z="1"/>',
    ),
  );
  assert.ok(loaded.ok);
  const r = compileRuntime(loaded.scene),
    renderer = new FrameRenderer(
      r.scene,
      r.tracks,
      { read: () => new Uint8Array() },
      1,
      r,
    );
  assert.deepEqual([...renderer.render(0).toRgb8().slice(0, 3)], [0, 0, 255]);
  assert.deepEqual(
    [...renderer.render(0.75).toRgb8().slice(0, 3)],
    [255, 0, 0],
  );
  const effect = loadScene(
    xml(
      '<shape id="s" shape="rect" width="16" height="16" fill="#808080" effects="fx"/>',
      '<effects><effect id="fx" type="film-grain"><animate property="amount"><key time="0" value="0"/><key time="1" value="1"/></animate></effect></effects>',
    ),
  );
  assert.ok(effect.ok);
  const e = compileRuntime(effect.scene),
    f = new FrameRenderer(
      e.scene,
      e.tracks,
      { read: () => new Uint8Array() },
      1,
      e,
    );
  assert.notDeepEqual(f.render(0).toRgb8(), f.render(0.5).toRgb8());
});
test("operational API and CLI distinguish schema validity, runtime rules and backend capabilities", () => {
  const valid = xml('<shape id="s" shape="rect" width="1" height="1"/>');
  assert.equal(prepareScene(valid).ok, true);
  assert.equal(prepareScene("<bad/>").ok, false);
  assert.match(
    prepareScene(valid.replace('version="1.1"', 'version="1.0"')).diagnostics[0]
      .message,
    /requires scene version/,
  );
  const no = valid.replace('shape="rect"', 'shape="path"');
  assert.ok(
    prepareScene(no).diagnostics.some((d) => d.code === "E_RUNTIME_CAPABILITY"),
  );
  const lines = [],
    io = {
      readFile: () => valid,
      readBytes: () => new Uint8Array(),
      stdout: (s) => lines.push(s),
      stderr: (s) => lines.push(s),
    };
  assert.equal(main(["preflight", "--json", "scene.xml"], io), 0);
  assert.equal(JSON.parse(lines.at(-1)).valid, true);
  assert.equal(main(["preflight", "scene.xml"], io), 0);
  assert.match(lines.at(-1), /renderable/);
  assert.equal(
    main(["preflight", "scene.xml"], { ...io, readFile: () => no }),
    1,
  );
  assert.deepEqual(
    parseRenderArgs([
      "scene.xml",
      "--param",
      "p=3",
      "--variant",
      "v",
      "--data",
      "d",
      "--row",
      "2",
    ]).options,
    {
      sceneFile: "scene.xml",
      parameters: { p: "3" },
      variant: "v",
      data: "d",
      row: 2,
    },
  );
  assert.equal(parseRenderArgs(["scene.xml", "--param", "bad"]).ok, false);
  assert.equal(parseRenderArgs(["scene.xml", "--row", "-1"]).ok, false);
});
test("full pipeline applies variants, marker placements, expressions and audio automation, with distinct cache keys", async () => {
  const dir = mkdtempSync(join(tmpdir(), "batch1-render-"));
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=f=400:r=48000:d=1",
      "-ac",
      "1",
      join(dir, "source.wav"),
    ]);
    const source = `<scene version="1.1"><project width="16" height="16" duration="1" fps="4"/><parameters><param id="amount" type="number" default="2"/><bind param="amount" target="s" property="x"/><variant id="v"><set param="amount" value="4"/></variant></parameters><output id="o" path="out.mp4" codec="h264" container="mp4" variant="v" preset="ultrafast"/><assets><audio id="a" src="source.wav" duration="1" channels="1"/></assets><markers><marker id="m" time="0.25"/></markers><composition><shape id="s" shape="rect" width="4" height="4" fill="#FF0000" startMarker="m"><expression property="y">time*4</expression></shape></composition><audioMix><audioTrack id="t" asset="a" startMarker="m"><animate property="volume"><key time="0" value="0"/><key time="1" value="0.5"/></animate></audioTrack></audioMix></scene>`;
    const path = join(dir, "scene.xml");
    writeFileSync(path, source);
    const first = await renderEpisode({ sceneFile: path });
    assert.ok(existsSync(first.video));
    assert.ok(!readdirSync(join(dir, "_tmp/render")).some(name => name.startsWith("run-")));
    assert.ok(JSON.parse(readFileSync(first.video + ".assets.json", "utf8")).audio);
    const again = await renderEpisode({ sceneFile: path });
    assert.equal(again.rendered, 0);
    assert.ok(again.cached > 0);
    const changed = await renderEpisode({
      sceneFile: path,
      parameters: { amount: 8 },
    });
    assert.ok(changed.rendered > 0);
    const pcm = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      changed.video,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ]);
    let early = 0,
      late = 0;
    for (let i = 0; i < 4800; i++) early += Math.abs(pcm.readFloatLE(i * 4));
    for (let i = 24000; i < 28800; i++)
      late += Math.abs(pcm.readFloatLE(i * 4));
    assert.ok(late > early * 10 + 1);
    const bad = source.replace('shape="rect"', 'shape="path"');
    writeFileSync(path, bad);
    const work = join(dir, "rejected");
    await assert.rejects(
      renderEpisode({ sceneFile: path, work }),
      /unsupported features/,
    );
    assert.equal(existsSync(work), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
