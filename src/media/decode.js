import sharp from "sharp";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { Surface } from "../render/surface.js";
import { rgbaSurface } from "./color.js";
import { fpsOf } from "./clock.js";
import { framePosition } from "../eval/frames.js";
/** Largest decoded image surface (float32 RGBA, 16 bytes per pixel). */
export const MAX_IMAGE_BYTES = 1 << 30;
/** @param {number} width @param {number} height */
function checkPixels(width, height) {
  const bytes = width * height * 16;
  if (!(bytes <= MAX_IMAGE_BYTES))
    throw new Error(
      `image ${width}x${height} decodes to ${bytes} bytes, above the ${MAX_IMAGE_BYTES}-byte surface limit`,
    );
}
/** Demuxers that open further files, devices or network streams named by the input. */
const REFERENCING = new Set([
  "hls",
  "applehttp",
  "dash",
  "concat",
  "ffconcat",
  "imf",
  "webm_dash_manifest",
  "sdp",
  "rtp",
  "rtsp",
  "sap",
  "avisynth",
  "vapoursynth",
  "lavfi",
]);
/** @type {string|undefined} */ let demuxers;
/** FFmpeg/ffprobe input options confining a read to the named local file: the
 * file protocol only, and no playlist, concat, manifest or device demuxer. */
