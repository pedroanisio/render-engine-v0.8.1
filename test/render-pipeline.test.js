import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { renderEpisode } from "../src/render/pipeline.js";
import { encodePng } from "../src/render/image.js";
import { Surface } from "../src/render/surface.js";

const DIR = mkdtempSync(join(tmpdir(), "scene-pipeline-test-")) + "/";

function probe(file) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
}

function setup({ invalidGeometry = false } = {}) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(`${DIR}a`, { recursive: true });
  const img = new Surface(32, 16);
  img.fillRect(0, 0, 32, 16, [0.2, 0.2, 0.2, 1], img.bounds());
  writeFileSync(`${DIR}a/plate.png`, encodePng(img));
  copyFileSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    `${DIR}a/font.ttf`,
  );
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=300:r=48000:d=1",
    "-ac",
    "1",
    "-c:a",
    "pcm_s24le",
    `${DIR}a/line.wav`,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=120:r=48000:d=2",
    "-ac",
    "2",
    "-c:a",
    "pcm_s24le",
    `${DIR}a/music.wav`,
  ]);
  writeFileSync(
    `${DIR}scene.xml`,
    `<scene version="1.1">
  <project width="32" height="16" fps="4" duration="2" background="#000000FF"/>
  <styles><textStyle id="st" fontAsset="f" size="6" color="#FFFFFF"/></styles>
  <output id="main" path="out/ep.mp4" codec="h264" container="mp4" width="32" height="16" fps="4" crf="30" preset="ultrafast" captions="cc">
    <poster time="0.5" path="out/poster.png" format="png" width="16"/></output>
  <assets><image id="plate" src="a/plate.png" width="32" height="16"/><font id="f" src="a/font.ttf" family="D"/>
    <text id="t" text="Hi" width="32" height="16" size="6" style="st"/>
    <audio id="line" src="a/line.wav" duration="1" sampleRate="48000" channels="1"/>
    <audio id="music" src="a/music.wav" duration="2" sampleRate="48000" channels="2"/></assets>
  <composition>
    <group id="s1" start="0" end="1"><layer id="p1" asset="plate" x="0" y="0"/><layer id="t1" asset="t" x="0" y="0"/></group>
    <group id="s2" start="1" end="2"><shape id="r" shape="${invalidGeometry ? "path" : "rect"}" x="0" y="0" width="32" height="16" fill="#FF0000"/></group>
  </composition>
  <audioMix><bus id="dia"/><bus id="mus" gain="-10" duckUnder="dia"/><master normalize="integrated" loudness="-16" truePeak="-1" limiter="true"/>
    <audioTrack id="a1" asset="line" start="0.5" clipIn="0" clipOut="1" bus="dia"/>
    <audioTrack id="a2" asset="music" start="0" clipIn="0" clipOut="2" bus="mus"/></audioMix>
  <captions><captionTrack id="cc" language="en" mode="sidecar" format="vtt"><cue start="0.5" end="1.5" text="Hi"/></captionTrack></captions>
</scene>`,
  );
}

test("renders an episode end to end, then resumes from finished segments", async () => {
  setup();
  const logs = [];
  const r = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    log: (l) => logs.push(l),
  });
  assert.equal(r.rendered, 2);
  const p = probe(r.video);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  assert.deepEqual(
    [v.codec_name, v.width, v.height, v.nb_read_frames, v.pix_fmt],
    ["h264", 32, 16, "8", "yuv420p"],
  );
  assert.equal(a.codec_name, "aac");
  assert.ok(Math.abs(Number(p.format.duration) - 2) < 0.1);
  assert.equal(
    readFileSync(r.captions[0], "utf8"),
    "WEBVTT\n\n1\n00:00:00.500 --> 00:00:01.500\nHi\n",
  );
  assert.ok(existsSync(r.posters[0]));
  const again = await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  assert.equal(again.rendered, 0);
  assert.equal(again.cached, 2);
  const part = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    from: 1,
    to: 2,
    outputId: "main",
    scale: 1,
    work: `${DIR}w2`,
  });
  assert.equal(part.rendered, 1);
  assert.match(part.video, /partial\.mp4$/);
});

