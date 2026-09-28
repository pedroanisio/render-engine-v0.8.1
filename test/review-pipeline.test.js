import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { renderEpisode } from "../src/render/pipeline.js";
import { outputLock } from "../src/render/output-lock.js";
import { processRun } from "../src/render/process.js";
import { createRenderer } from "../src/render/setup.js";
import { encodePng } from "../src/render/image.js";
import { Surface } from "../src/render/surface.js";

const ROOT = mkdtempSync(join(tmpdir(), "scene-review-pipeline-"));

/** @param {string} name */
function fresh(name) {
  const dir = join(ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "a"), { recursive: true });
  return dir;
}

/** @param {string} dir @param {string} file @param {number[]} rgba */
function plate(dir, file, rgba) {
  const img = new Surface(8, 8);
  img.fillRect(0, 0, 8, 8, rgba, img.bounds());
  writeFileSync(join(dir, "a", file), encodePng(img));
}

/** @param {string} file */
function frameCount(file) {
  const p = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-count_frames", "-show_streams", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  return Number(
    p.streams.find((/** @type {any} */ s) => s.codec_type === "video")
      .nb_read_frames,
  );
}

/** @param {{outputs:string,body?:string,assets?:string,fps?:number,sections?:string}} s */
function scene(s) {
  return `<scene version="1.1">
  <project width="16" height="8" fps="${s.fps ?? 4}" duration="2" background="#00000000"/>
  ${s.sections ?? ""}
  ${s.outputs}
  <assets><image id="plate" src="a/plate.png" width="8" height="8"/>${s.assets ?? ""}</assets>
  <composition>
    <group id="s1" start="0" end="1"><layer id="p1" asset="plate" x="0" y="0"/></group>
    <group id="s2" start="1" end="2">${s.body ?? '<shape id="r" shape="rect" x="0" y="0" width="8" height="8" fill="#FF000080"/>'}</group>
  </composition>
</scene>`;
}

const MKV = 'codec="ffv1" container="mkv" audio="false" width="16" height="8"';

test("segment keys include the selected output's attributes", async () => {
  const dir = fresh("outputs");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 0.5]);
  writeFileSync(
    join(dir, "scene.xml"),
    scene({
      outputs: `<output id="opaque" path="out/opaque.mkv" ${MKV}/>
  <output id="alpha" path="out/alpha.mkv" ${MKV} alpha="true"/>`,
    }),
  );
  const r = await renderEpisode({
    sceneFile: join(dir, "scene.xml"),
    outputId: "*",
    threads: 1,
  });
  const [opaque, alpha] = /** @type {any[]} */ (r.outputs);
  assert.equal(opaque.rendered, 2);
  // Before the fix the alpha output reused the opaque output's segments.
  assert.equal(alpha.rendered, 2);
  assert.equal(alpha.cached, 0);
  const again = await renderEpisode({
    sceneFile: join(dir, "scene.xml"),
    outputId: "alpha",
    threads: 1,
  });
  assert.deepEqual([again.rendered, again.cached], [0, 2]);
});

test("particle sprites and emitter images are part of their segment's key", async () => {
  const dir = fresh("particles");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 1]);
  plate(dir, "spark.png", [1, 1, 1, 1]);
  plate(dir, "mask.png", [1, 1, 1, 1]);
  const file = join(dir, "scene.xml");
  writeFileSync(
    file,
    scene({
      outputs: `<output id="main" path="out/p.mkv" ${MKV}/>`,
      assets:
        '<image id="spark" src="a/spark.png" width="8" height="8"/><image id="mask" src="a/mask.png" width="8" height="8"/>',
      body: '<particleEmitter id="pe" x="8" y="4" rate="0" speed="0" direction="0" lifetime="2" size="4" shape="sprite" sprite="spark" emitterShape="asset-alpha" emitterAsset="mask" emitterWidth="8" emitterHeight="8"><burst time="1" count="3"/></particleEmitter>',
    }),
  );
  const first = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.equal(first.rendered, 2);
  plate(dir, "spark.png", [0, 1, 0, 1]);
  const sprite = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.deepEqual([sprite.rendered, sprite.cached], [1, 1]);
  plate(dir, "mask.png", [1, 1, 1, 0.5]);
  const mask = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.deepEqual([mask.rendered, mask.cached], [1, 1]);
});

