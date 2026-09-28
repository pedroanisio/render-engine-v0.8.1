import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Surface } from "../render/surface.js";
import { rgbaSurface } from "./color.js";
import { fpsOf } from "./clock.js";
/** ffprobe results keyed by file identity and probe version, so repeated runs
 * over the same assets skip the process spawns. Lives in the OS temp dir. */
const probeCacheFile = join(tmpdir(), "scene-render-probe-cache.json");
/** @type {Record<string, unknown>|undefined} */ let probeCache;
/** @type {string|undefined} */ let probeVersion;
function loadProbeCache() {
  if (probeCache) return probeCache;
  try {
    probeCache = JSON.parse(readFileSync(probeCacheFile, "utf8"));
  } catch {
    probeCache = {};
  }
  return /** @type {Record<string, unknown>} */ (probeCache);
}
/** @param {string} path */
export function probe(path) {
  const cache = loadProbeCache();
  let key;
  try {
    const st = statSync(path);
    probeVersion ??= execFileSync("ffprobe", ["-version"], {
      encoding: "utf8",
    }).split("\n")[0];
    key = `${probeVersion}|${resolve(path)}|${st.size}|${st.mtimeMs}`;
    const hit = cache[key];
    if (hit !== undefined) return structuredClone(hit);
  } catch {
    key = undefined;
  }
  const p = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8", maxBuffer: 16 << 20 },
    ),
  );
  if (key !== undefined) {
    cache[key] = p;
    try {
      const tmp = `${probeCacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(cache));
      renameSync(tmp, probeCacheFile);
    } catch {
      // A cache write failure only costs the next run a probe.
    }
  }
  return structuredClone(p);
}
/** @param {Uint8Array} bytes @param {Record<string,any>} a @param {number} [scale] @param {string} [path] */
export async function decodeImage(bytes, a, scale = 1, path) {
  let raw, metadata;
  if (
    bytes[0] === 0x76 &&
    bytes[1] === 0x2f &&
    bytes[2] === 0x31 &&
    bytes[3] === 0x01
  ) {
    if (!path) throw new Error("EXR requires a resolved source path");
    const decoded = execFileSync(
        process.env.SCENE_RENDER_PYTHON ?? "python3",
        [
          new URL("./exr-import.py", import.meta.url).pathname,
          path,
          String(a.layer ?? ""),
        ],
        { maxBuffer: 1 << 30 },
      ),
      newline = decoded.indexOf(10);
    metadata = JSON.parse(decoded.subarray(0, newline).toString("utf8"));
    const payload = decoded.subarray(newline + 1);
    raw = Float32Array.from({ length: payload.length / 4 }, (_, i) =>
      payload.readFloatLE(i * 4),
    );
    if (a.transfer === undefined || a.transfer === "auto")
      a = { ...a, transfer: "linear" };
    if (a.alpha === undefined || a.alpha === "auto")
      a = { ...a, alpha: "premultiplied" };
  } else if (a.layer !== undefined) {
    if (!path) throw new Error("layered image requires a resolved file");
    const info = execFileSync("identify", ["-format", "%s|%l|%w|%h\\n", path], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map((line) => line.split("|"));
    const match = info.find(
      (row) => row[0] === String(a.layer) || row[1] === String(a.layer),
    );
    if (!match) throw new Error(`missing image layer ${a.layer}`);
    metadata = { width: Number(match[2]), height: Number(match[3]) };
    raw = execFileSync(
      "convert",
      [`${path}[${match[0]}]`, "-auto-orient", "-depth", "8", "RGBA:-"],
      { maxBuffer: metadata.width * metadata.height * 4 + 1048576 },
    );
  } else {
    try {
      const image = sharp(Buffer.from(bytes), {
        failOn: "warning",
        limitInputPixels: 268435456,
      });
      const meta = await image.metadata();
      const pipeline = image.rotate().ensureAlpha();
      const decoded =
        meta.depth === "ushort"
          ? await pipeline
              .toColourspace("rgb16")
              .raw({ depth: "ushort" })
              .toBuffer({ resolveWithObject: true })
          : await pipeline.raw().toBuffer({ resolveWithObject: true });
      raw =
        meta.depth === "ushort"
          ? Uint16Array.from({ length: decoded.data.length / 2 }, (_, i) =>
              decoded.data.readUInt16LE(i * 2),
            )
          : decoded.data;
      metadata = {
        ...meta,
        width: decoded.info.width,
        height: decoded.info.height,
      };
    } catch (error) {
      if (!path || /\.(png|jpe?g|webp|tiff?|gif|avif)$/i.test(path))
        throw error;
      const stream = probe(path).streams.find(
        (/** @type {any} */ s) => s.codec_type === "video",
      );
      if (!stream) throw new Error("image contains no video stream");
      metadata = { width: Number(stream.width), height: Number(stream.height) };
      raw = execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-xerror",
          "-i",
          path,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "pipe:1",
        ],
        { maxBuffer: metadata.width * metadata.height * 4 + 1048576 },
      );
    }
  }
  if (raw.length !== metadata.width * metadata.height * 4)
    throw new Error("truncated image");
  const surface = resizeSurface(
    rgbaSurface(raw, metadata.width, metadata.height, a),
    Math.max(1, Math.round(Number(a.width ?? metadata.width) * scale)),
    Math.max(1, Math.round(Number(a.height ?? metadata.height) * scale)),
  );
  return { surface, metadata };
}
/** Resample associated linear values, never encoded RGB beside transparent pixels.
 * @param {Surface} source @param {number} width @param {number} height */
export function resizeSurface(source, width, height) {
  if (source.width === width && source.height === height) return source;
  const out = new Surface(width, height),
    sw = source.width,
    sh = source.height,
    s = source.data,
    o = out.data;
  for (let y = 0; y < height; y++) {
    const sy = ((y + 0.5) * sh) / height - 0.5,
      iy = Math.floor(sy),
      fy = sy - iy,
      row0 = Math.max(0, Math.min(sh - 1, iy)) * sw,
      row1 = Math.max(0, Math.min(sh - 1, iy + 1)) * sw;
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * sw) / width - 0.5,
        ix = Math.floor(sx),
        fx = sx - ix,
        col0 = Math.max(0, Math.min(sw - 1, ix)),
        col1 = Math.max(0, Math.min(sw - 1, ix + 1)),
        target = (y * width + x) * 4;
      // Accumulate through the float32 output in the original tap order.
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const at = ((j ? row1 : row0) + (i ? col1 : col0)) * 4,
            k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
          o[target] =
            /** @type {number} */ (o[target]) +
            /** @type {number} */ (s[at]) * k;
          o[target + 1] =
            /** @type {number} */ (o[target + 1]) +
            /** @type {number} */ (s[at + 1]) * k;
          o[target + 2] =
            /** @type {number} */ (o[target + 2]) +
            /** @type {number} */ (s[at + 2]) * k;
          o[target + 3] =
            /** @type {number} */ (o[target + 3]) +
            /** @type {number} */ (s[at + 3]) * k;
        }
    }
  }
  return out;
}
/** Accurate random-access decode. Optical flow uses FFmpeg's motion-compensated interpolator. */
export class VideoDecoder {
  /** @param {string} path @param {Record<string,any>} a */
  constructor(path, a) {
    this.path = path;
    this.a = a;
    this.fps = fpsOf(a.fps).value;
    /** @type {Map<string,Surface>} */ this.frames = new Map();
    this.bytes = 0;
  }
  /** @param {number} time @param {number} scale @param {string} [blend] @returns {Surface} */
  frame(time, scale, blend = "none") {
    const a = this.a,
      t = Math.max(0, Math.min(Number(a.duration) - 1 / this.fps, time)),
      frame = t * this.fps,
      index = Math.floor(frame),
      fraction = frame - index;
    if (blend === "frame-mix" && fraction > 1e-8) {
      const x = this.frame(index / this.fps, scale),
        y = this.frame((index + 1) / this.fps, scale),
        out = new Surface(x.width, x.height);
      for (let i = 0; i < out.data.length; i++)
        out.data[i] =
          Number(x.data[i]) * (1 - fraction) + Number(y.data[i]) * fraction;
      return out;
    }
    const key = `${blend}:${blend === "optical-flow" ? Math.round(t * 1024) : index}:${scale}`,
      hit = this.frames.get(key);
    if (hit) return hit;
    const w = Math.max(
        1,
        Math.round(Number(a.width) * Number(a.pixelAspect ?? 1) * scale),
      ),
      h = Math.max(1, Math.round(Number(a.height) * scale));
    let filters = [];
    if (blend === "optical-flow")
      filters.push(
        `pad=${Math.max(32, Number(a.width))}:${Math.max(32, Number(a.height))}`,
        "tpad=stop_mode=clone:stop_duration=2",
        "minterpolate=fps=1024:mi_mode=mci:mc_mode=aobmc:me_mode=bidir",
        `select=eq(n\\,${Math.round(t * 1024)})`,
        `crop=${a.width}:${a.height}`,
      );
    else filters.push("select=eq(n\\,0)");
    filters.push(`scale=${w}:${h}`);
    const rotation = Number(a.rotation ?? 0);
    if (rotation === 90) filters.push("transpose=clock");
    if (rotation === 270) filters.push("transpose=cclock");
    if (rotation === 180) filters.push("hflip", "vflip");
    const raw = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-xerror",
        "-noautorotate",
        ...(blend === "optical-flow" ? [] : ["-ss", String(index / this.fps)]),
        "-i",
        this.path,
        "-an",
        "-vf",
        filters.join(","),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { maxBuffer: w * h * 4 + 1048576 },
    );
    if (raw.length !== w * h * 4)
      throw new Error(`video frame unavailable at ${t}: ${this.path}`);
    const out = rgbaSurface(
        raw,
        rotation % 180 ? h : w,
        rotation % 180 ? w : h,
        a,
      ),
      size = out.data.byteLength;
    while (this.bytes + size > 64 * 1024 * 1024 && this.frames.size) {
      const k = String(this.frames.keys().next().value),
        old = this.frames.get(k);
      this.bytes -= old?.data.byteLength ?? 0;
      this.frames.delete(k);
    }
    this.frames.set(key, out);
    this.bytes += size;
    return out;
  }
}
