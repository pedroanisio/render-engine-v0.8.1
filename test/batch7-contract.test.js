import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { MODEL } from "../src/generated/model.js";
import { codecs, outputPlan, checkEncoding } from "../src/render/export.js";
import {
  encodeTransfer,
  convertRGB,
  transferOf,
} from "../src/render/color-management.js";
import { linearize } from "../src/media/color.js";
import { renderEpisode } from "../src/render/pipeline.js";
import { stillBytes } from "../src/render/stills.js";
import { evidence } from "./evidence.js";
const dir = mkdtempSync(join(tmpdir(), "export-contract-"));
const probe = (f) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-show_frames",
        "-of",
        "json",
        f,
      ],
      { encoding: "utf8" },
    ),
  );

test("every codec/container pairing either plans its specified muxer or explicitly rejects it", () => {
  const containers =
    MODEL.simpleTypes["outputType@container"].facets.enumeration;
  for (const [codec, spec] of Object.entries(codecs)) {
    for (const container of containers) {
      const a = { codec, container, path: "frame-%04d.png" };
      if (spec.containers.includes(container))
        assert.equal(outputPlan(a).container, container);
      else {
        assert.throws(() => outputPlan(a), /cannot use container/);
        evidence(
          "incompatible codec/container pair",
          [
            `outputType/@codec=${codec}`,
            "outputType/@codec",
            "outputType/@container",
          ],
          "negative",
        );
      }
    }
  }
  for (const key of ["preset", "crf", "keyframeInterval"])
    assert.throws(() => outputPlan({ codec: "gif", [key]: 2 }), /unavailable/);
  assert.throws(
    () => outputPlan({ codec: "gif", audio: true }),
    /cannot carry audio/,
  );
  assert.throws(
    () => outputPlan({ codec: "ffv1", faststart: true }),
    /faststart requires/,
  );
  for (const key of ["maxBitrate", "bufferSize", "level", "profile"])
    assert.throws(
      () => outputPlan({ codec: "prores", [key]: 1000 }),
      /requires|ProRes uses|unavailable/,
    );
});

for (const [profile, label] of [
  ["proxy", "Proxy"],
  ["lt", "LT"],
  ["422", "Standard"],
  ["hq", "HQ"],
  ["4444", "4444"],
  ["4444xq", "XQ"],
])
  test(`ProRes profile ${profile} is present in a decoded real stream`, () => {
    checkEncoding(
      { codec: "prores", proresProfile: profile, audio: false },
      24,
      1,
      64,
      48,
      dir,
    );
    const stream = probe(join(dir, "probe-mov")).streams[0];
    assert.match(stream.profile, new RegExp(label));
    evidence(`decoded ProRes ${profile}`, [
      `outputType/@proresProfile=${profile}`,
      "outputType/@proresProfile",
    ]);
    assert.throws(
      () => outputPlan({ codec: "h264", proresProfile: profile }),
      /proresProfile requires/,
    );
    evidence(
      `reject misplaced ProRes ${profile}`,
      [`outputType/@proresProfile=${profile}`, "outputType/@proresProfile"],
      "negative",
    );
  });

test("every output transfer and color-space enum transforms numerical samples reversibly", () => {
  for (const transfer of MODEL.simpleTypes.transferType.facets.enumeration) {
    const selected = transfer === "auto" ? "srgb" : transfer;
    for (const value of [0.001, 0.02, 0.18, 0.7]) {
      const encoded = encodeTransfer(value, selected),
        decoded = linearize(encoded, selected);
      const representable = Math.max(
        linearize(0, selected),
        Math.min(linearize(1, selected), value),
      );
      assert.ok(
        Math.abs(decoded - representable) < 1e-6,
        `${transfer}: ${decoded} vs ${representable}`,
      );
    }
    evidence(`round-trip transfer ${transfer}`, [
      `outputType/@transfer=${transfer}`,
      "outputType/@transfer",
    ]);
  }
  for (const space of MODEL.simpleTypes.colorSpaceType.facets.enumeration) {
    const original = [0.12, 0.34, 0.56],
      converted = convertRGB(original, "linear-srgb", space),
      decoded = convertRGB(converted, space, "linear-srgb");
    assert.ok(
      decoded.every((v, i) => Math.abs(v - original[i]) < 1e-5),
      space,
    );
    assert.ok(Number.isFinite(encodeTransfer(0.18, transferOf(space))));
    evidence(`round-trip primaries ${space}`, [
      `outputType/@colorSpace=${space}`,
      "outputType/@colorSpace",
    ]);
  }
  assert.throws(() => encodeTransfer(0.18, "invalid"), /transfer/i);
  assert.throws(() => convertRGB([0.1, 0.2, 0.3], "invalid", "srgb"), /space/i);
  evidence(
    "unknown output colour contracts reject",
    ["outputType/@colorSpace", "outputType/@transfer"],
    "negative",
  );
});

