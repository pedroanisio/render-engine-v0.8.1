import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadScene, compileRuntime } from "../src/index.js";
import { destinationPlan } from "../src/render/delivery.js";
import {
  flashAnalysis,
  flashAnalysisStream,
  accessibilityRequirements,
  accessibilityReport,
} from "../src/render/accessibility.js";
import { mixAudio, writeFloatWav } from "../src/render/audio.js";
import { effect, fromBytes } from "../src/render/audio-dsp.js";
import { createAudioAnalysis } from "../src/render/audio-analysis.js";
import { captionLanguage } from "../src/render/caption-languages.js";
import { metadataFile, offsetTimecode } from "../src/render/export-metadata.js";
import { colorArguments } from "../src/render/export.js";
import { clipCaptions, toVtt } from "../src/render/captions.js";
import { timecode } from "../src/eval/clock.js";

const dir = mkdtempSync(join(tmpdir(), "review-export-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const destination = (kind, uri, credentials) => ({
  name: "destination",
  attributes: { kind, uri, ...(credentials ? { credentials } : {}) },
  children: [],
});

test("credential headers are only sent to a destination bound by the profile", () => {
  const uri = "https://attacker.example/upload";
  const env = (profile) => ({
    SCENE_RENDER_PROFILE_p: JSON.stringify(profile),
  });
  for (const kind of ["http-put", "webhook"])
    assert.throws(
      () =>
        destinationPlan(
          destination(kind, uri, "p"),
          env({ headers: { authorization: "secret" } }),
        ),
      /bind its destination/,
    );
  assert.equal(
    destinationPlan(
      destination("webhook", uri, "p"),
      env({ resource: uri, headers: { authorization: "secret" } }),
    ).uri,
    uri,
  );
  assert.equal(
    destinationPlan(
      destination("http-put", uri, "p"),
      env({
        origin: "https://attacker.example",
        headers: { authorization: "secret" },
      }),
    ).uri,
    uri,
  );
  assert.throws(
    () =>
      destinationPlan(
        destination("http-put", uri, "p"),
        env({
          origin: "https://trusted.example",
          headers: { authorization: "secret" },
        }),
      ),
    /bind/,
  );
  // Header-free profiles and profiles carrying their own URL are unchanged.
  assert.equal(
    destinationPlan(destination("http-put", uri, "p"), env({ headers: {} }))
      .uri,
    uri,
  );
  assert.equal(
    destinationPlan(
      destination("http-put", uri, "p"),
      env({ url: uri, headers: { authorization: "secret" } }),
    ).uri,
    uri,
  );
});

test("flash analysis streams the decode frame by frame with identical results", async () => {
  const video = join(dir, "flash.mkv");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=32x18:r=24:d=2,geq=lum='if(mod(floor(N/2),2),235,16)':cb=128:cr=128",
    "-c:v",
    "ffv1",
    video,
  ]);
  const whole = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      video,
      "-vf",
      "scale=16:9:flags=area",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 1 << 26 },
  );
  const reference = flashAnalysis(whole, 16, 9, 24),
    streamed = await flashAnalysisStream(video, 16, 9, 24);
  assert.equal(streamed.frames, 48);
  assert.ok(streamed.findings.length > 0);
  assert.deepEqual(streamed, reference);
  await assert.rejects(
    flashAnalysisStream(join(dir, "missing.mkv"), 16, 9, 24),
    /decode failed/,
  );
  const report = await accessibilityReport(
    video,
    /** @type {any} */ ({ width: 32, height: 18 }),
    {
      description: "",
      audioDescription: null,
      requireCaptions: false,
      flashCheck: "error",
      contrastCheck: "off",
      minContrast: 4.5,
    },
    0,
    2,
    24,
  );
  assert.equal(report.flash.frames, 48);
  assert.equal(report.passed, false);
  assert.equal(report.findings[0].check, "flash");
});

