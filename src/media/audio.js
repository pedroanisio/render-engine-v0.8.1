import { audioFormat } from "../render/audio.js";
import {
  transitionWindows,
  transitionGain,
  handles,
} from "../render/transitions.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { canvasPaint } from "./canvas-paint.js";
import { rgbaSurface } from "./color.js";
import { assetPath, fingerprint, verifiedPath } from "./resolve.js";
import { inputOptions } from "./decode.js";
import { mediaTime, mediaRemap } from "./clock.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** `check` runs before and after decoding and throws when the source changed.
 * @param {string} path @param {number} [stream] @param {number} [channels] @param {number} [rate] @param {()=>void} [check] */
export function decodeAudio(
  path,
  stream = 0,
  channels = 1,
  rate = 48000,
  check = () => {},
) {
  check();
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      ...inputOptions(),
      "-i",
      path,
      "-map",
      `0:a:${stream}`,
      "-af",
      `aresample=${rate}:async=1:first_pts=0`,
      "-ac",
      String(channels),
      "-ar",
      String(rate),
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 1 << 30 },
  );
  check();
  const pcm = new Float32Array(raw.length / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = raw.readFloatLE(i * 4);
  return pcm;
}
/** Radix-2 FFT magnitude. @param {Float64Array} real */
export function spectrum(real) {
  const n = real.length,
    imag = new Float64Array(n),
    r = real.slice();
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const old = Number(r[i]);
      r[i] = Number(r[j]);
      r[j] = old;
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = (-2 * Math.PI) / length;
    for (let i = 0; i < n; i += length)
      for (let j = 0; j < length / 2; j++) {
        const at = i + j,
          other = at + length / 2,
          c = Math.cos(angle * j),
          s = Math.sin(angle * j),
          re = Number(r[other]) * c - Number(imag[other]) * s,
          im = Number(r[other]) * s + Number(imag[other]) * c;
        r[other] = Number(r[at]) - re;
        imag[other] = Number(imag[at]) - im;
        r[at] = Number(r[at]) + re;
        imag[at] = Number(imag[at]) + im;
      }
  }
  return Float64Array.from(
    { length: n / 2 },
    (_, i) => (Math.hypot(Number(r[i]), Number(imag[i])) * 2) / n,
  );
}
/** Absolute-time finite smoothing gives identical results under shuffled frame requests.
 * @param {Float32Array} pcm @param {Record<string,any>} a @param {number} time @param {number} scale @param {Parameters<typeof canvasPaint>[1]} [env] */
export function audiogramSurface(pcm, a, time, scale, env) {
  const count = Number(a.bars ?? 48),
    n = 1024,
    bins = new Float64Array(count),
    wave = new Float64Array(count);
  let weight = 0;
  for (let history = 0; history < 8; history++) {
    const gain = Number(a.smoothing ?? 0.5) ** history;
    if (gain < 1e-6) break;
    weight += gain;
    const start = Math.floor(time * 48000) - n - history * 256,
      window = Float64Array.from(
        { length: n },
        (_, i) =>
          Number(pcm[start + i] ?? 0) *
          (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))),
      ),
      fft = spectrum(window);
    for (let i = 0; i < count; i++) {
      const lo = Math.floor((n / 2) ** (i / count)),
        hi = Math.max(lo + 1, Math.floor((n / 2) ** ((i + 1) / count)));
      let level = 0;
      for (let b = lo; b < hi; b++)
        level = Math.max(level, Number(fft[b] ?? 0));
      if (a.style === "bars" || a.style === "line") {
        let energy = 0;
        const from = Math.floor((i * n) / count),
          to = Math.floor(((i + 1) * n) / count);
        for (let j = from; j < to; j++)
          energy += Number(pcm[start + j] ?? 0) ** 2;
        level = Math.sqrt(energy / Math.max(1, to - from));
      }
      bins[i] = Number(bins[i]) + Math.min(1, level * 4) * gain;
      wave[i] =
        Number(wave[i]) +
        Number(pcm[start + Math.floor((i * n) / count)] ?? 0) * gain;
    }
  }
  const w = Math.max(1, Math.round(a.width * scale)),
    h = Math.max(1, Math.round(a.height * scale)),
    canvas = createCanvas(w, h),
    ctx = canvas.getContext("2d");
  const fill = env
    ? canvasPaint(ctx, { ...env, scale: 1 }, w, h, 1)(String(a.color))
    : String(a.color);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const value = Number(bins[i]) / weight,
      x = ((i + 0.5) * w) / count,
      y = h / 2 - (Number(wave[i]) / weight) * h * 0.45;
    if (a.style === "bars" || a.style === "spectrum")
      ctx.fillRect(
        (i * w) / count,
        h * (1 - value),
        (w / count) * 0.75,
        h * value,
      );
    else if (a.style === "circle") {
      const angle = (i / count) * Math.PI * 2,
        r = Math.min(w, h) * (0.25 + value * 0.2),
        xx = w / 2 + Math.cos(angle) * r,
        yy = h / 2 + Math.sin(angle) * r;
      if (i) ctx.lineTo(xx, yy);
      else ctx.moveTo(xx, yy);
    } else {
      const yy = a.style === "line" ? h * (1 - value) : y;
      if (i) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
    }
  }
  if (a.style === "circle") ctx.closePath();
  ctx.stroke();
  return rgbaSurface(ctx.getImageData(0, 0, w, h).data, w, h);
}
/** Bake embedded video audio using the same random-access source clock as pixels.
 * @param {Node} scene @param {ReturnType<import('../eval/runtime.js').compileRuntime>} runtime @param {string} base @param {string} work */
