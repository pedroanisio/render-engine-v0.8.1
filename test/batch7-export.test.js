import { evidence } from "./evidence.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { renderEpisode } from "../src/render/pipeline.js";
import {
  outputPlan,
  videoArguments,
  colorArguments,
  encoderPreflight,
  audioArguments,
} from "../src/render/export.js";
import { processRun } from "../src/render/process.js";
import { destinationPlan, deliver } from "../src/render/delivery.js";
import { createServer } from "node:http";
const dir = mkdtempSync(join(tmpdir(), "batch7 'exports-"));
const probe = (f) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-show_chapters",
        "-of",
        "json",
        f,
      ],
      { encoding: "utf8" },
    ),
  );
function scene(name, attrs, children = "", project = "") {
  const file = join(dir, name + ".xml");
  writeFileSync(
    file,
    `<scene version="1.1"><project width="64" height="48" fps="4" duration="1" background="#00000000" ${project}/><metadata title="Codec fixture" author="Test"><meta name="custom" value="A=B;C#D"/></metadata><output id="main" path="${name}" ${attrs}>${children}</output><markers><marker id="chapter" time="0.25" label="Chapter"/></markers><composition><shape id="box" shape="rect" width="20" height="20" fill="#FF000080"><animate property="x"><key time="0" value="0"/><key time="1" value="40"/></animate></shape></composition></scene>`,
  );
  return file;
}
for (const [name, attrs, expected] of [
  [
    "h264.mp4",
    'codec="h264" container="mp4" audio="false" width="80" height="40" profile="high" level="3.1" bFrames="0"',
    "h264",
  ],
  [
    "h265.mp4",
    'codec="h265" container="mp4" audio="false" colorSpace="rec2020" transfer="pq" maxCLL="1000" maxFALL="400"',
    "hevc",
  ],
  ["lossless.mkv", 'codec="ffv1" alpha="true" audio="false"', "ffv1"],
  ["av1.webm", 'codec="av1" container="webm" audio="false"', "av1"],
  [
    "vp9.webm",
    'codec="vp9" container="webm" alpha="true" audio="false"',
    "vp9",
  ],
  ["prores.mov", 'codec="prores" alpha="true" audio="false"', "prores"],
  [
    "dnxhr.mov",
    'codec="dnxhr" width="256" height="120" audio="false"',
    "dnxhd",
  ],
  ["anim.gif", 'codec="gif" loopCount="2" alpha="true"', "gif"],
  ["anim.apng", 'codec="apng" loopCount="3" alpha="true"', "apng"],
  ["anim.webp", 'codec="webp" loopCount="2"', "webp"],
  ["audio.wav", 'codec="audio-only" container="wav"', "pcm_s24le"],
  ["audio.m4a", 'codec="audio-only" container="m4a"', "aac"],
  ["audio.mp3", 'codec="audio-only" container="mp3"', "mp3"],
])
  test(`end-to-end ${name}`, async () => {
    const file = scene(name, attrs),
      r = await renderEpisode({ sceneFile: file });
    assert.ok(statSync(r.video).size > 100);
    if (name.endsWith("webp")) {
      const meta = await sharp(r.video, { animated: true }).metadata();
      assert.equal(meta.pages, 4);
      assert.equal(meta.format, "webp");
      evidence(`end-to-end ${name}`, [
        "outputType/@codec=webp",
        "outputType/@codec",
      ]);
      return;
    }
    const p = probe(r.video),
      v = p.streams.find((s) => s.codec_type === "video");
    assert.equal(p.streams[0].codec_name, expected);
    const requested = attrs.match(/codec="([^"]+)"/)[1];
    evidence(`end-to-end ${name}`, [
      `outputType/@codec=${requested}`,
      "outputType/@codec",
    ]);
    if (v) {
      assert.equal(Number(v.nb_read_frames), 4);
      assert.equal(
        v.width,
        name === "h264.mp4" ? 80 : name === "dnxhr.mov" ? 256 : 64,
      );
    }
    if (name === "h265.mp4") {
      assert.equal(v.color_transfer, "smpte2084");
      assert.equal(v.color_primaries, "bt2020");
    }
    if (name === "h264.mp4") {
      assert.equal(v.height, 40);
      assert.equal(p.format.tags.title, "Codec fixture");
      assert.equal(p.chapters[0].tags.title, "Chapter");
    }
    if (name === "prores.mov" || name === "vp9.webm") {
      const bytes = execFileSync("ffmpeg", [
        "-v",
        "error",
        ...(name === "vp9.webm" ? ["-c:v", "libvpx-vp9"] : []),
        "-i",
        r.video,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-",
      ]);
      assert.ok(Math.abs(bytes[(5 * 64 + 5) * 4 + 3] - 128) < 4);
      assert.equal(bytes[(47 * 64 + 63) * 4 + 3], 0);
    }
    if (name === "anim.gif") {
      const rgba = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        r.video,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-",
      ]);
      assert.equal(rgba[(47 * 64 + 63) * 4 + 3], 0);
    }
    if (name === "lossless.mkv") {
      const rgba = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        r.video,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-",
      ]);
      assert.ok(Math.abs(rgba[3] - 128) < 2);
      assert.ok(rgba[0] > 250);
      assert.equal(rgba[(47 * 64 + 63) * 4 + 3], 0);
    }
  });
