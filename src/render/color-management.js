/** Scene-linear primaries, ordered looks and display conversion. Alpha never enters a colour transform. */
import { readFileSync } from "node:fs";
import { colors, mix, clamp } from "./fx/pixels.js";
import { grade } from "./fx/grade.js";
import { native, resources, bundle } from "./fx/native.js";
import { linearize } from "../media/color.js";
import { Surface, clampRect, fullRect } from "./surface.js";
import { endianness } from "node:os";
import { quantizer, level } from "./encode-lut.js";
const BITS32 = new Float32Array(1),
  WORD32 = new Uint32Array(BITS32.buffer);
const LITTLE_ENDIAN = endianness() === "LE";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
const tables = JSON.parse(
  readFileSync(new URL("../media/color-tables.json", import.meta.url), "utf8"),
);
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** @param {number[]} m */
function inverse(m) {
  const [a, b, c, d, e, f, g, h, i] = m.map(Number),
    A = Number(a),
    B = Number(b),
    C = Number(c),
    D = Number(d),
    E = Number(e),
    F = Number(f),
    G = Number(g),
    H = Number(h),
    I = Number(i),
    det = A * (E * I - F * H) - B * (D * I - F * G) + C * (D * H - E * G);
  return [
    E * I - F * H,
    C * H - B * I,
    B * F - C * E,
    F * G - D * I,
    A * I - C * G,
    C * D - A * F,
    D * H - E * G,
    B * G - A * H,
    A * E - B * D,
  ].map((v) => v / det);
}
/** @param {string} space */
function matrix(space) {
  return ["srgb", "linear-srgb", "rec709", "raw"].includes(space)
    ? identity
    : (tables.matrices[space] ??
        (() => {
          throw new Error(`Unknown color space ${space}`);
        })());
}
/** @param {number[]} rgb @param {number[]} m */
const mul = (rgb, m) =>
  [0, 1, 2].map(
    (r) =>
      Number(m[r * 3]) * Number(rgb[0]) +
      Number(m[r * 3 + 1]) * Number(rgb[1]) +
      Number(m[r * 3 + 2]) * Number(rgb[2]),
  );
/** @param {string} space */
export function transferOf(space) {
  return ["linear-srgb", "acescg", "aces2065-1", "xyz-d65", "raw"].includes(
    space,
  )
    ? "linear"
    : space === "acescct"
      ? "acescct"
      : space === "rec709"
        ? "bt1886"
        : space === "dci-p3"
          ? "gamma26"
          : "srgb";
}
/** Inverse of the import transfer, including the audited camera log curves.
 * @param {number} x @param {string} transfer */