export function videoAudio(scene, runtime, base, work) {
  const { rate, channels } = audioFormat(scene);
  const assetNodes =
      scene.children.find((n) => n.name === "assets")?.children ?? [],
    assets = new Map(assetNodes.map((n) => [String(n.attributes.id), n]));
  /** @type {Map<string,Float32Array>} */ const decoded = new Map();
  /** @type {Map<string,string>} */ const paths = new Map();
  /** @type {Node[]} */ const tracks = [];
  const duration = runtime.timeline.duration;
  /** Decode the audio of a verified source: a declared hash is re-checked here
   * and the file must stay unchanged while FFmpeg reads it. @param {Node} asset */
  function bake(asset) {
    const src = String(asset.attributes.src),
      path = assetPath(base, src),
      { sha256, identity } = fingerprint(path);
    if (
      asset.attributes.sha256 !== undefined &&
      sha256 !== String(asset.attributes.sha256).toLowerCase()
    )
      throw new Error(`${src}: SHA-256 mismatch`);
    return decodeAudio(
      path,
      Number(asset.attributes.audioStream ?? 0),
      channels,
      rate,
      () => verifiedPath(base, src, identity),
    );
  }
  /** @param {Node} n @param {Node[]} parents */
  function walk(n, parents) {
    if (n.name === "layer") {
      const asset = assets.get(String(n.attributes.asset));
      if (asset?.name === "video" && asset.attributes.hasAudio === true) {
        const id = String(asset.attributes.id),
          pcm =
            decoded.get(id) ?? bake(asset);
        decoded.set(id, pcm);
        const remap = mediaRemap(scene, n),
          samples = Math.ceil(duration * rate),
          raw = Buffer.alloc(samples * channels * 4),
          span = runtime.timeline.spans.get(n),
          end = Number(asset.attributes.duration);
        let previous = NaN;
        for (let i = 0; i < samples; i++) {
          const time = i / rate;
          let transitionVolume = 1;
          const extended = new Set();
          for (const parent of parents)
            for (const window of transitionWindows(
              parent,
              time,
              runtime,
            ).filter((w) => w.active)) {
              const incoming =
                  window.to === n ||
                  (window.to ? parents.includes(window.to) : false),
                outgoing =
                  window.from === n ||
                  (window.from ? parents.includes(window.from) : false);
              if ((incoming || outgoing) && window.a.audio !== "none") {
                transitionVolume *= transitionGain(
                  window.a.audio === "cut"
                    ? Number(window.time >= window.cut)
                    : window.progress,
                  String(window.a.audio ?? "crossfade"),
                  incoming,
                );
                for (const node of handles(
                  /** @type {Node} */ (incoming ? window.to : window.from),
                  runtime,
                ))
                  extended.add(node);
              }
            }
          if (
            !runtime.enabled(n, time, extended.has(n)) ||
            parents.some((p) => !runtime.enabled(p, time, extended.has(p)))
          )
            continue;
          const a = runtime.attributes(n, time);
          if (a.mute === true || a.freezeAt !== undefined) continue;
          const source = mediaTime(
              { ...a, transitionHandle: extended.has(n) },
              span?.local(time) ?? time,
              end,
              remap,
            ),
            position = source * rate,
            index = Math.floor(position),
            f = position - index,
            volume = Number(a.volume ?? 1) * transitionVolume;
          if (i && source === previous) continue;
          previous = source;
          for (let c = 0; c < channels; c++)
            raw.writeFloatLE(
              (Number(pcm[index * channels + c] ?? 0) * (1 - f) +
                Number(pcm[(index + 1) * channels + c] ?? 0) * f) *
                volume,
              (i * channels + c) * 4,
            );
        }
        const key = `__video_audio_${tracks.length}`,
          path = join(work, key + ".wav");
        mkdirSync(work, { recursive: true });
        const header = Buffer.alloc(44);
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
        paths.set(key, path);
        tracks.push({
          ...n,
          name: "audioTrack",
          type: "audioTrackType",
          attributes: {
            id: key,
            asset: key,
            start: 0,
            clipIn: 0,
            clipOut: duration,
            ...(n.attributes.audioBus ? { bus: n.attributes.audioBus } : {}),
          },
          children: [],
        });
      }
    }
    for (const c of n.children) walk(c, [...parents, n]);
  }
  const composition = runtime.scene.children.find(
    (n) => n.name === "composition",
  );
  if (composition) walk(composition, []);
  const mix = scene.children.find((n) => n.name === "audioMix");
  return {
    paths,
    scene: tracks.length
      ? {
          ...scene,
          children: [
            ...scene.children.filter((n) => n.name !== "audioMix"),
            {
              ...(mix ?? scene),
              name: "audioMix",
              type: "audioMixType",
              attributes: mix?.attributes ?? {},
              children: [...(mix?.children ?? []), ...tracks],
            },
          ],
        }
      : scene,
  };
}