test("GOP/B-frames, faststart and all standard metadata fields survive a real export", async () => {
  const meta = {
    title: "Title",
    author: "Author",
    description: "Description",
    keywords: "a,b",
    copyright: "Copyright",
    revision: "r2",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-02-01T00:00:00Z",
    generator: "scene-test",
    language: "pt",
  };
  const source = `<scene version="1.1"><project width="64" height="48" fps="8" duration="1"/><metadata ${Object.entries(
    meta,
  )
    .map(([k, v]) => `${k}="${v}"`)
    .join(
      " ",
    )}><meta name="custom" value="a=b;c#d"/></metadata><output id="main" path="out.mp4" codec="h264" audio="false" preset="ultrafast" keyframeInterval="0.5" bFrames="0" faststart="true"/><composition><shape id="s" shape="rect" width="32" height="32" fill="#FF0000"/></composition></scene>`;
  const file = join(dir, "metadata.xml");
  writeFileSync(file, source);
  const result = await renderEpisode({ sceneFile: file }),
    p = probe(result.video),
    bytes = readFileSync(result.video);
  for (const [key, value] of Object.entries(meta)) {
    assert.equal(p.format.tags[key], value);
    evidence(`metadata ${key}`, [`metadataType/@${key}`]);
  }
  assert.equal(p.format.tags.custom, "a=b;c#d");
  assert.equal(p.streams[0].has_b_frames, 0);
  assert.deepEqual(
    p.frames.filter((f) => f.key_frame === 1).map((f) => Number(f.pts_time)),
    [0, 0.5],
  );
  assert.ok(bytes.indexOf("moov") < bytes.indexOf("mdat"));
  evidence("stream GOP and MP4 atom order", [
    "outputType/@keyframeInterval",
    "outputType/@bFrames",
    "outputType/@faststart",
    "metaType/@name",
    "metaType/@value",
  ]);
  writeFileSync(
    file,
    source.replace(
      'faststart="true"',
      'faststart="false" embedMetadata="false"',
    ),
  );
  const disabled = await renderEpisode({ sceneFile: file }),
    d = probe(disabled.video),
    b = readFileSync(disabled.video);
  for (const key of Object.keys(meta)) {
    assert.equal(d.format.tags[key], undefined);
    evidence(`metadata disabled ${key}`, [`metadataType/@${key}`], "negative");
  }
  assert.ok(b.indexOf("moov") > b.indexOf("mdat"));
  assert.equal(d.format.tags.custom, undefined);
  evidence(
    "metadata opt-out and non-faststart",
    ["outputType/@faststart", "metaType/@name", "metaType/@value"],
    "negative",
  );
});

test("still quality changes encoded detail rather than only its declared filename", async () => {
  const pixels = Buffer.alloc(64 * 64 * 8);
  for (let i = 0; i < 64 * 64; i++) {
    for (let k = 0; k < 3; k++)
      pixels.writeUInt16LE(((i * 73 + k * 31) % 256) * 257, (i * 4 + k) * 2);
    pixels.writeUInt16LE(65535, (i * 4 + 3) * 2);
  }
  for (const format of ["jpeg", "webp", "avif"]) {
    const low = await stillBytes(pixels, 64, 64, format, 0.1),
      high = await stillBytes(pixels, 64, 64, format, 0.95);
    assert.notDeepEqual(low, high);
    assert.ok(high.length > low.length);
  }
  evidence("real still quality differences", ["stillType/@quality"]);
});