export function inputOptions() {
  demuxers ??= execFileSync("ffprobe", ["-hide_banner", "-demuxers"], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap((line) => {
      const m = /^ D[ E]([ d]) (\S+)/.exec(line);
      return m && m[1] !== "d" ? String(m[2]).split(",") : [];
    })
    .filter((name) => !REFERENCING.has(name))
    .join(",");
  return ["-protocol_whitelist", "file", "-format_whitelist", demuxers];
}
/** Run a path-based decoder on a private copy of the verified bytes, so the
 * decoded data is exactly the hashed data and relative references resolve
 * into an empty folder. @template T
 * @param {Uint8Array} bytes @param {string} path @param {(copy:string)=>T} run */
function withCopy(bytes, path, run) {
  const folder = mkdtempSync(join(tmpdir(), "scene-decode-")),
    ext = extname(path).toLowerCase();
  try {
    const copy = join(folder, "source" + (/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""));
    writeFileSync(copy, bytes);
    return run(copy);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
/** ImageMagick coder named by the file signature, never by the file itself.
 * @param {Uint8Array} b */
function magickCoder(b) {
  const sig = Buffer.from(b.subarray(0, 8)).toString("latin1");
  if (sig.startsWith("8BPS")) return "psd";
  if (sig.startsWith("II*\0") || sig.startsWith("MM\0*")) return "tiff";
  if (sig.startsWith("GIF8")) return "gif";
  if (sig.startsWith("\x89PNG")) return "png";
  if (sig.startsWith("\0\0\x01\0")) return "ico";
  throw new Error("layered image must be PSD, TIFF, GIF, PNG or ICO");
}/** ffprobe results keyed by file identity and probe version, so repeated runs
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
    key = `${probeVersion}|confined|${resolve(path)}|${st.size}|${st.mtimeMs}`;
    const hit = cache[key];
    if (hit !== undefined) return structuredClone(hit);
  } catch {
    key = undefined;
  }
  const p = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        ...inputOptions(),
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ],
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
    const decoded = withCopy(bytes, path, (copy) =>
        execFileSync(
          process.env.SCENE_RENDER_PYTHON ?? "python3",
          [
            new URL("./exr-import.py", import.meta.url).pathname,
            copy,
            String(a.layer ?? ""),
          ],
          { maxBuffer: MAX_IMAGE_BYTES + 4096 },
        ),
      ),
      newline = decoded.indexOf(10);
    metadata = JSON.parse(decoded.subarray(0, newline).toString("utf8"));
    checkPixels(metadata.width, metadata.height);
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
    const coder = magickCoder(bytes);
    ({ raw, metadata } = withCopy(bytes, path, (copy) => {
      const info = execFileSync(
        "identify",
        ["-format", "%s|%l|%w|%h\\n", `${coder}:${copy}`],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .map((line) => line.split("|"));
      const match = info.find(
        (row) => row[0] === String(a.layer) || row[1] === String(a.layer),
      );
      if (!match) throw new Error(`missing image layer ${a.layer}`);
      const metadata = { width: Number(match[2]), height: Number(match[3]) };
      checkPixels(metadata.width, metadata.height);
      const raw = execFileSync(
        "convert",
        [
          `${coder}:${copy}[${match[0]}]`,
          "-auto-orient",
          "-depth",
          "8",
          "RGBA:-",
        ],
        { maxBuffer: metadata.width * metadata.height * 4 + 1048576 },
      );
      return { raw, metadata };
    }));
  } else {
    try {
      const image = sharp(Buffer.from(bytes), {
        failOn: "warning",
        limitInputPixels: MAX_IMAGE_BYTES / 16,
      });
      const meta = await image.metadata();
      checkPixels(Number(meta.width), Number(meta.height));
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
      if (
        !path ||
        /\.(png|jpe?g|webp|tiff?|gif|avif)$/i.test(path) ||
        /surface limit/.test(String(error))
      )
        throw error;
      ({ raw, metadata } = withCopy(bytes, path, (copy) => {
        const stream = probe(copy).streams.find(
          (/** @type {any} */ s) => s.codec_type === "video",
        );
        if (!stream) throw new Error("image contains no video stream");
        const metadata = {
          width: Number(stream.width),
          height: Number(stream.height),
        };
        checkPixels(metadata.width, metadata.height);
        const raw = execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-xerror",
            ...inputOptions(),
            "-i",
            copy,
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
        return { raw, metadata };
      }));
    }
  }
  if (raw.length !== metadata.width * metadata.height * 4)
    throw new Error("truncated image");
  const width = Math.max(
      1,
      Math.round(Number(a.width ?? metadata.width) * scale),
    ),
    height = Math.max(1, Math.round(Number(a.height ?? metadata.height) * scale));
  checkPixels(width, height);
  const surface = resizeSurface(
    rgbaSurface(raw, metadata.width, metadata.height, a),
    width,
    height,
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
  /** `check` runs before and after every decode and throws when the source
   * changed since it was verified.
   * @param {string} path @param {Record<string,any>} a @param {()=>void} [check] */
  constructor(path, a, check = () => {}) {
    this.path = path;
    this.a = a;
    this.check = check;
    this.fps = fpsOf(a.fps).value;
    /** Last decodable frame, learned when the declared duration overstates the stream. */
    this.last = Infinity;
    /** @type {Map<string,Surface>} */ this.frames = new Map();
    this.bytes = 0;
  }
  /** @param {number} time @param {number} scale @param {string} [blend] @returns {Surface} */
  frame(time, scale, blend = "none") {
    const t = Math.max(0, Math.min(Number(this.a.duration) - 1 / this.fps, time)),
      position = framePosition(t, this.fps),
      index = Math.floor(position),
      fraction = position - index;
    if (blend === "frame-mix" && fraction > 1e-8) {
      const x = this.decode(index, t, scale, "none"),
        y = this.decode(index + 1, t, scale, "none"),
        out = new Surface(x.width, x.height);
      for (let i = 0; i < out.data.length; i++)
        out.data[i] =
          Number(x.data[i]) * (1 - fraction) + Number(y.data[i]) * fraction;
      return out;
    }
    return this.decode(index, t, scale, blend);
  }
  /** Decode frame `index` (or source time `t` for optical flow), stepping back
   * to the last frame the stream actually holds.
   * @param {number} index @param {number} t @param {number} scale @param {string} blend @param {number} [back] @returns {Surface} */
  decode(index, t, scale, blend, back = Math.ceil(this.fps)) {
    index = Math.min(index, this.last);
    const a = this.a,
      key = `${blend}:${blend === "optical-flow" ? Math.round(t * 1024) : index}:${scale}`,
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
    this.check();
    const raw = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-xerror",
        "-noautorotate",
        ...inputOptions(),
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
    this.check();
    if (raw.length !== w * h * 4) {
      // A declared duration within tolerance of the stream may name a frame
      // past its end: clamp to the last frame that exists (within a second).
      if (blend !== "optical-flow" && index > 0 && back > 0 && !raw.length) {
        const previous = this.decode(index - 1, t, scale, blend, back - 1);
        this.last = Math.min(this.last, index - 1);
        return previous;
      }
      throw new Error(`video frame unavailable at ${t}: ${this.path}`);
    }
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