for (const [codec, ext] of [
  ["png", "png"],
  ["jpeg", "jpg"],
  ["exr", "exr"],
  ["tiff", "tiff"],
])
  test(`sequence ${codec}`, async () => {
    const name = `${codec}-%03d.${ext}`,
      file = scene(name, `codec="${codec}-sequence"`);
    const r = await renderEpisode({ sceneFile: file });
    for (let i = 1; i <= 4; i++) {
      const stream = probe(r.video.replace("%03d", String(i).padStart(3, "0")))
        .streams[0];
      assert.equal(stream.width, 64);
      assert.equal(stream.codec_name, codec === "jpeg" ? "mjpeg" : codec);
    }
    evidence(`sequence ${codec}`, [
      `outputType/@codec=${codec}-sequence`,
      "outputType/@codec",
    ]);
  });
test("all still encoders honor format, size and marker; ranged output and corrupt cache repair", async () => {
  const children = ["png", "jpeg", "webp", "avif"]
    .map(
      (f) =>
        `<poster path="poster.${f}" format="${f}" marker="chapter" width="32" quality="0.7"/>`,
    )
    .join("");
  const file = scene(
    "stills.mp4",
    'codec="h264" container="mp4" audio="false" start="0.25" end="0.75"',
    children,
  );
  const first = await renderEpisode({ sceneFile: file });
  assert.equal(probe(first.video).streams[0].nb_read_frames, "2");
  for (const f of first.posters)
    assert.equal((await sharp(f).metadata()).width, 32);
  const again = await renderEpisode({ sceneFile: file });
  assert.equal(again.rendered, 0);
  const cache = join(dir, "_tmp", "render", "segments"),
    seg = readdirSync(cache).find((f) => f.endsWith(".mkv"));
  // Corruption must never be accepted simply because a path exists.
  for (const f of readdirSync(cache).filter((f) => f.endsWith(".mkv")))
    writeFileSync(join(cache, f), "truncated");
  assert.ok((await renderEpisode({ sceneFile: file })).rendered > 0);
});
test("two-pass bitrate export and maximum file size", async () => {
  const file = scene(
    "twopass.mp4",
    'codec="h264" container="mp4" audio="false" bitrate="100000" twoPass="true" maxFileSize="50000"',
  );
  const r = await renderEpisode({ sceneFile: file });
  assert.ok(statSync(r.video).size <= 50000);
  assert.equal(probe(r.video).streams[0].nb_read_frames, "4");
});
test("preflight rejects incompatible contracts", () => {
  for (const a of [
    { codec: "bad" },
    { codec: "h264", container: "wav" },
    { codec: "h264", alpha: true },
    {
      codec: "ffv1",
      alpha: true,
      pixelFormat: "gray",
      pixelFormatExplicit: true,
    },
    { codec: "png-sequence", path: "a.png" },
    { codec: "audio-only", audio: false },
    { codec: "prores", alpha: true, proresProfile: "hq" },
    { codec: "ffv1", twoPass: true },
    { codec: "vp9", maxCLL: 1000 },
    { codec: "h264", transfer: "pq" },
    { codec: "gif", captions: ["cc"] },
  ])
    assert.throws(() => outputPlan(a));
  assert.throws(() => videoArguments({ codec: "h264" }, 24, 1, 31, 20), /even/);
  assert.throws(
    () => videoArguments({ codec: "prores" }, 24, 1, 31, 20),
    /even/,
  );
  assert.throws(() => videoArguments({ codec: "dnxhr" }, 24, 1, 64, 48), /256/);
  assert.throws(
    () => videoArguments({ codec: "h264", maxFileSize: 10 }, 24, 1, 64, 48),
    /maxFileSize/,
  );
  assert.throws(
    () => videoArguments({ codec: "gif", maxFileSize: 10000 }, 24, 1, 64, 48),
    /maxFileSize/,
  );
  assert.throws(
    () => encoderPreflight({ codec: "h264", pixelFormat: "rgba" }),
    /pixelFormat/,
  );
  assert.ok(
    colorArguments({
      colorSpace: "rec709",
      transfer: "auto",
      colorRange: "full",
    }).includes("pc"),
  );
  assert.ok(
    audioArguments({ codec: "vp9", container: "webm" }).includes("libopus"),
  );
});
test("spawn failures, broken pipes and cancellation reject promptly", async () => {
  await assert.rejects(processRun("/missing/batch7", []));
  await assert.rejects(
    processRun(process.execPath, ["-e", "process.exit(2)"], {
      frames: [Buffer.alloc(1024 * 1024)],
    }),
  );
  const a = new AbortController();
  a.abort();
  await assert.rejects(processRun(process.execPath, [], { signal: a.signal }));
  const b = new AbortController();
  const running = processRun(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { signal: b.signal },
  );
  setTimeout(() => b.abort(), 50);
  await assert.rejects(running);
});
test("file and HTTP delivery, signed cloud profiles, webhook and errors", async () => {
  const bytes = Buffer.from("delivery bytes"),
    file = join(dir, "deliver.txt");
  writeFileSync(file, bytes);
  const node = (kind, uri, credentials) => ({
    name: "destination",
    attributes: { kind, uri, ...(credentials ? { credentials } : {}) },
    children: [],
  });
  await deliver(destinationPlan(node("file", "copied.txt")), file, dir);
  assert.deepEqual(readFileSync(join(dir, "copied.txt")), bytes);
  await deliver(destinationPlan(node("file", file)), file, dir);
  const received = [];
  const server = createServer((req, res) => {
    const b = [];
    req.on("data", (c) => b.push(c));
    req.on("end", () => {
      received.push({
        method: req.method,
        body: Buffer.concat(b),
        headers: req.headers,
      });
      res.statusCode = req.url === "/fail" ? 403 : 200;
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const uri = `http://127.0.0.1:${server.address().port}/upload`;
  try {
    for (const kind of ["http-put", "webhook", "s3", "gcs", "azure-blob"]) {
      const plan = destinationPlan(node(kind, uri, "test"), {
        SCENE_RENDER_PROFILE_test: JSON.stringify({
          url: uri,
          headers: { authorization: "test-token" },
        }),
      });
      await deliver(plan, file, dir);
    }
    assert.equal(received[0].method, "PUT");
    assert.deepEqual(received[0].body, bytes);
    assert.equal(received[1].method, "POST");
    assert.equal(received[4].headers["x-ms-blob-type"], "BlockBlob");
    await assert.rejects(
      deliver(
        destinationPlan(node("http-put", uri.replace("/upload", "/fail"))),
        file,
        dir,
      ),
      /403/,
    );
  } finally {
    server.close();
  }
  assert.throws(
    () => destinationPlan(node("s3", "s3://bucket/key", "missing"), {}),
    /Missing/,
  );
  assert.throws(
    () => destinationPlan(node("http-put", "ftp://host/key")),
    /HTTP/,
  );
  assert.throws(
    () =>
      destinationPlan(node("s3", "s3://bucket/key", "bound"), {
        SCENE_RENDER_PROFILE_bound: JSON.stringify({
          url: "https://upload/key",
        }),
      }),
    /bind/,
  );
  assert.equal(
    destinationPlan(node("s3", "s3://bucket/key", "bound"), {
      SCENE_RENDER_PROFILE_bound: JSON.stringify({
        url: "https://upload/key",
        resource: "s3://bucket/key",
      }),
    }).uri,
    "https://upload/key",
  );
  assert.throws(
    () => destinationPlan(node("s3", "https://host/key")),
    /signed/,
  );
  assert.throws(
    () => destinationPlan(node("sftp", "sftp://u:password@host/file")),
    /Invalid/,
  );
});

test("bounded cache evicts oldest pixels; output lock blocks concurrent writers and recovers stale owners", async () => {
  const { SurfaceCache } = await import("../src/render/cache.js");
  const { Surface } = await import("../src/render/surface.js");
  const c = new SurfaceCache(128);
  const s = new Surface(2, 2);
  c.set("a", s).set("b", s);
  assert.equal(c.bytes, 128);
  assert.equal(c.get("a"), s);
  c.set("c", s);
  assert.equal(c.get("b"), undefined);
  c.set("large", new Surface(10, 10));
  assert.equal(c.has("large"), false);
  c.delete("a");
  c.clear();
  assert.equal(c.bytes, 0);
  const { outputLock, publishFile } =
    await import("../src/render/output-lock.js");
  const target = join(dir, "locked.mp4");
  const release = outputLock(target);
  assert.throws(() => outputLock(target), /already/);
  release();
  writeFileSync(target + ".render-lock", JSON.stringify({ pid: 2147483647 }));
  outputLock(target)();
  const source = join(dir, "publish.bin");
  writeFileSync(source, "ok");
  publishFile(source, target);
  assert.equal(readFileSync(target, "utf8"), "ok");
});
test("float EXR path retains highlights and 16-bit alpha is unassociated only for alpha outputs", async () => {
  const { ColorPipeline } = await import("../src/render/color-management.js");
  const { Surface } = await import("../src/render/surface.js");
  const cp = new ColorPipeline(
    { name: "scene", attributes: {}, children: [] },
    () => new Uint8Array(),
  );
  const s = new Surface(1, 1);
  s.data.set([2, 0.25, 0.125, 0.5]);
  cp.output = { colorSpace: "linear-srgb", transfer: "linear" };
  const float = cp.encodeFloat(s);
  assert.equal(float.readFloatLE(8), 4);
  assert.equal(float.readFloatLE(12), 0.5);
  const a = cp.encode16(s),
    b = cp.encode16(s, false);
  assert.ok(a.readUInt16LE(2) > b.readUInt16LE(2));
  assert.equal(b.readUInt16LE(6), 65535);
});
test("style tokens cannot recurse through a missing style ID; feature tags default to on", async () => {
  const { textStyle, settings } = await import("../src/media/text.js");
  const token = {
    name: "token",
    attributes: { name: "ink", value: "#ffffff" },
    children: [],
  };
  const style = {
    name: "textStyle",
    attributes: { id: "title", size: 32 },
    children: [],
  };
  assert.equal(textStyle(style, new Map([["undefined", token]])).size, 32);
  assert.deepEqual(settings("tnum, lnum"), { tnum: 1, lnum: 1 });
});
test("multiple outputs, rational FPS, odd RGB sizes, metadata opt-out and timecode", async () => {
  const file = scene(
    "multi.mp4",
    'codec="h264" audio="false" fps="24000/1001" start="0.25" end="0.75" embedMetadata="false" faststart="false"',
    "",
    'timecodeStart="01:00:00:00" pixelAspect="1.5"',
  );
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace(
      "<markers>",
      '<output id="second" path="odd.mkv" codec="ffv1" audio="false" width="65" height="49"/><markers>',
    ),
  );
  await renderEpisode({ sceneFile: file, outputId: "*" });
  const v = probe(join(dir, "multi.mp4"));
  assert.equal(v.format.tags.title, undefined);
  assert.equal(v.streams[0].r_frame_rate, "24000/1001");
  assert.equal(v.streams[0].sample_aspect_ratio, "3:2");
  assert.equal(probe(join(dir, "odd.mkv")).streams[0].width, 65);
});

test("manifest exposes enum contracts without claiming parsing is certification", async () => {
  const { capabilityManifest } = await import("../src/scene/preflight.js");
  const { main } = await import("../src/cli.js");
  const m = capabilityManifest(),
    out = m.contexts.find((n) => n.element === "output");
  assert.equal(
    out.attributes.find((n) => n.name === "codec").values.length,
    15,
  );
  assert.match(m.policy, /do not certify/);
  let output = "";
  assert.equal(
    main(["capabilities", "--json"], {
      stdout: (s) => (output += s),
      stderr: () => {},
      readFile: () => "",
      readBytes: () => new Uint8Array(),
    }),
    0,
  );
  assert.ok(JSON.parse(output).contexts.length > 100);
});
test("disk stems evict, reload bit-exact samples and return missing references", async () => {
  const { AudioStems } = await import("../src/render/audio-stems.js");
  const stems = new AudioStems(join(dir, "stems"), 8);
  const a = new Float32Array([0.25, -0.5]);
  stems.set("a", a);
  assert.equal(stems.get("a"), a);
  stems.set("b", new Float32Array([1, 2, 3]));
  assert.deepEqual(stems.get("a"), a);
  assert.equal(stems.get("missing"), undefined);
  stems.set("a", new Float32Array([1, 2]));
  assert.equal(stems.bytes, 8);
});
test("MXF and encoder-option rejection are verified against the actual backend", async () => {
  const file = scene(
    "intermediate.mxf",
    'codec="dnxhr" container="mxf" width="256" height="120" fps="25" audio="true"',
  );
  const r = await renderEpisode({ sceneFile: file });
  const p = probe(r.video);
  assert.equal(p.streams[0].codec_name, "dnxhd");
  assert.equal(p.streams[1].codec_name, "pcm_s24le");
  const invalid = scene(
    "bad.mp4",
    'codec="h264" profile="not-a-profile" audio="false"',
  );
  await assert.rejects(
    renderEpisode({ sceneFile: invalid }),
    /preflight failed/,
  );
});

test("ambisonic Opus carries mapping family 2 and WAV honors mix bit depth", async () => {
  const file = scene(
    "ambisonic.mkv",
    'codec="audio-only" container="mkv" audioCodec="libopus"',
  );
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace(
      "</composition>",
      '</composition><audioMix channels="4" channelLayout="ambisonic-1" bitDepth="16"><master/></audioMix>',
    ),
  );
  const result = await renderEpisode({ sceneFile: file });
  const audio = probe(result.video).streams[0];
  assert.equal(audio.channels, 4);
  assert.match(audio.channel_layout, /ambisonic/);
  const wav = scene("sixteen.wav", 'codec="audio-only" container="wav"');
  writeFileSync(
    wav,
    readFileSync(wav, "utf8").replace(
      "</composition>",
      '</composition><audioMix bitDepth="16"><master/></audioMix>',
    ),
  );
  assert.equal(
    probe((await renderEpisode({ sceneFile: wav })).video).streams[0]
      .bits_per_sample,
    16,
  );
  assert.throws(
    () =>
      outputPlan({
        codec: "audio-only",
        container: "wav",
        audioLayout: "ambisonic-1",
      }),
    /Ambisonic/,
  );
});
test("partial timecodes advance on the output frame clock", async () => {
  const { offsetTimecode } = await import("../src/render/export-metadata.js");
  assert.equal(
    offsetTimecode("01:00:00:00", 0.25, 24000 / 1001),
    "01:00:00:06",
  );
  assert.equal(offsetTimecode("00:59:59:24", 1 / 25, 25), "01:00:00:00");
});

test("sequence destinations receive a complete numbered-frame ZIP", async () => {
  const file = scene(
    "deliver-%03d.png",
    'codec="png-sequence"',
    '<destination kind="file" uri="delivered-frames.zip"/>',
  );
  await renderEpisode({ sceneFile: file });
  const { unzipSync } = await import("fflate");
  const files = unzipSync(readFileSync(join(dir, "delivered-frames.zip")));
  assert.deepEqual(
    Object.keys(files),
    [1, 2, 3, 4].map((n) => `deliver-${String(n).padStart(3, "0")}.png`),
  );
});

test("shorter sequence replacement removes only previously owned frames", async () => {
  const file = scene("short-%03d.png", 'codec="png-sequence"');
  await renderEpisode({ sceneFile: file });
  writeFileSync(join(dir, "unrelated.png"), "keep");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace(
      'codec="png-sequence"',
      'codec="png-sequence" end="0.5"',
    ),
  );
  await renderEpisode({ sceneFile: file });
  assert.equal(
    readdirSync(dir).filter((n) => /^short-\d+\.png$/.test(n)).length,
    2,
  );
  assert.equal(readFileSync(join(dir, "unrelated.png"), "utf8"), "keep");
});
test("abort rejects a render and leaves no published output or owned run directory", async () => {
  const file = scene("cancel.mp4", 'codec="h264" audio="false" fps="120"');
  const c = new AbortController(),
    promise = renderEpisode({ sceneFile: file, signal: c.signal });
  setTimeout(() => c.abort(), 20);
  await assert.rejects(promise);
  assert.equal(readdirSync(dir).includes("cancel.mp4"), false);
  assert.equal(
    readdirSync(join(dir, "_tmp", "render")).some((n) => n.startsWith("run-")),
    false,
  );
  await assert.rejects(renderEpisode({ sceneFile: file, jobs: 100 }), /jobs/);
});

test("HDR mastering metadata and rate control options survive real encoding", async () => {
  const file = scene(
    "mastering.mp4",
    'codec="h265" audio="false" colorSpace="rec2020" transfer="pq" maxCLL="1000" maxFALL="400" masteringDisplay="G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50)" bitrate="100000" maxBitrate="150000" bufferSize="300000" bFrames="0" twoPass="true"',
  );
  const r = await renderEpisode({ sceneFile: file });
  const frames = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-read_intervals",
        "%+0.1",
        "-of",
        "json",
        r.video,
      ],
      { encoding: "utf8" },
    ),
  ).frames;
  const data = frames[0].side_data_list;
  assert.ok(
    data.some((s) => s.side_data_type === "Mastering display metadata"),
  );
  assert.equal(
    data.find((s) => s.side_data_type === "Content light level metadata")
      .max_content,
    1000,
  );
  for (const codec of ["av1", "vp9"])
    await renderEpisode({
      sceneFile: scene(
        `two-${codec}.webm`,
        `codec="${codec}" audio="false" bitrate="100000" twoPass="true"`,
      ),
    });
});

test("native finishing grain honors intensity and size instead of obscuring the scene", async () => {
  const { processEffect } = await import("../src/render/fx/processor.js");
  const { Surface } = await import("../src/render/surface.js");
  const s = new Surface(16, 16);
  s.fillRect(0, 0, 16, 16, [0.5, 0.5, 0.5, 1], s.bounds());
  const ctx = { scale: 1, time: 0, frame: 0, fps: 24 };
  assert.deepEqual(
    processEffect(s, { type: "film-grain", amount: 1, intensity: 0 }, ctx).data,
    s.data,
  );
  const out = processEffect(
    s,
    { type: "film-grain", amount: 1, intensity: 0.08, size: 2, seed: 5 },
    ctx,
  );
  let maximum = 0;
  for (let i = 0; i < out.data.length; i += 4)
    maximum = Math.max(maximum, Math.abs(out.data[i] - 0.5));
  assert.ok(maximum <= 0.080001);
  assert.equal(out.data[0], out.data[4]);
});
