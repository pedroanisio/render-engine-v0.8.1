import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadScene, compileRuntime } from "../src/index.js";
import {
  captionTime,
  vttTime,
  breakLines,
  parseCaptions,
  paginateTrack,
  prepareCaptions,
  clipCaptions,
  toVtt,
} from "../src/render/captions.js";
import { FrameRenderer } from "../src/render/frame.js";
import { prepareMedia } from "../src/media/manager.js";
import {
  flashAnalysis,
  accessibilityRequirements,
  accessibilityReport,
} from "../src/render/accessibility.js";
const track = (a = {}, c = []) => ({
  name: "captionTrack",
  type: "captionTrackType",
  attributes: { id: "cc", language: "en", mode: "both", ...a },
  children: c,
  path: "/cc",
});
const cue = (text, start = 0, end = 1, words = []) => ({
  name: "cue",
  type: "cueType",
  attributes: { text, start, end },
  children: words,
  path: "/cc/cue",
});
const word = (text, start, end) => ({
  name: "word",
  type: "captionWordType",
  attributes: { text, start, end },
  children: [],
  path: "/cc/cue/word",
});
const scene = (t) => ({
  name: "scene",
  attributes: {},
  children: [{ name: "captions", attributes: {}, children: [t] }],
});

test("caption formats parse timing, voices, cue position, ASS karaoke and TTML/ITT nested timing", () => {
  assert.equal(vttTime(3723.0456), "01:02:03.046");
  assert.equal(captionTime("00:00:01:15"), 1.5);
  for (const [time, value] of [
    ["100ms", 0.1],
    ["2m", 120],
    ["1h", 3600],
    ["3s", 3],
    ["30f", 1],
    ["30t", 1],
  ])
    assert.equal(captionTime(time), value);
  assert.throws(() => captionTime("bad"), /invalid/);
  for (const format of ["srt", "vtt"]) {
    const cues = parseCaptions(
      track(),
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000 line:80%\n<v Ana>Olá &amp; mundo</v>",
      format,
    );
    assert.equal(cues[0].attributes.speaker, "Ana");
    assert.equal(cues[0].attributes.text, "Olá & mundo");
    assert.equal(cues[0].attributes.position, "line:80%");
  }
  const timed = parseCaptions(
    track(),
    "00:00:00.000 --> 00:00:02.000\nhello <00:00:01.000>world",
    "vtt",
  );
  assert.equal(timed[0].children.length, 2);
  assert.equal(timed[0].children[1].attributes.start, 1);
  const ass = parseCaptions(
    track(),
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:02.00,Default,Ana,0,0,0,,{\\an8}{\\k100}hello {\\k100}world",
    "ass",
  );
  assert.equal(ass[0].children.length, 2);
  assert.equal(ass[0].attributes.position, "ass:8");
  for (const format of ["ttml", "itt"]) {
    const cues = parseCaptions(
      track(),
      '<tt xmlns="http://www.w3.org/ns/ttml"><body begin="1s"><div><p begin=".5" dur="1s">Olá<br/>mundo</p></div></body></tt>',
      format,
    );
    assert.equal(cues[0].attributes.start, 1.5);
    assert.equal(cues[0].attributes.text, "Olá\nmundo");
  }
  assert.throws(() => parseCaptions(track(), "bad", "srt"), /no cues/);
  assert.throws(() => parseCaptions(track(), "", "bad"), /unsupported/);
});
test("pagination never concatenates or discards overflow and clips every cue/word on export", () => {
  assert.deepEqual(breakLines("one two three four five", 9, 2), [
    "one two",
    "three",
    "four five",
  ]);
  const t = paginateTrack(
    track({ maxCharsPerLine: 8, maxLines: 1, maxWordsPerLine: 1 }, [
      cue("one two three four five", 0, 5),
    ]),
  );
  assert.equal(t.children.length, 5);
  assert.equal(
    t.children.map((c) => c.attributes.text).join(" "),
    "one two three four five",
  );
  assert.deepEqual(breakLines("abcdefghijk", 4, 2), ["abcd", "efgh", "ijk"]);
  assert.throws(() => breakLines("x", 0, 2), /positive/);
  const timed = track({}, [
    cue("hello world", 0, 2, [word("hello", 0, 1), word("world", 1, 2)]),
  ]);
  const clipped = clipCaptions(timed, 0.5, 1.5);
  assert.deepEqual(
    clipped.children[0].children.map((w) => [
      w.attributes.start,
      w.attributes.end,
    ]),
    [
      [0, 0.5],
      [0.5, 1],
    ],
  );
  assert.match(
    toVtt(
      track({}, [
        {
          ...cue("<hello>"),
          attributes: {
            text: "<hello>",
            start: 0,
            end: 1,
            speaker: "Ana",
            position: "line:80%",
          },
        },
      ]),
    ),
    /<v Ana>&lt;hello&gt;<\/v>/,
  );
  assert.equal(
    paginateTrack(track({ profanityFilter: true }, [cue("porra mundo")]))
      .children[0].attributes.text,
    "••••• mundo",
  );
  assert.throws(
    () => paginateTrack(track({}, [cue("x", 2, 1)])),
    /start < end/,
  );
  assert.throws(
    () => paginateTrack(track({}, [cue("x", 0, 1, [word("x", 0, 2)])])),
    /outside/,
  );
});
test("transcription caches verify identity and SHA-256; imports are deterministic", () => {
  const data = Buffer.from(
      JSON.stringify({
        version: 1,
        track: "voice",
        cues: [
          {
            text: "hello",
            start: 0,
            end: 1,
            words: [{ text: "hello", start: 0, end: 1 }],
          },
        ],
      }),
    ),
    sha = createHash("sha256").update(data).digest("hex");
  const t = track({ transcribe: "voice", cache: "cc.json", cacheSha256: sha });
  assert.equal(
    prepareCaptions(scene(t), () => data)[0].children[0].attributes.text,
    "hello",
  );
  assert.throws(
    () => prepareCaptions(scene(track({ transcribe: "voice" })), () => data),
    /requires cache/,
  );
  assert.throws(
    () =>
      prepareCaptions(
        scene({ ...t, attributes: { ...t.attributes, cacheSha256: "bad" } }),
        () => data,
      ),
    /SHA/,
  );
  assert.throws(
    () =>
      prepareCaptions(
        scene({ ...t, attributes: { ...t.attributes, transcribe: "other" } }),
        () => data,
      ),
    /contract/,
  );
  assert.equal(
    prepareCaptions(scene(track({ src: "cc.srt" })), () =>
      Buffer.from("1\n00:00:00,000 --> 00:00:01,000\nhello"),
    )[0].children.length,
    1,
  );
});
test("every caption preset renders with typography, safe areas, active styles and stable random-access frames", async () => {
  const font = new URL(
    "../examples/batch5/assets/inter.woff2",
    import.meta.url,
  ).pathname;
  for (const preset of [
    "classic",
    "boxed-line",
    "boxed-word",
    "one-word",
    "karaoke",
    "highlight",
    "pop",
    "fade",
    "bounce",
    "slide",
    "typewriter",
    "enlarge",
    "none",
  ]) {
    const xml = `<scene version="1.1"><project width="240" height="120" fps="12" duration="2" background="#202030"/><styles><textStyle id="base" fontAsset="f" size="20" color="#ffffff"/><textStyle id="active" fontAsset="f" color="#00ff00"/></styles><safeAreas><safeArea id="safe" preset="title-safe"/></safeAreas><assets><font id="f" src="${font}" family="Inter"/></assets><composition/><captions><captionTrack id="cc" language="pt" preset="${preset}" style="base" activeStyle="active" activeColor="#00ff00" safeArea="safe"><cue start="0" end="2" text="Olá mundo"><word start="0" end="1" text="Olá"/><word start="1" end="2" text="mundo"/></cue></captionTrack></captions></scene>`;
    const loaded = loadScene(xml);
    assert.ok(loaded.ok, JSON.stringify(loaded.diagnostics));
    const rt = compileRuntime(loaded.scene);
    const r = new FrameRenderer(
      rt.scene,
      rt.tracks,
      { read: (p) => readFileSync(p) },
      1,
      rt,
    );
    const first = r.render(0.5).data.slice();
    r.render(1.5);
    assert.deepEqual(r.render(0.5).data, first, preset);
    assert.ok(
      first.some((v, i) => i % 4 < 3 && v > 0.5),
      preset,
    );
  }
});
test("flash detector distinguishes steady, low-contrast, small-area and rapid opposing transitions", () => {
  const frames = (bright, area = 1) =>
    Uint8Array.from({ length: 24 * 12 * 12 * 3 }, (_, i) =>
      Math.floor(i / 3) % 144 < 144 * area
        ? bright(Math.floor(i / (144 * 3)))
        : 0,
    );
  assert.equal(
    flashAnalysis(
      frames(() => 255),
      12,
      12,
      24,
    ).findings.length,
    0,
  );
  assert.ok(
    flashAnalysis(
      frames((f) => (Math.floor(f / 2) % 2 ? 255 : 0)),
      12,
      12,
      24,
    ).findings.length > 0,
  );
  assert.equal(
    flashAnalysis(
      frames((f) => (f % 2 ? 15 : 0)),
      12,
      12,
      24,
    ).findings.length,
    0,
  );
  assert.equal(
    flashAnalysis(
      frames((f) => (f % 2 ? 255 : 0), 0.005),
      12,
      12,
      24,
    ).findings.length,
    0,
  );
});
test("accessibility requirements reject missing captions and inaudible audio descriptions", () => {
  const s = scene(track());
  s.children.push({
    name: "metadata",
    children: [
      {
        name: "accessibility",
        attributes: { requireCaptions: true, audioDescription: "ad" },
      },
    ],
  });
  s.children.push({
    name: "audioMix",
    children: [{ name: "audioTrack", attributes: { id: "ad", asset: "a" } }],
  });
  const mixed = {
    pcm: new Float32Array(8000).fill(0.1),
    rate: 8000,
    channels: 1,
    stems: new Map([["ad", new Float32Array(8000).fill(0.1)]]),
  };
  assert.throws(
    () => accessibilityRequirements(s, [], mixed, {}, 0, 1),
    /requireCaptions/,
  );
  assert.throws(
    () =>
      accessibilityRequirements(
        s,
        [track({}, [cue("hello")])],
        mixed,
        { audio: false },
        0,
        1,
      ),
    /not audible/,
  );
  assert.equal(
    accessibilityRequirements(s, [track({}, [cue("hello")])], mixed, {}, 0, 1)
      .audioDescription,
    "ad",
  );
  assert.equal(
    accessibilityRequirements(scene(track()), [], mixed, {}, 0, 1),
    undefined,
  );
});