test("audio clips are trimmed in FFmpeg on output samples, bit-identical to a full decode", () => {
  const source = join(dir, "long.wav");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=330:r=44100:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=f=550:r=44100:d=3",
    "-filter_complex",
    "amerge",
    "-c:a",
    "pcm_s16le",
    source,
  ]);
  const full = fromBytes(
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        source,
        "-ar",
        "8000",
        "-ac",
        "1",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { maxBuffer: 1 << 26 },
    ),
  );
  const mix = (attributes, duration = 3) => {
    const r = loadScene(
      `<scene version="1.1"><project width="8" height="8" duration="3" fps="24"/><assets><audio id="a" src="long.wav"/></assets><composition/><audioMix sampleRate="8000" channels="1"><audioTrack id="t" asset="a" ${attributes}/></audioMix></scene>`,
    );
    assert.ok(r.ok, JSON.stringify(r.diagnostics));
    return mixAudio(r.scene, () => ({ path: source }), duration).pcm;
  };
  const trimmed = mix('clipIn="1.23456" clipOut="2.5"');
  const first = Math.round(1.23456 * 8000),
    last = Math.round(2.5 * 8000);
  assert.deepEqual(
    trimmed.subarray(0, last - first),
    full.subarray(first, last),
  );
  assert.ok(trimmed.subarray(last - first).every((v) => v === 0));
  assert.deepEqual(
    mix('clipIn="2"').subarray(0, full.length - 16000),
    full.subarray(16000),
  );
  // A clip that rounds to zero samples is silent; clipIn past the end is invalid.
  assert.ok(mix('clipIn="1" clipOut="1.00001"').every((v) => v === 0));
  assert.throws(() => mix('clipIn="10"'), /invalid audio trim/);
  assert.throws(() => mix('clipIn="1" clipOut="0.5"'), /invalid audio trim/);
});

test("audio analysis decodes only the clip window and matches the whole-source RMS", () => {
  const signal = Float32Array.from(
    { length: 48000 * 2 },
    (_, i) => (i < 48000 ? 0.1 : 0.4) * Math.sin(i / 7),
  );
  writeFloatWav(join(dir, "levels.wav"), signal, 48000, 1);
  const r = loadScene(
    '<scene version="1.1"><project width="2" height="2" duration="2" fps="30"/><assets><audio id="a" src="levels.wav"/></assets><composition/><audioMix><audioTrack id="t" asset="a" start="0.5" clipIn="1" clipOut="1.5"/></audioMix></scene>',
  );
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const rms = createAudioAnalysis(compileRuntime(r.scene).scene, dir);
  const expected = (end) => {
    let sum = 0;
    for (let i = end - 1024; i < end; i++) sum += Number(signal[i]) ** 2;
    return Math.sqrt(sum / 1024);
  };
  // time 0.5 → source 1.0: the window straddles the level change before clipIn.
  for (const time of [0.5, 0.52, 0.9])
    assert.ok(
      Math.abs(
        rms("t", time, "all") - expected(Math.floor((time + 0.5) * 48000)),
      ) < 1e-6,
    );
  assert.equal(rms("t", 1.0, "all"), 0);
  assert.ok(Math.abs(rms("a", 0.5, "all") - expected(24000)) < 1e-6);
  assert.equal(rms("a", 3, "all"), 0);
});

test("gate opens on attack and closes on release; compressor keeps attack on gain reduction", () => {
  const rate = 8000,
    ctrl = (n, k, t, f) => Number(n.attributes[k] ?? f),
    gate = (attack, release, input) =>
      effect(
        input,
        {
          name: "audioEffect",
          type: "audioEffectType",
          attributes: {
            type: "gate",
            threshold: -20,
            ratio: 10,
            knee: 0,
            attack,
            release,
          },
          children: [],
          path: "",
        },
        rate,
        1,
        ctrl,
      );
  const loudThenQuiet = Float32Array.from({ length: rate * 3 }, (_, i) =>
      i < rate * 2 ? 0.5 : 0.01,
    ),
    quietThenLoud = Float32Array.from({ length: rate * 2 }, (_, i) =>
      i < rate ? 0.01 : 0.5,
    );
  const at = (out, input, t) =>
    out[Math.round(t * rate)] / input[Math.round(t * rate)];
  // Short release: the gate closes within 20 ms even with a slow attack.
  assert.ok(at(gate(0.2, 0.001, loudThenQuiet), loudThenQuiet, 2.02) < 0.05);
  // Slow release: still mostly open 20 ms after the drop.
  assert.ok(at(gate(0.001, 0.2, loudThenQuiet), loudThenQuiet, 2.02) > 0.5);
  // Short attack: opens within 20 ms even with a slow release.
  assert.ok(at(gate(0.001, 0.2, quietThenLoud), quietThenLoud, 1.02) > 0.9);
  const compressor = (attack, release) =>
    effect(
      quietThenLoud,
      {
        name: "audioEffect",
        type: "audioEffectType",
        attributes: {
          type: "compressor",
          threshold: -20,
          ratio: 10,
          knee: 0,
          attack,
          release,
        },
        children: [],
        path: "",
      },
      rate,
      1,
      ctrl,
    );
  // Compressor reduction (falling gain) follows attack.
  assert.ok(
    compressor(0.0005, 0.5)[rate + 80] < compressor(0.5, 0.0005)[rate + 80],
  );
});

