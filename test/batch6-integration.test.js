import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { renderEpisode } from "../src/render/pipeline.js";
import { writeFloatWav } from "../src/render/audio.js";
const font = new URL(
  "../examples/batch5/assets/inter.woff2",
  import.meta.url,
).pathname;
function setup(extra = "", color = "#ffffff", audio = true) {
  const dir = mkdtempSync(join(tmpdir(), "b6-render-"));
  writeFileSync(join(dir, "inter.woff2"), readFileSync(font));
  writeFloatWav(
    join(dir, "tone.wav"),
    Float32Array.from(
      { length: 32000 },
      (_, i) => 0.12 * Math.sin((2 * Math.PI * 440 * i) / 16000),
    ),
    16000,
    1,
  );
  const xml = `<scene version="1.1"><project width="160" height="90" fps="8" duration="2" background="#101020"/><metadata><accessibility description="A captioned tone" requireCaptions="true" flashCheck="warn" contrastCheck="${extra || "warn"}" minContrast="4.5" ${audio ? 'audioDescription="voice"' : ""}/></metadata><styles><textStyle id="st" fontAsset="font" size="15" color="${color}"/></styles><output id="main" codec="h264" container="mp4" path="preview.mp4" width="160" height="90" fps="8" preset="ultrafast" captions="cc" audio="${audio}"/><assets><font id="font" src="inter.woff2" family="Inter"/><audio id="a" src="tone.wav"/></assets><composition/><audioMix sampleRate="16000" channels="1" channelLayout="mono" bitDepth="16"><bus id="dialogue"/><audioTrack id="voice" asset="a" role="audio-description" bus="dialogue"/><master normalize="integrated" loudness="-18" truePeak="-2" limiter="true"/></audioMix><captions><captionTrack id="cc" language="pt" mode="both" preset="boxed-line" style="st"><cue start="0" end="2" text="Áudio e legendas"/></captionTrack></captions></scene>`;
  writeFileSync(join(dir, "scene.xml"), xml);
  return { dir, xml, sceneFile: join(dir, "scene.xml") };
}
test("full B6 render contains audio and timed text, checks final AAC peaks, outputs reports, and resumes deterministically", async () => {
  const setupData = setup("error");
  const r = await renderEpisode({ sceneFile: setupData.sceneFile });
  const p = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      r.video,
    ]),
  );
  assert.deepEqual(
    p.streams.map((s) => s.codec_type),
    ["video", "audio", "subtitle"],
  );
  assert.equal(p.streams[1].sample_rate, "16000");
  assert.equal(p.streams[1].channels, 1);
  assert.equal(p.streams[2].codec_name, "mov_text");
  assert.equal(p.streams[2].tags.language,"por");
  const report = JSON.parse(readFileSync(r.video + ".assets.json"));
  assert.ok(report.audio.encoded.truePeak <= -1.95);
  assert.equal(report.audio.format.bitDepth, 16);
  const a11y = JSON.parse(readFileSync(r.video + ".accessibility.json"));
  assert.equal(a11y.passed, true);
  assert.deepEqual(a11y.findings, []);
  assert.match(readFileSync(r.captions[0], "utf8"), /Áudio e legendas/);
  const again = await renderEpisode({ sceneFile: setupData.sceneFile });
  assert.equal(again.rendered, 0);
  assert.equal(again.cached, r.rendered);
  const partial = await renderEpisode({
    sceneFile: setupData.sceneFile,
    from: 0.5,
    to: 1.5,
  });
  assert.match(
    readFileSync(partial.captions[0], "utf8"),
    /00:00:00.000 --> 00:00:01.000/,
  );
});
test("contrast error blocks final publication; warn reports findings; audio=false keeps embedded captions", async () => {
  const bad = setup("error", "#101020", false);
  await assert.rejects(
    renderEpisode({ sceneFile: bad.sceneFile }),
    /accessibility checks failed/,
  );
  assert.equal(existsSync(join(bad.dir, "preview.mp4")), false);
  assert.equal(
    JSON.parse(readFileSync(join(bad.dir, "preview.mp4.accessibility.json")))
      .passed,
    false,
  );
  writeFileSync(
    bad.sceneFile,
    bad.xml.replace('contrastCheck="error"', 'contrastCheck="warn"'),
  );
  const done = await renderEpisode({ sceneFile: bad.sceneFile });
  const p = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      done.video,
    ]),
  );
  assert.deepEqual(
    p.streams.map((s) => s.codec_type),
    ["video", "subtitle"],
  );
  assert.ok(
    JSON.parse(readFileSync(done.video + ".accessibility.json")).findings.some(
      (f) => f.check === "contrast",
    ),
  );
});
test("source caption bytes invalidate visual caches and mode=sidecar has no burned pixels", async () => {
  const data = setup("off");
  writeFileSync(
    join(data.dir, "captions.srt"),
    "1\n00:00:00,000 --> 00:00:02,000\nFIRST\n",
  );
  const xml = data.xml
    .replace('<cue start="0" end="2" text="Áudio e legendas"/>', "")
    .replace('mode="both"', 'mode="both" src="captions.srt"');
  writeFileSync(data.sceneFile, xml);
  const first = await renderEpisode({ sceneFile: data.sceneFile });
  writeFileSync(
    join(data.dir, "captions.srt"),
    "1\n00:00:00,000 --> 00:00:02,000\nSECOND\n",
  );
  const second = await renderEpisode({ sceneFile: data.sceneFile });
  assert.ok(second.rendered > 0);
  assert.match(readFileSync(second.captions[0], "utf8"), /SECOND/);
  writeFileSync(data.sceneFile, xml.replace('mode="both"', 'mode="sidecar"'));
  const side = await renderEpisode({ sceneFile: data.sceneFile });
  const image = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    side.video,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  assert.ok(image.every((v, i) => Math.abs(v - image[i % 3]) < 4));
});