test("SCC import uses the installed CEA-608 decoder", () => {
  const dir = mkdtempSync(join(tmpdir(), "scc-")),
    path = join(dir, "captions.scc");
  writeFileSync(
    path,
    "Scenarist_SCC V1.0\n\n00:00:00:00\t9420 9420 94ae 94ae 68e5 ecec ef80 942f 942f\n\n00:00:01:00\t942c 942c\n",
  );
  const result = prepareCaptions(
    scene(track({ src: "captions.scc" })),
    (p) => readFileSync(join(dir, p)),
    (p) => join(dir, p),
  );
  assert.match(result[0].children[0].attributes.text, /hello/);
});

test('imported ASS and TTML styles, regions, sequential time and timed spans survive pagination',()=>{
  const ass=parseCaptions(track(),'[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold, Italic, Alignment\nStyle: Main,Inter,22,&H0000FF00,-1,-1,8\n[Events]\nDialogue: 0,0:00:00.00,0:00:02.00,Main,,0,0,0,,hello','ass');
  assert.equal(JSON.parse(ass[0].attributes.sourceStyle).color.toLowerCase(),'#00ff00ff');assert.equal(ass[0].attributes.position,'ass:8');
  const xml='<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="30" ttp:frameRateMultiplier="1 1" ttp:tickRate="10"><head><styling><style xml:id="base" tts:color="#00ff00" tts:fontWeight="bold" tts:fontSize="20px" tts:fontFamily="Inter" tts:fontStyle="italic" tts:textAlign="center"/><style xml:id="derived" style="base"/></styling><layout><region xml:id="r" tts:origin="10% 70%" tts:extent="80% 20%"/></layout></head><body><div timeContainer="seq"><p dur="10t" style="derived" region="r"><span begin="0s" dur=".5s">hello</span> <span begin=".5s" dur=".5s">world</span></p><p dur="1s">next</p></div></body></tt>';
  const cues=parseCaptions(track(),xml,'ttml');assert.equal(cues[0].children.length,2);assert.equal(cues[1].attributes.start,1);assert.equal(cues[0].attributes.position,'position:50% line:80%');assert.equal(JSON.parse(cues[0].attributes.sourceStyle).weight,700);
  const paged=paginateTrack(track({maxWordsPerLine:1,maxLines:1},[cues[0]]));assert.equal(paged.children[1].attributes.start,.5);assert.equal(paged.children[1].children[0].attributes.text,'world');
  const vtt=toVtt(track({maxCharsPerLine:5,maxLines:2},[cue('hello world',0,2,[word('hello',0,.4),word('world',.4,2)])]));assert.match(vtt,/hello\n<00:00:00.400>world/);
  assert.throws(()=>parseCaptions(track(),'<tt><style id="x" style="x"/><p begin="0" end="1" style="x">bad</p></tt>','ttml'),/cycle/);
});