test("parallel shards render disjoint segments, then the parent assembles from cache", async () => {
  setup();
  const logs = [];
  const r = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    jobs: 2,
    log: (l) => logs.push(l),
  });
  assert.equal(r.rendered, 0);
  assert.equal(r.cached, 2);
  const lines = logs.flatMap((l) => l.split("\n"));
  assert.equal(
    lines.filter((l) => /^segment \d+-\d+ rendered$/.test(l)).length,
    2,
  );
  assert.equal(
    probe(r.video).streams.find((x) => x.codec_type === "video").nb_read_frames,
    "8",
  );
  setup({ invalidGeometry: true });
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml`, jobs: 2 }),
    /shard [01]\/2: unsupported features/,
  );
});

test("available mode renders complete segments, skips the rest, and keys segments by their own images", async () => {
  setup();
  rmSync(`${DIR}a/plate.png`);
  const logs = [];
  const r = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    available: true,
    log: (l) => logs.push(l),
  });
  assert.equal(r.rendered, 1);
  assert.ok(
    logs.some((l) => /segment 0-4 skipped: missing a\/plate.png/.test(l)),
  );
  const img = new Surface(32, 16);
  writeFileSync(`${DIR}a/plate.png`, encodePng(img));
  const full = await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  assert.equal(full.rendered, 1); // only the shot that draws the plate
  assert.equal(full.cached, 1);
  const par = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    available: true,
    jobs: 2,
  });
  assert.equal(par.video, "");
});

test("refuses to render with missing assets, unknown outputs or unsupported features", async () => {
  setup();
  rmSync(`${DIR}a/plate.png`);
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml` }),
    /1 asset files are missing, e.g. a\/plate.png/,
  );
  setup();
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml`, outputId: "nope" }),
    /no <output> with id nope/,
  );
  setup({ invalidGeometry: true });
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml` }),
    /unsupported features: path shape requires @path/,
  );
  writeFileSync(`${DIR}scene.xml`, "<scene/>");
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml` }),
    /scene is invalid/,
  );
});

test("unsupported segments never become reusable after a failed render", async () => {
  setup({ invalidGeometry: true });
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      renderEpisode({ sceneFile: `${DIR}scene.xml` }),
      /unsupported features: path shape requires @path/,
    );
  }
});

test("partial exports select the same frames and rebase captions with cold and warm caches", async () => {
  setup();
  const cold = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    from: 1,
    to: 2,
  });
  assert.equal(
    probe(cold.video).streams.find((s) => s.codec_type === "video")
      .nb_read_frames,
    "4",
  );
  assert.match(
    readFileSync(cold.captions[0], "utf8"),
    /00:00:00.000 --> 00:00:00.500/,
  );
  const coldVideo = readFileSync(cold.video);
  await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  const warm = await renderEpisode({
    sceneFile: `${DIR}scene.xml`,
    from: 1,
    to: 2,
  });
  assert.equal(
    probe(warm.video).streams.find((s) => s.codec_type === "video")
      .nb_read_frames,
    "4",
  );
  assert.deepEqual(readFileSync(warm.video), coldVideo);
  await assert.rejects(
    renderEpisode({ sceneFile: `${DIR}scene.xml`, from: 3, to: 4 }),
    /no segments overlap/,
  );
});

test("font byte changes invalidate segments even when the XML is unchanged", async () => {
  setup();
  await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  copyFileSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    `${DIR}a/font.ttf`,
  );
  const r = await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  assert.equal(r.cached, 0);
  assert.equal(r.rendered, 2);
});

test("audio without clipOut renders using declared or probed asset duration", async () => {
  setup();
  let xml = readFileSync(`${DIR}scene.xml`, "utf8").replace(
    / clipOut="[^"]+"/g,
    "",
  );
  // One declared duration and one duration obtained from ffprobe.
  xml = xml.replace('src="a/line.wav" duration="1"', 'src="a/line.wav"');
  writeFileSync(`${DIR}scene.xml`, xml);
  const r = await renderEpisode({ sceneFile: `${DIR}scene.xml` });
  const a = probe(r.video).streams.find((s) => s.codec_type === "audio");
  assert.ok(Math.abs(Number(a.duration) - 2) < 0.1);
});
