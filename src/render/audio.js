import { AudioStems } from "./audio-stems.js";
/** Deterministic sample-clock mixer with a validated routing/sidechain DAG. */
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clamp,
  db,
  effect,
  filterPcm,
  fromBytes,
  pcmBytes,
} from "./audio-dsp.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {ReturnType<import('../eval/runtime.js').compileRuntime>} Runtime */
/** @param {Node} scene */
export function audioFormat(scene) {
  const a = scene.children.find((n) => n.name === "audioMix")?.attributes ?? {};
  const rate = Number(a.sampleRate ?? 48000),
    channels = Number(a.channels ?? 2),
    bits = Number(a.bitDepth ?? 24),
    layout = String(a.channelLayout ?? "auto");
  const layouts = /** @type {Record<string,number>} */ ({
    mono: 1,
    stereo: 2,
    5.1: 6,
    7.1: 8,
    "7.1.4": 12,
    "ambisonic-1": 4,
    "ambisonic-3": 16,
  });
  if (
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 192000 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > 16 ||
    ![16, 24, 32].includes(bits)
  )
    throw new Error(
      "invalid audio format: 8–192 kHz, 1–16 channels, 16/24/32 bits",
    );
  if (layout !== "auto" && layouts[layout] !== channels)
    throw new Error(
      `channelLayout ${layout} requires ${layouts[layout]} channels`,
    );
  return { rate, channels, bits, layout };
}
/** @param {number} t @param {string} curve */
export function fade(t, curve) {
  t = clamp(t, 0, 1);
  if (curve === "equal-power") return Math.sin((t * Math.PI) / 2);
  if (curve === "logarithmic") return Math.log10(1 + 9 * t);
  if (curve === "exponential") return (10 ** t - 1) / 9;
  if (curve === "s-curve") return t * t * (3 - 2 * t);
  return t;
}
/** @param {Node} scene @param {(id:string)=>{path:string,audioStream?:number,timelineAudio?:boolean}} assetOf @param {number} duration @param {Runtime} [runtime] @param {string} [stemDirectory] */
export function mixAudio(scene, assetOf, duration, runtime, stemDirectory) {
  const format = audioFormat(scene),
    { rate, channels } = format,
    frames = Math.round(duration * rate),
    size = frames * channels;
  if (!Number.isFinite(size) || size < 0 || size > 200_000_000)
    throw new Error(
      "audio sample budget exceeded (200 million samples per node)",
    );
  const mix = scene.children.find((n) => n.name === "audioMix"),
    nodes =
      mix?.children.filter((n) => ["audioTrack", "bus"].includes(n.name)) ?? [];
  const byId = new Map(nodes.map((n) => [String(n.attributes.id), n]));
  const master = mix?.children.find((n) => n.name === "master");
  const results = stemDirectory ? new AudioStems(stemDirectory) : new Map();
  const pending = new Set();
  /** @type {Map<Node,Map<string,{driven:boolean,value:number}>>} */
  const controls = new Map();
  /** @type {import('./audio-dsp.js').Control} */
  const control = (node, key, time, fallback = 0) => {
    let table = controls.get(node);
    if (!table) {
      table = new Map();
      controls.set(node, table);
    }
    let entry = table.get(key);
    if (!entry) {
      const parameter = node.children.find(
        (n) => n.name === "param" && n.attributes.name === key,
      );
      const bound = scene.children
        .find((n) => n.name === "parameters")
        ?.children.some(
          (n) =>
            n.name === "bind" &&
            n.attributes.target === node.attributes.id &&
            n.attributes.property === key,
        );
      const driven =
        !!bound ||
        node.children.some(
          (n) =>
            ["animate", "expression", "link"].includes(n.name) &&
            n.attributes.property === key,
        );
      entry = {
        driven,
        value: Number(
          parameter?.attributes.value ?? node.attributes[key] ?? fallback,
        ),
      };
      table.set(key, entry);
    }
    const value = entry.driven
      ? Number(runtime?.value(node, key, time) ?? entry.value)
      : entry.value;
    if (!Number.isFinite(value))
      throw new Error(`non-finite audio control ${key}`);
    return value;
  };
  /** @param {Node} n @returns {string[]} */
  const refs = (n) =>
    Array.isArray(n.attributes.duckUnder)
      ? n.attributes.duckUnder.map(String)
      : String(n.attributes.duckUnder ?? "")
          .split(/\s+/)
          .filter(Boolean);
  /** @param {Node} n */
  const destination = (n) =>
    String(n.attributes[n.name === "bus" ? "output" : "bus"] ?? "");
  for (const n of nodes) {
    const target = destination(n);
    if (target && byId.get(target)?.name !== "bus")
      throw new Error(`unknown audio bus ${target}`);
  }
  /** @param {Node} n @param {Float32Array} pcm */
  function process(n, pcm) {
    const detectors = refs(n).map(render);
    let duck = 1,
      envelope = 0;
    const keys = ["mute", "volume", "gain", "pan"];
    keys.forEach((key) => control(n, key, 0, key === "volume" ? 1 : 0));
    const constant =
      !detectors.length &&
      keys.every((key) => !controls.get(n)?.get(key)?.driven);
    if (constant) {
      const gain =
        (control(n, "mute", 0, 0) ? 0 : control(n, "volume", 0, 1)) *
        db(control(n, "gain", 0, 0));
      const pan = clamp(control(n, "pan", 0, 0), -1, 1);
      const gains = Array.from(
        { length: channels },
        (_, c) =>
          gain *
          (channels >= 2 && c < 2
            ? Math.SQRT2 *
              (c === 0
                ? Math.cos(((pan + 1) * Math.PI) / 4)
                : Math.sin(((pan + 1) * Math.PI) / 4))
            : 1),
      );
      for (let i = 0; i < pcm.length; i++)
        pcm[i] = Number(pcm[i]) * Number(gains[i % channels]);
    }
    for (let i = 0; !constant && i < frames; i++) {
      const t = i / rate,
        offset = i * channels;
      let peak = 0;
      for (const detector of detectors)
        for (let c = 0; c < channels; c++)
          peak = Math.max(peak, Math.abs(Number(detector[offset + c])));
      // Ten-millisecond peak release avoids carrier-frequency chatter. Muted sources do not duck.
      envelope = Math.max(peak, envelope * Math.exp(-1 / (0.01 * rate)));
      const target =
        envelope > db(control(n, "duckThreshold", t, -40))
          ? db(control(n, "duckAmount", t, -12))
          : 1;
      const seconds = control(
          n,
          target < duck ? "duckAttack" : "duckRelease",
          t,
          target < duck ? 0.15 : 0.4,
        ),
        smoothing = seconds <= 0 ? 0 : Math.exp(-1 / (seconds * rate));
      duck = target + (duck - target) * smoothing;
      const gain =
          (control(n, "mute", t, 0) ? 0 : control(n, "volume", t, 1)) *
          db(control(n, "gain", t, 0)) *
          (detectors.length ? duck : 1),
        pan = clamp(control(n, "pan", t, 0), -1, 1);
      for (let c = 0; c < channels; c++)
        pcm[offset + c] =
          Number(pcm[offset + c]) *
          gain *
          (channels >= 2 && c < 2
            ? Math.SQRT2 *
              (c === 0
                ? Math.cos(((pan + 1) * Math.PI) / 4)
                : Math.sin(((pan + 1) * Math.PI) / 4))
            : 1);
    }
    for (const fx of n.children.filter((n) => n.name === "audioEffect")) {
      const side = fx.attributes.sidechain
        ? render(String(fx.attributes.sidechain))
        : undefined;
      pcm = effect(pcm, fx, rate, channels, control, side);
    }
    return pcm;
  }
  /** @param {string} id @returns {Float32Array} */
  function render(id) {
    const hit = results.get(id);
    if (hit) return hit;
    if (pending.has(id))
      throw new Error(`audio routing/sidechain cycle at ${id}`);
    const n = byId.get(id);
    if (!n) throw new Error(`unknown ducking/sidechain source ${id}`);
    pending.add(id);
    /** @type {Float32Array} */ let pcm = new Float32Array(size);
    if (n.name === "bus") {
      for (const child of nodes.filter((c) => destination(c) === id)) {
        const data = render(String(child.attributes.id));
        for (let i = 0; i < size; i++)
          pcm[i] = Number(pcm[i]) + Number(data[i]);
      }
    } else {
      const a = n.attributes,
        asset = assetOf(String(a.asset));
      const metadata = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            `a:${asset.audioStream ?? 0}`,
            "-show_entries",
            "stream=channels",
            "-of",
            "json",
            asset.path,
          ],
          { encoding: "utf8" },
        ),
      );
      const inputChannels = Number(metadata.streams?.[0]?.channels);
      if (format.layout.startsWith("ambisonic") && inputChannels !== channels)
        throw new Error(
          "ambisonic assets must already use the requested ACN/SN3D channel count",
        );
      const filters = [
        ...(asset.timelineAudio
          ? [`aresample=${rate}:async=1:first_pts=0`]
          : []),
        ...(inputChannels === 1 && channels === 2
          ? ["pan=stereo|c0=c0|c1=c0"]
          : []),
      ];
      const source = fromBytes(
        execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-xerror",
            "-i",
            asset.path,
            "-map",
            `0:a:${asset.audioStream ?? 0}`,
            ...(filters.length ? ["-af", filters.join(",")] : []),
            "-ar",
            String(rate),
            "-ac",
            String(channels),
            "-f",
            "f32le",
            "pipe:1",
          ],
          { maxBuffer: 1 << 30 },
        ),
      );
      const start =
          Number(a.start ?? 0) +
          (a.startMarker && runtime
            ? runtime.timeline.marker(a.startMarker)
            : 0),
        clipIn = Number(a.clipIn ?? 0),
        clipOut = Number(a.clipOut ?? source.length / channels / rate),
        speed = Number(a.speed ?? 1);
      if (
        !Number.isFinite(clipIn + clipOut + start + speed) ||
        clipIn < 0 ||
        clipOut <= clipIn ||
        speed === 0
      )
        throw new Error(`invalid audio trim/speed for ${id}`);
      let clip = source.slice(
        Math.round(clipIn * rate) * channels,
        Math.round(clipOut * rate) * channels,
      );
      if (a.reverse === true || speed < 0) {
        const copy = clip.slice(),
          count = clip.length / channels;
        for (let i = 0; i < count; i++)
          for (let c = 0; c < channels; c++)
            clip[i * channels + c] = Number(
              copy[(count - 1 - i) * channels + c],
            );
      }
      const tempo = Math.abs(speed);
      if (tempo !== 1)
        clip = filterPcm(
          clip,
          rate,
          channels,
          a.preservePitch !== false
            ? `rubberband=tempo=${tempo}:channels=together`
            : `asetrate=${rate * tempo},aresample=${rate}`,
        );
      let count = clip.length / channels;
      if (a.fitToDuration === true) {
        const assetNode = scene.children
            .find((n) => n.name === "assets")
            ?.children.find((n) => n.attributes.id === a.asset),
          bpm = Number(assetNode?.attributes.bpm);
        if (!Number.isFinite(bpm) || bpm <= 0)
          throw new Error(`fitToDuration requires asset bpm: ${id}`);
        const grid = scene.children
          .find((n) => n.name === "markers")
          ?.children.find((n) => n.name === "beatGrid");
        const bar = Math.round(
          (((60 / bpm) * Number(grid?.attributes.beatsPerBar ?? 4)) / tempo) *
            rate,
        );
        if (count < bar)
          throw new Error(
            `fitToDuration source must contain a full bar: ${id}`,
          );
        count = Math.floor(count / bar) * bar;
      }
      const begin = Math.round(start * rate),
        length =
          a.fitToDuration === true
            ? frames - begin
            : count * (Number(a.loop ?? 0) + 1),
        end = Math.min(frames, begin + length);
      const fadeIn = Number(a.fadeIn ?? 0) * rate,
        fadeOut = Number(a.fadeOut ?? 0) * rate;
      for (let i = Math.max(0, begin); i < end && count > 0; i++) {
        const local = i - begin,
          volume =
            fadeIn > 0
              ? fade(local / fadeIn, String(a.fadeCurve ?? "linear"))
              : 1,
          out =
            fadeOut > 0
              ? fade(
                  (length - local - 1) / fadeOut,
                  String(a.fadeCurve ?? "linear"),
                )
              : 1;
        for (let c = 0; c < channels; c++)
          pcm[i * channels + c] =
            Number(clip[(local % count) * channels + c]) * volume * out;
      }
    }
    pcm = process(n, pcm);
    pending.delete(id);
    results.set(id, pcm);
    return pcm;
  }
  // Visit every node: disconnected routing cycles must also be diagnosed.
  for (const n of nodes) render(String(n.attributes.id));
  /** @type {Float32Array} */ let pcm = new Float32Array(size);
  for (const n of nodes.filter((n) => !destination(n))) {
    const source = render(String(n.attributes.id));
    for (let i = 0; i < size; i++) pcm[i] = Number(pcm[i]) + Number(source[i]);
  }
  if (master) pcm = process(master, pcm);
  return { pcm, ...format, stems: results };
}
/** @param {string} path @param {Float32Array} pcm @param {number} rate @param {number} channels */
export function writeFloatWav(path, pcm, rate, channels) {
  const raw = pcmBytes(pcm),
    header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(raw.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(raw.length, 40);
  writeFileSync(path, Buffer.concat([header, raw]));
}
/** BS.1770/EBU R128 measurement through libavfilter (silence is represented by null). @param {string} file */
export function measureAudio(file) {
  const p = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      file,
      "-af",
      "loudnorm=print_format=json",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  if (p.status !== 0) throw new Error(`audio measurement failed: ${p.stderr}`);
  const m = JSON.parse(
    p.stderr.slice(p.stderr.lastIndexOf("{"), p.stderr.lastIndexOf("}") + 1),
  );
  const finite = (/** @type {string} */ key) =>
    Number.isFinite(Number(m[key])) ? Number(m[key]) : null;
  return {
    integrated: finite("input_i"),
    truePeak: finite("input_tp"),
    lra: finite("input_lra"),
    threshold: finite("input_thresh"),
  };
}
/** @param {ReturnType<typeof mixAudio>} mix @param {Node|undefined} master @param {string} work */
export function finishAudio(mix, master, work) {
  const a = master?.attributes ?? {},
    raw = join(work, "mix-float.wav"),
    path = join(work, "mix.wav");
  writeFloatWav(raw, mix.pcm, mix.rate, mix.channels);
  const before = measureAudio(raw),
    filters = [],
    target = Number(a.loudness ?? -14),
    peak = Number(a.truePeak ?? -1),
    normalize = String(a.normalize ?? "none");
  if (target < -70 || target > -5 || peak < -9 || peak > 0)
    throw new Error("loudness must be -70…-5 LUFS; truePeak -9…0 dBTP");
  if (before.integrated !== null && normalize === "integrated")
    filters.push(`volume=${db(target - before.integrated)}`);
  if (before.integrated !== null && normalize === "dynamic")
    filters.push(`loudnorm=I=${target}:TP=${peak}:LRA=7:linear=false`);
  // Four-times oversampling and latency compensation; normalization and independent limiter share the ceiling.
  if (a.limiter === true || normalize !== "none")
    filters.push(
      `aresample=${mix.rate * 4}`,
      `alimiter=limit=${db(peak)}:level=false:latency=true:attack=5:release=50`,
      `aresample=${mix.rate}`,
    );
  filters.push(
    `aresample=${mix.rate}:osf=${mix.bits === 16 ? "s16" : "s32"}:output_sample_bits=${mix.bits}:dither_method=${a.dither === false ? "none" : "triangular"}`,
  );
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      raw,
      "-af",
      filters.join(","),
      "-ar",
      String(mix.rate),
      "-ac",
      String(mix.channels),
      ...(["mono", "stereo", "5.1", "7.1", "7.1.4"].includes(mix.layout)
        ? ["-channel_layout", mix.layout]
        : []),
      "-c:a",
      `pcm_s${mix.bits}le`,
      path,
    ],
    { maxBuffer: 1 << 24 },
  );
  const after = measureAudio(path),
    report = {
      format: {
        sampleRate: mix.rate,
        channels: mix.channels,
        channelLayout: mix.layout,
        bitDepth: mix.bits,
      },
      normalize,
      targetLUFS: target,
      ceilingDBTP: peak,
      before,
      after,
      samples: mix.pcm.length / mix.channels,
    };
  writeFileSync(
    join(work, "audio-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return { path, report };
}