test("caption languages map ISO 639-1 to ISO 639-2/T; MOV uses bibliographic codes", () => {
  for (const [tag, code] of Object.entries({
    ro: "ron",
    "nl-NL": "nld",
    is: "isl",
    et: "est",
    sa: "san",
    mn: "mon",
    dz: "dzo",
    om: "orm",
    ff: "ful",
    ik: "ipk",
    iu: "iku",
    ku: "kur",
    kg: "kon",
    oj: "oji",
    ps: "pus",
    sc: "srd",
    tl: "tgl",
    iw: "heb",
    "pt-BR": "por",
    dut: "nld",
    ger: "deu",
    yue: "yue",
    "": "und",
    x: "und",
  }))
    assert.equal(captionLanguage(tag), code, tag);
  assert.equal(captionLanguage("de", "mov"), "ger");
  assert.equal(captionLanguage("nl", "mov"), "dut");
  assert.equal(captionLanguage("en", "mov"), "eng");
  assert.equal(captionLanguage("de", "mp4"), "deu");
});

test("only chapter markers become chapters, ending at the next chapter", () => {
  const r = loadScene(
    '<scene version="1.1"><project width="2" height="2" duration="10" fps="25"/><markers><marker id="intro" time="0" kind="chapter" label="Intro"/><marker id="cue" time="2"/><marker id="beat" time="3" kind="beat"/><marker id="main" time="5" kind="chapter" label="Main"/><marker id="note" time="7" kind="comment"/></markers><composition/></scene>',
  );
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const file = metadataFile(r.scene, 1, 9, join(dir, "meta.txt")),
    text = readFileSync(file, "utf8");
  assert.equal(text.match(/\[CHAPTER\]/g)?.length, 2);
  assert.match(text, /START=0\nEND=4000\ntitle=Intro/);
  assert.match(text, /START=4000\nEND=8000\ntitle=Main/);
});

test("drop-frame timecodes rebase with DF labels and bad timecodes throw", () => {
  const fps = 30000 / 1001;
  assert.equal(offsetTimecode("00:00:59;29", 1 / fps, fps), "00:01:00;02");
  assert.equal(offsetTimecode("00:09:59;29", 1 / fps, fps), "00:10:00;00");
  assert.equal(offsetTimecode("01:00:00;00", 60, fps), "01:00:59;28");
  assert.equal(offsetTimecode("00:00:00;00", 0, 60000 / 1001), "00:00:00;00");
  assert.equal(
    offsetTimecode("01:00:00:00", 0.25, 24000 / 1001),
    "01:00:00:06",
  );
  for (let f = 0; f < 30 * 60 * 25; f += 13) {
    const label = offsetTimecode("00:00:00;00", f / fps, fps);
    assert.equal(Math.round(timecode(label, fps) * fps), f, label);
  }
  assert.throws(() => offsetTimecode("00:00:00", 0, 25), /invalid timecode/);
  assert.throws(() => offsetTimecode("00:01:00;00", 0, fps), /dropped/);
  assert.throws(() => offsetTimecode("00:00:00;00", 0, 25), /drop-frame/);
  assert.throws(() => offsetTimecode("00:00:01:00", -2, 25), /negative/);
});

test("container transfer tags follow the transfer actually encoded", () => {
  const trc = (a) => {
    const args = colorArguments(a),
      i = args.indexOf("-color_trc");
    return i < 0 ? undefined : args[i + 1];
  };
  assert.equal(trc({}), "iec61966-2-1");
  assert.equal(trc({ colorSpace: "srgb" }), "iec61966-2-1");
  assert.equal(trc({ colorSpace: "rec709" }), "bt709");
  assert.equal(trc({ colorSpace: "display-p3" }), "iec61966-2-1");
  assert.equal(trc({ colorSpace: "rec2020" }), "iec61966-2-1");
  for (const space of ["linear-srgb", "acescg", "aces2065-1", "xyz-d65", "raw"])
    assert.equal(trc({ colorSpace: space, transfer: "auto" }), "linear", space);
  assert.equal(trc({ colorSpace: "dci-p3" }), undefined);
  assert.equal(trc({ colorSpace: "acescct" }), undefined);
  assert.equal(trc({ colorSpace: "rec2020", transfer: "pq" }), "smpte2084");
  assert.equal(trc({ colorSpace: "rec2020", transfer: "gamma26" }), undefined);
  assert.equal(trc({ colorSpace: "rec2020", transfer: "slog3" }), undefined);
});