test("a track matte from another shot keys the segment that uses it", async () => {
  const dir = fresh("matte");
  plate(dir, "plate.png", [1, 1, 1, 1]);
  const file = join(dir, "scene.xml");
  writeFileSync(
    file,
    scene({
      outputs: `<output id="main" path="out/m.mkv" ${MKV}/>`,
      body: '<shape id="r" shape="rect" x="0" y="0" width="8" height="8" fill="#FF0000" matte="p1" matteVisible="true"/>',
    }),
  );
  const first = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.equal(first.rendered, 2);
  plate(dir, "plate.png", [1, 1, 1, 0.25]);
  const again = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.deepEqual([again.rendered, again.cached], [2, 0]);
});

test("caption sidecars never overwrite extensionless outputs or rename dotted directories", async () => {
  const dir = fresh("sidecar");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 1]);
  const file = join(dir, "scene.xml");
  writeFileSync(
    file,
    scene({
      outputs: `<output id="main" path="out.v1/episode" ${MKV}/>`,
    }).replace(
      "</scene>",
      '<captions><captionTrack id="cc" language="en" mode="sidecar" format="vtt"><cue start="0.5" end="1.5" text="Hi"/></captionTrack></captions>\n</scene>',
    ),
  );
  const r = await renderEpisode({ sceneFile: file, threads: 1 });
  assert.equal(r.video, join(dir, "out.v1", "episode"));
  assert.deepEqual(r.captions, [join(dir, "out.v1", "episode.cc.en.vtt")]);
  assert.equal(frameCount(r.video), 8);
  assert.match(readFileSync(r.captions[0], "utf8"), /^WEBVTT/);
  assert.ok(!existsSync(join(dir, "out.cc.en.vtt")));
});

test("list parameters reach shards intact", async () => {
  const dir = fresh("params");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 1]);
  const file = join(dir, "scene.xml");
  writeFileSync(
    file,
    scene({
      sections:
        '<parameters><param id="items" type="list" default="[1]"/><param id="w" type="number" default="2"/></parameters>',
      outputs: `<output id="main" path="out/l.mkv" ${MKV}/>`,
      body: `<repeat id="rp" over="items" offsetX="4"><shape id="r" shape="rect" x="0" y="0" width="2" height="2" fill="#FF0000"><expression property="height">param('item')</expression></shape></repeat>`,
    }),
  );
  const parameters = { items: [2, 4, 8], w: 3 };
  const r = await renderEpisode({ sceneFile: file, jobs: 2, parameters });
  // The shards rendered with exactly the parent's parameters, so assembly is all cache.
  assert.deepEqual([r.rendered, r.cached], [0, 2]);
});

test("time-to-frame range rounding snaps float round trips", async () => {
  const dir = fresh("range");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 1]);
  const file = join(dir, "scene.xml");
  writeFileSync(
    file,
    scene({ fps: 25, outputs: `<output id="main" path="out/r.mkv" ${MKV}/>` }),
  );
  // 0.28 * 25 === 7.000000000000001: the range starts at frame 7, not 8.
  const r = await renderEpisode({
    sceneFile: file,
    from: 0.28,
    threads: 1,
    work: join(dir, "w"),
  });
  assert.equal(frameCount(r.video), 50 - 7);
});