export function encodeTransfer(x, transfer) {
  if (transfer === "linear") return x;
  if (transfer === "srgb")
    return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  if (transfer === "gamma22" || transfer === "gamma26" || transfer === "bt1886")
    return (
      Math.max(0, x) **
      (1 / (transfer === "gamma22" ? 2.2 : transfer === "gamma26" ? 2.6 : 2.4))
    );
  let lo = 0,
    hi = 1;
  for (let n = 0; n < 32; n++) {
    const mid = (lo + hi) / 2;
    if (linearize(mid, transfer) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** @param {number[]} rgb @param {string} from @param {string} to */
export function convertRGB(rgb, from, to) {
  return from === to ? rgb : mul(mul(rgb, matrix(from)), inverse(matrix(to)));
}
/** Per-pixel colour conversion on unassociated values, reassociated on output.
 * Zero alpha maps to zero, so pixels outside the zero-region hint stay zero.
 * @param {Surface} s @param {string} from @param {string} to @param {boolean} [decode] @param {boolean} [encode] */
export function convertSpace(s, from, to, decode = false, encode = false) {
  const out = new Surface(s.width, s.height),
    W = s.width,
    d = s.data,
    o = out.data,
    region = s.bbox ? clampRect(s.bbox, W, s.height) : fullRect(s),
    A = from === to ? undefined : matrix(from),
    B = from === to ? undefined : inverse(matrix(to)),
    tf = transferOf(from),
    tt = transferOf(to);
  for (let y = region.y0; y < region.y1; y++)
    for (let x = region.x0; x < region.x1; x++) {
      const j = (y * W + x) * 4,
        a = /** @type {number} */ (d[j + 3]),
        opaque = a === 1;
      let r = opaque
          ? /** @type {number} */ (d[j])
          : a
            ? /** @type {number} */ (d[j]) / a
            : 0,
        g = opaque
          ? /** @type {number} */ (d[j + 1])
          : a
            ? /** @type {number} */ (d[j + 1]) / a
            : 0,
        b = opaque
          ? /** @type {number} */ (d[j + 2])
          : a
            ? /** @type {number} */ (d[j + 2]) / a
            : 0;
      if (decode) {
        r = linearize(r, tf);
        g = linearize(g, tf);
        b = linearize(b, tf);
      }
      if (A && B) {
        const r1 = Number(A[0]) * r + Number(A[1]) * g + Number(A[2]) * b,
          g1 = Number(A[3]) * r + Number(A[4]) * g + Number(A[5]) * b,
          b1 = Number(A[6]) * r + Number(A[7]) * g + Number(A[8]) * b;
        r = Number(B[0]) * r1 + Number(B[1]) * g1 + Number(B[2]) * b1;
        g = Number(B[3]) * r1 + Number(B[4]) * g1 + Number(B[5]) * b1;
        b = Number(B[6]) * r1 + Number(B[7]) * g1 + Number(B[8]) * b1;
      }
      if (encode) {
        r = encodeTransfer(r, tt);
        g = encodeTransfer(g, tt);
        b = encodeTransfer(b, tt);
      }
      const alpha = clamp(a);
      o[j] = opaque ? r : r * alpha;
      o[j + 1] = opaque ? g : g * alpha;
      o[j + 2] = opaque ? b : b * alpha;
      o[j + 3] = alpha;
    }
  out.bbox = s.bbox;
  return out;
}
/** Quantisation is explicitly at the managed working-buffer boundary.
 * @param {number} x */
const HALF_BITS = new Float64Array(1),
  HALF_WORDS = new Uint32Array(HALF_BITS.buffer),
  HALF_HIGH = LITTLE_ENDIAN ? 1 : 0,
  HALF_STEPS = new Float64Array(64);
for (let k = -34; k < 30; k++) HALF_STEPS[k + 34] = 2 ** k;
/** Round-to-nearest-even binary16, saturating at ±65504 (no infinities).
 * `Math.f16round` gives the same result natively where the runtime has it.
 * @type {(x:number)=>number} */
const half =
  typeof (/** @type {any} */ (Math).f16round) === "function"
    ? (x) =>
        x === 0
          ? x
          : /** @type {any} */ (Math).f16round(
              Math.max(-65504, Math.min(65504, x)),
            )
    : halfPortable;
/** @param {number} x */
function halfPortable(x) {
  if (x === 0) return x;
  const sign = Math.sign(x),
    v = Math.min(65504, Math.abs(x));
  // The exponent field gives floor(log2 v). Math.log2 may round up for values a
  // few ulps below a power of two, but there both steps round to that power.
  HALF_BITS[0] = v;
  const high = /** @type {number} */ (HALF_WORDS[HALF_HIGH]),
    e = ((high >>> 20) & 0x7ff) - 1023,
    step = /** @type {number} */ (HALF_STEPS[Math.max(-24, e - 10) + 34]);
  const q = v / step,
    n = Math.floor(q),
    rounded = q - n === 0.5 ? (n % 2 ? n + 1 : n) : Math.round(q);
  return sign * rounded * step;
}
export class ColorPipeline {
  /** @param {Node} scene @param {(src:string)=>Uint8Array} read */
  constructor(scene, read) {
    this.node = scene.children.find((n) => n.name === "colorManagement");
    this.read = read;
    this.a = this.node?.attributes ?? {};
    this.working = String(
      this.a.workingSpace ??
        scene.children.find((n) => n.name === "project")?.attributes
          .workingColorSpace ??
        "linear-srgb",
    );
    this.enabled =
      !!this.node || !["srgb", "linear-srgb"].includes(this.working);
    this.output =
      scene.children.find((n) => n.name === "output")?.attributes ?? {};
    this.files = new Map();
    /** @type {Map<string,number[]>} */ this.colorCache = new Map();
    /** Input conversions of cached media surfaces, which are never mutated.
     * @type {WeakMap<Surface,Surface>} */
    this.inputCache = new WeakMap();
    if (this.a.ocioConfig)
      this.files = resources(String(this.a.ocioConfig), read);
  }
  /** @param {number[]} c */
  rgb(c) {
    if (this.a.ocioConfig) {
      const key = c.join(",");
      const cached = this.colorCache.get(key);
      if (cached) return cached;
      const input = new Surface(1, 1);
      input.data.set([Number(c[0]), Number(c[1]), Number(c[2]), 1]);
      const out = this.input(input),
        result = [
          Number(out.data[0]),
          Number(out.data[1]),
          Number(out.data[2]),
          Number(c[3] ?? 1),
        ];
      if (this.colorCache.size >= 1024)
        this.colorCache.delete(String(this.colorCache.keys().next().value));
      this.colorCache.set(key, result);
      return result;
    }
    if (!this.enabled || ["srgb", "linear-srgb"].includes(this.working))
      return c;
    return [
      ...convertRGB(c.slice(0, 3), "linear-srgb", this.working),
      Number(c[3] ?? 1),
    ];
  }
  /** @param {Surface} s */
  input(s) {
    if (!this.enabled) return s;
    const hit = this.inputCache.get(s);
    if (hit) return hit;
    const out = this.a.ocioConfig
      ? native(s, {
          kind: "ocio-convert",
          src: String(this.a.ocioConfig),
          files: bundle(this.files),
          from: "linear-srgb",
          to: this.working,
        })
      : convertSpace(s, "linear-srgb", this.working);
    this.inputCache.set(s, out);
    return out;
  }
  /** Convert a working surface for native textures, without display transforms.
   * @param {Surface} s */
  linear(s) {
    if (this.a.ocioConfig)
      return native(s, {
        kind: "ocio-convert",
        src: String(this.a.ocioConfig),
        files: bundle(this.files),
        from: this.working,
        to: "linear-srgb",
      });
    return convertSpace(s, this.working, "linear-srgb");
  }
  /** @param {Surface} s */
  finish(s) {
    if (!this.enabled) return s;
    const depth = String(this.a.bitDepth ?? "32f"),
      exposureGain = 2 ** Number(this.a.exposure ?? 0);
    /** @param {number} v */
    const quantize = (v) => {
      v *= exposureGain;
      return depth === "8"
        ? Math.round(clamp(v) * 255) / 255
        : depth === "16"
          ? Math.round(clamp(v) * 65535) / 65535
          : depth === "16f"
            ? half(v)
            : v;
    };
    // Same per-pixel arithmetic as a colors() callback, without the call.
    let out = new Surface(s.width, s.height);
    {
      const W = s.width,
        d = s.data,
        o = out.data,
        region = s.bbox ? clampRect(s.bbox, W, s.height) : fullRect(s);
      for (let y = region.y0; y < region.y1; y++)
        for (let x = region.x0; x < region.x1; x++) {
          const j = (y * W + x) * 4,
            a = /** @type {number} */ (d[j + 3]),
            opaque = a === 1;
          const q0 = quantize(
              opaque
                ? /** @type {number} */ (d[j])
                : a
                  ? /** @type {number} */ (d[j]) / a
                  : 0,
            ),
            q1 = quantize(
              opaque
                ? /** @type {number} */ (d[j + 1])
                : a
                  ? /** @type {number} */ (d[j + 1]) / a
                  : 0,
            ),
            q2 = quantize(
              opaque
                ? /** @type {number} */ (d[j + 2])
                : a
                  ? /** @type {number} */ (d[j + 2]) / a
                  : 0,
            ),
            alpha = clamp(a);
          o[j] = opaque ? q0 : q0 * alpha;
          o[j + 1] = opaque ? q1 : q1 * alpha;
          o[j + 2] = opaque ? q2 : q2 * alpha;
          o[j + 3] = alpha;
        }
      out.bbox = s.bbox;
    }
    if (this.a.ocioConfig) {
      if (this.a.toneMapping && this.a.toneMapping !== "none") {
        const linear = native(out, {
          kind: "ocio-convert",
          src: String(this.a.ocioConfig),
          files: bundle(this.files),
          from: this.working,
          to: "linear-srgb",
        });
        out = native(
          grade(linear, {
            type: "tonemap",
            tonemapper: String(this.a.toneMapping),
          }),
          {
            kind: "ocio-convert",
            src: String(this.a.ocioConfig),
            files: bundle(this.files),
            from: "linear-srgb",
            to: this.working,
          },
        );
      }
      out = native(out, {
        kind: "ocio",
        src: String(this.a.ocioConfig),
        files: bundle(this.files),
        workingSpace: this.working,
        display: String(this.a.display ?? "srgb"),
        view: String(this.a.view ?? "standard"),
        looks: this.a.looks ?? [],
      });
      // OCIO display/view output is display encoded; retain Surface's linear-sRGB output API.
      const decoded = colors(out, (c) =>
        c.map((v) =>
          linearize(
            v,
            this.output.transfer && this.output.transfer !== "auto"
              ? String(this.output.transfer)
              : transferOf(String(this.output.colorSpace ?? "srgb")),
          ),
        ),
      );
      return convertSpace(
        decoded,
        String(this.output.colorSpace ?? "srgb"),
        "linear-srgb",
      );
    }
    const looks = new Map(
      (this.node?.children ?? []).map((n) => [String(n.attributes.id), n]),
    );
    for (const id of /** @type {string[]} */ (this.a.looks ?? [])) {
      const look = looks.get(id);
      if (!look) throw new Error(`Unknown look ${id}`);
      const a = look.attributes,
        space = String(a.space ?? "acescct"),
        before = out;
      out = convertSpace(out, this.working, space, false, true);
      if (a.src)
        out = native(out, {
          kind: "lut",
          src: String(a.src),
          files: bundle(resources(String(a.src), this.read)),
        });
      if (
        a.slope !== undefined ||
        a.offset !== undefined ||
        a.power !== undefined ||
        Number(a.saturation ?? 1) !== 1
      )
        out = grade(out, { ...a, type: "cdl" });
      out = mix(
        before,
        convertSpace(out, space, this.working, true, false),
        Number(a.mix ?? 1),
      );
    }
    out = convertSpace(out, this.working, "linear-srgb");
    const tone =
      this.a.view === "raw" ? "none" : String(this.a.toneMapping ?? "none");
    if (tone === "aces2") {
      out = native(out, { kind: "aces2" });
      out = colors(out, (c) => c.map((v) => linearize(v, "srgb")));
    } else if (tone === "agx" || tone === "filmic") {
      out = native(out, {
        kind: "builtin-display",
        view: tone === "agx" ? "AgX" : "Filmic",
      });
      out = colors(out, (c) => c.map((v) => linearize(v, "srgb")));
    } else if (tone !== "none")
      out = grade(out, { type: "tonemap", tonemapper: tone });
    const display = String(this.a.display ?? "srgb"),
      view = String(this.a.view ?? "standard");
    if (!["standard", "raw"].includes(view))
      throw new Error(`View ${view} requires ocioConfig`);
    matrix(display); // Validate the display primaries; Surface remains canonical linear sRGB.
    return out;
  }
  /**
   * Finish and encode16 parameters for the GPU frame tail (gpu.js), when this
   * pipeline's finish is the plain quantisation and its encode a verified
   * transfer; undefined for OCIO, looks, tonemapping, other working spaces or
   * transfers, which keep the CPU path.
   * @param {boolean} preserveAlpha
   * @returns {import('./gpu.js').GpuPlan|undefined}
   */
  gpuPlan(preserveAlpha) {
    const space = String(this.output.colorSpace ?? "srgb"),
      transfer = String(this.output.transfer ?? "auto"),
      q = quantizer(transfer === "auto" ? transferOf(space) : transfer);
    if (!q) return undefined;
    if (this.enabled) {
      const view = String(this.a.view ?? "standard"),
        tone = view === "raw" ? "none" : String(this.a.toneMapping ?? "none");
      if (
        this.a.ocioConfig ||
        /** @type {unknown[]} */ (this.a.looks ?? []).length ||
        this.working !== "linear-srgb" ||
        tone !== "none" ||
        !["standard", "raw"].includes(view)
      )
        return undefined;
      matrix(String(this.a.display ?? "srgb"));
    }
    const depth = !this.enabled
      ? 0
      : { 8: 1, 16: 2, "16f": 3, "32f": 4 }[String(this.a.bitDepth ?? "32f")];
    if (depth === undefined) return undefined;
    const A = space === "linear-srgb" ? undefined : matrix("linear-srgb"),
      B = space === "linear-srgb" ? undefined : inverse(matrix(space));
    return {
      depth,
      exposureGain: this.enabled ? 2 ** Number(this.a.exposure ?? 0) : 1,
      matrix: A && B ? [...A, ...B].map(Number) : undefined,
      thresholds: q.thresholds,
      preserveAlpha,
    };
  }
  /** Float planar EXR path retains scene-linear values above one and negative values.
   * @param {Surface} s @param {boolean} [preserveAlpha] */
  encodeFloat(s, preserveAlpha = true) {
    const space = String(this.output.colorSpace ?? "linear-srgb");
    const converted = convertSpace(s, "linear-srgb", space);
    const count = s.width * s.height,
      out = Buffer.alloc(count * 16);
    for (let i = 0; i < count; i++) {
      const a = Number(converted.data[i * 4 + 3]);
      for (const [plane, k] of [1, 2, 0, 3].entries())
        out.writeFloatLE(
          k === 3
            ? preserveAlpha
              ? a
              : 1
            : a > 0
              ? Number(converted.data[i * 4 + k]) / (preserveAlpha ? a : 1)
              : 0,
          (plane * count + i) * 4,
        );
    }
    return out;
  }
  /** Straight alpha, 16-bit output; never quantize HDR to 8 bits.
   * @param {Surface} s @param {boolean} [preserveAlpha] */
  encode16(s, preserveAlpha = true) {
    const space = String(this.output.colorSpace ?? "srgb");
    const transfer = String(this.output.transfer ?? "auto");
    const tr = transfer === "auto" ? transferOf(space) : transfer;
    // Verified transfers quantise float32 inputs through an exact table; other
    // inputs (semi-transparent straight values are doubles) take the power.
    const q = quantizer(tr);
    /** @param {number} x */
    const encode = (x) => {
      if (q && x >= 0 && x <= 1 && Math.fround(x) === x) {
        BITS32[0] = x;
        return level(/** @type {number} */ (WORD32[0]), q);
      }
      return Math.round(clamp(encodeTransfer(x, tr)) * 65535);
    };
    // Fused convertSpace(s, "linear-srgb", space) + quantisation. The converted
    // surface would hold float32, so its rounding is reproduced with fround.
    const from = "linear-srgb",
      A = from === space ? undefined : matrix(from),
      B = from === space ? undefined : inverse(matrix(space)),
      n = s.width * s.height,
      d = s.data,
      out = Buffer.alloc(n * 8),
      u16 =
        LITTLE_ENDIAN && (out.byteOffset & 1) === 0
          ? new Uint16Array(out.buffer, out.byteOffset, n * 4)
          : undefined;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = /** @type {number} */ (d[j + 3]);
      let r = a ? /** @type {number} */ (d[j]) / a : 0,
        g = a ? /** @type {number} */ (d[j + 1]) / a : 0,
        b = a ? /** @type {number} */ (d[j + 2]) / a : 0;
      if (A && B) {
        const r1 = Number(A[0]) * r + Number(A[1]) * g + Number(A[2]) * b,
          g1 = Number(A[3]) * r + Number(A[4]) * g + Number(A[5]) * b,
          b1 = Number(A[6]) * r + Number(A[7]) * g + Number(A[8]) * b;
        r = Number(B[0]) * r1 + Number(B[1]) * g1 + Number(B[2]) * b1;
        g = Number(B[3]) * r1 + Number(B[4]) * g1 + Number(B[5]) * b1;
        b = Number(B[6]) * r1 + Number(B[7]) * g1 + Number(B[8]) * b1;
      }
      const alpha = clamp(a),
        cr = Math.fround(r * alpha),
        cg = Math.fround(g * alpha),
        cb = Math.fround(b * alpha),
        div = preserveAlpha ? alpha : 1,
        o0 = encode(alpha > 0 ? cr / div : 0),
        o1 = encode(alpha > 0 ? cg / div : 0),
        o2 = encode(alpha > 0 ? cb / div : 0),
        o3 = Math.round(clamp(preserveAlpha ? alpha : 1) * 65535);
      if (u16) {
        u16[j] = o0;
        u16[j + 1] = o1;
        u16[j + 2] = o2;
        u16[j + 3] = o3;
      } else {
        out.writeUInt16LE(o0, j * 2);
        out.writeUInt16LE(o1, j * 2 + 2);
        out.writeUInt16LE(o2, j * 2 + 4);
        out.writeUInt16LE(o3, j * 2 + 6);
      }
    }
    return out;
  }
  /** @param {Surface} s */
  encode(s) {
    if (!this.enabled && !this.output.colorSpace && !this.output.transfer)
      return s.toRgb8();
    const display = String(
        this.a.ocioConfig
          ? (this.output.colorSpace ?? "srgb")
          : (this.a.display ?? "srgb"),
      ),
      space = String(this.output.colorSpace ?? display),
      transfer = String(this.output.transfer ?? "auto");
    const converted = convertSpace(s, "linear-srgb", space),
      out = new Uint8Array(s.width * s.height * 3);
    for (let i = 0, j = 0; i < converted.data.length; i += 4, j += 3)
      for (let k = 0; k < 3; k++)
        out[j + k] = Math.round(
          clamp(
            encodeTransfer(
              Number(converted.data[i + k]),
              transfer === "auto" ? transferOf(space) : transfer,
            ),
          ) * 255,
        );
    return out;
  }
}