test("clipped captions keep the full cue text and line breaks", () => {
  const w = (text, start, end) => ({
    name: "word",
    type: "captionWordType",
    attributes: { text, start, end },
    children: [],
    path: "",
  });
  const track = {
    name: "captionTrack",
    type: "captionTrackType",
    attributes: { id: "cc", language: "en", mode: "both", maxCharsPerLine: 10 },
    path: "",
    children: [
      {
        name: "cue",
        type: "cueType",
        attributes: { text: "one two three four", start: 0, end: 4 },
        path: "",
        children: [
          w("one", 0, 1),
          w("two", 1, 2),
          w("three", 2, 3),
          w("four", 3, 4),
        ],
      },
    ],
  };
  const clipped = clipCaptions(track, 1.5, 4);
  assert.equal(clipped.children[0].attributes.text, "one two three four");
  assert.equal(clipped.children[0].children.length, 0);
  assert.match(
    toVtt(clipped),
    /00:00:00\.000 --> 00:00:02\.500\none two\nthree four\n/,
  );
  // A cue entirely inside the interval keeps its word timings.
  const inner = clipCaptions(track, 0, 4);
  assert.equal(inner.children[0].children.length, 4);
  assert.match(
    toVtt(inner),
    /one <00:00:01\.000>two\n<00:00:02\.000>three <00:00:03\.000>four/,
  );
});

test("requireCaptions only counts burn tracks actually burned into this output", () => {
  const cue = {
    name: "cue",
    attributes: { text: "hello", start: 0, end: 1 },
    children: [],
  };
  const tracks = [
    {
      name: "captionTrack",
      attributes: { id: "a", mode: "burn" },
      children: [cue],
    },
    {
      name: "captionTrack",
      attributes: { id: "b", mode: "burn" },
      children: [],
    },
    {
      name: "captionTrack",
      attributes: { id: "s", mode: "sidecar" },
      children: [cue],
    },
  ];
  const scene = {
    name: "scene",
    attributes: {},
    children: [
      {
        name: "metadata",
        attributes: {},
        children: [
          {
            name: "accessibility",
            attributes: { requireCaptions: true },
            children: [],
          },
        ],
      },
    ],
  };
  const mix = {
    pcm: new Float32Array(0),
    rate: 8000,
    channels: 1,
    stems: new Map(),
  };
  const check = (output, list = tracks) =>
    accessibilityRequirements(scene, list, mix, output, 0, 1);
  assert.throws(
    () => check({ burnCaptions: "b", captions: ["b"] }),
    /requireCaptions/,
  );
  assert.equal(check({ burnCaptions: "a" }).requireCaptions, true);
  assert.equal(check({}, tracks.slice(0, 2)).requireCaptions, true);
  // Sidecars are written when no captions filter applies, or when selected.
  assert.equal(check({ burnCaptions: "b" }).requireCaptions, true);
  assert.equal(
    check({ burnCaptions: "b", captions: ["s"] }).requireCaptions,
    true,
  );
  // output@captions embeds a burn-mode track even when another is burned.
  assert.equal(
    check({ burnCaptions: "b", captions: ["a"] }).requireCaptions,
    true,
  );
});

test("audio decodes stay inside the scene directory and refuse referencing demuxers", () => {
  const scene = join(dir, "confined");
  execFileSync("mkdir", ["-p", scene]);
  writeFloatWav(join(dir, "outside.wav"), new Float32Array(4800), 48000, 1);
  writeFloatWav(join(scene, "inside.wav"), new Float32Array(4800), 48000, 1);
  // A playlist that looks local but pulls an outside file into the decode.
  const list = join(scene, "list.ffconcat");
  execFileSync("sh", [
    "-c",
    `printf 'ffconcat version 1.0\\nfile %s\\n' '${join(dir, "outside.wav")}' > '${list}'`,
  ]);
  const analysis = (src) => {
    const r = loadScene(
      `<scene version="1.1"><project width="2" height="2" duration="1" fps="30"/><assets><audio id="a" src="${src}"/></assets><composition/></scene>`,
    );
    assert.ok(r.ok, JSON.stringify(r.diagnostics));
    return createAudioAnalysis(compileRuntime(r.scene).scene, scene);
  };
  assert.equal(analysis("inside.wav")("a", 0.05, "all"), 0);
  assert.throws(() => analysis("../outside.wav")("a", 0.05, "all"));
  assert.throws(() => analysis("list.ffconcat")("a", 0.05, "all"));
});