test("frame workers build from the pipeline's scene snapshot, not the disk", async () => {
  const dir = fresh("snapshot");
  plate(dir, "plate.png", [0.2, 0.4, 0.6, 1]);
  writeFileSync(join(dir, "data.json"), JSON.stringify([{ items: [1, 2] }]));
  const file = join(dir, "scene.xml");
  const xml = scene({
    outputs: `<output id="main" path="out/s.mkv" ${MKV}/>`,
    sections:
      '<parameters><param id="items" type="list" default="[1]"/><data id="d" src="data.json" format="json"/></parameters>',
  });
  writeFileSync(file, xml);
  const main = await createRenderer({ sceneFile: file, data: "d", row: 0 });
  main.media.close();
  assert.deepEqual(Object.keys(main.reads), ["data.json"]);
  // The disk changes after hashing; a worker must still see the hashed inputs.
  writeFileSync(file, xml.replace('duration="2"', 'duration="3"'));
  writeFileSync(join(dir, "data.json"), "[]");
  const worker = await createRenderer(
    { sceneFile: file, data: "d", row: 0 },
    { sceneBytes: new Uint8Array(main.sceneBytes), reads: { ...main.reads } },
  );
  worker.media.close();
  assert.equal(worker.duration, 2);
  assert.deepEqual(worker.runtime.params.items, [1, 2]);
  await assert.rejects(
    createRenderer(
      { sceneFile: file, data: "d", row: 0 },
      { sceneBytes: main.sceneBytes, reads: {} },
    ),
    /scene input data.json was not read by the pipeline/,
  );
  // A threaded render (workers fed the snapshot) matches the serial render.
  // (Data rows are left out: the audio worker cannot read <data> files yet.)
  writeFileSync(file, xml.replace(/<data [^>]*\/>/, ""));
  const serial = await renderEpisode({
    sceneFile: file,
    threads: 1,
  });
  const threaded = await renderEpisode({
    sceneFile: file,
    threads: 2,
    work: join(dir, "w2"),
  });
  assert.equal(serial.rendered, 2);
  assert.equal(threaded.rendered, 2);
  const digests = (/** @type {string} */ w) =>
    readdirSync(join(w, "segments"))
      .filter((f) => f.endsWith(".sha256"))
      .map((f) => readFileSync(join(w, "segments", f), "utf8"))
      .sort();
  assert.deepEqual(
    digests(join(dir, "_tmp", "render")),
    digests(join(dir, "w2")),
  );
});

test("output locks: release is tolerant and only removes its own lock", () => {
  const dir = fresh("lock");
  const target = join(dir, "out.mp4");
  const lock = target + ".render-lock";
  const release = outputLock(target);
  assert.throws(() => outputLock(target), /already being rendered/);
  rmSync(lock);
  assert.doesNotThrow(release); // ENOENT is not an error
  const other = outputLock(target);
  writeFileSync(lock, JSON.stringify({ pid: process.pid, token: "someone" }));
  release();
  assert.ok(existsSync(lock));
  other(); // no longer ours either
  assert.ok(existsSync(lock));
  rmSync(lock);
});

test("output locks: dead owners and old ownerless locks are recovered", () => {
  const dir = fresh("stale");
  const target = join(dir, "out.mp4");
  const lock = target + ".render-lock";
  // A PID that cannot exist.
  writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, token: "x" }));
  outputLock(target)();
  assert.ok(!existsSync(lock));
  // A crash between create and write leaves an empty lock: busy while young...
  writeFileSync(lock, "");
  assert.throws(() => outputLock(target), /already being rendered/);
  // ...recoverable once older than the grace period.
  const old = new Date(Date.now() - 60000);
  utimesSync(lock, old, old);
  outputLock(target)();
  writeFileSync(lock, '{"pid":"nope"}');
  assert.throws(() => outputLock(target), /already being rendered/);
  outputLock(target, { grace: -1 })();
  assert.ok(!existsSync(lock));
  // A live owner we may not signal (EPERM, e.g. init as non-root) is respected.
  if (process.getuid?.() !== 0) {
    writeFileSync(lock, JSON.stringify({ pid: 1, token: "init" }));
    assert.throws(() => outputLock(target), /already being rendered/);
  }
  // A live owner (this process) is respected.
  writeFileSync(lock, JSON.stringify({ pid: process.pid, token: "live" }));
  assert.throws(() => outputLock(target), /already being rendered/);
  rmSync(lock);
});

test("output locks: concurrent recovery is serialised by the reaper lock", () => {
  const dir = fresh("reap");
  const target = join(dir, "out.mp4");
  const lock = target + ".render-lock";
  const reaper = lock + ".reap";
  writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, token: "x" }));
  // Another process is recovering: back off and leave the lock alone.
  writeFileSync(reaper, "");
  assert.throws(() => outputLock(target), /already being rendered/);
  assert.ok(existsSync(lock));
  // A reaper that crashed long ago is cleared, then recovery proceeds.
  const old = new Date(Date.now() - 60000);
  utimesSync(reaper, old, old);
  assert.throws(() => outputLock(target), /already being rendered/);
  assert.ok(!existsSync(reaper));
  outputLock(target)();
  assert.ok(!existsSync(lock));
  assert.ok(!existsSync(reaper));
});

test("processRun applies a timeout only when one is given", async () => {
  await assert.rejects(
    processRun("sleep", ["5"], { timeout: 50 }),
    /sleep exited null/,
  );
  assert.equal(await processRun("echo", ["done"]), "done\n");
});
