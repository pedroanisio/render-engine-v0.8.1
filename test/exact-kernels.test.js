/**
 * The rewritten pixel kernels must agree with the original per-pixel
 * implementations, kept here as references, on random inputs with and without
 * zero-region hints. Zero signs may differ; nothing else may.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Surface } from "../src/render/surface.js";
import { composite, blendColor, clamp } from "../src/render/geometry/blend.js";
import { gaussian, colors, mix, copy } from "../src/render/fx/pixels.js";
import {
  ColorPipeline,
  convertSpace,
  convertRGB,
  encodeTransfer,
  transferOf,
} from "../src/render/color-management.js";
import { rgbaSurface, linearize } from "../src/media/color.js";
import { resizeSurface } from "../src/media/decode.js";
import { noise } from "../src/eval/expression.js";

const tables = JSON.parse(
  readFileSync(
    new URL("../src/media/color-tables.json", import.meta.url),
    "utf8",
  ),
);
/** @param {number} seed */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** Random premultiplied surface; with `region`, zero outside it and hinted.
 * @param {number} w @param {number} h @param {() => number} random
 * @param {{region?: import('../src/render/surface.js').Rect, sparse?: number, hdr?: boolean, opaque?: number}} [o] */
function surface(w, h, random, o = {}) {
  const s = new Surface(w, h),
    r = o.region ?? { x0: 0, y0: 0, x1: w, y1: h };
  for (let y = r.y0; y < r.y1; y++)
    for (let x = r.x0; x < r.x1; x++) {
      if (random() < (o.sparse ?? 0.3)) continue;
      const a = random() < (o.opaque ?? 0.3) ? 1 : random(),
        j = (y * w + x) * 4,
        gain = o.hdr ? 2 : 1;
      s.data[j] = random() * a * gain;
      s.data[j + 1] = random() * a * gain;
      s.data[j + 2] = random() * a * gain;
      s.data[j + 3] = a;
    }
  if (o.region) s.bbox = o.region;
  return s;
}
/** @param {ArrayLike<number>} actual @param {ArrayLike<number>} expected @param {string} label */
function same(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i],
      e = expected[i];
    if (a === e || (Number.isNaN(a) && Number.isNaN(e))) continue;
    assert.fail(`${label}: index ${i}: got ${a}, expected ${e}`);
  }
}

// ---- reference implementations (the pre-optimisation code) ----
/** @param {number[]} c */
const lum = (c) =>
  0.3 * Number(c[0]) + 0.59 * Number(c[1]) + 0.11 * Number(c[2]);
/** @param {Surface} dst @param {Surface} src @param {string} [mode] @param {number} [opacity] */
function referenceComposite(dst, src, mode = "normal", opacity = 1) {
  const d = dst.data,
    s = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const original = Number(s[i + 3]);
    let sa = original * opacity,
      da = Number(d[i + 3]);
    const sc = [0, 1, 2].map((k) =>
        original ? Number(s[i + k]) / original : 0,
      ),
      dc = [0, 1, 2].map((k) => (da ? Number(d[i + k]) / da : 0));
    if (mode.startsWith("stencil") || mode.startsWith("silhouette")) {
      let mask = sa * (mode.endsWith("luma") ? lum(sc) : 1);
      if (mode.startsWith("silhouette")) mask = 1 - mask;
      for (let k = 0; k < 4; k++) d[i + k] = Number(d[i + k]) * mask;
      continue;
    }
    if (mode === "add" || mode === "plus-lighter") {
      for (let k = 0; k < 3; k++)
        d[i + k] = clamp(Number(d[i + k]) + Number(s[i + k]) * opacity);
      d[i + 3] = clamp(da + sa);
      continue;
    }
    if (mode === "dissolve") sa = noise(1, i / 4, 0) < sa ? 1 : 0;
    if (mode === "behind") {
      for (let k = 0; k < 3; k++)
        d[i + k] = Number(d[i + k]) + Number(sc[k]) * sa * (1 - da);
      d[i + 3] = da + sa * (1 - da);
      continue;
    }
    const rgb = blendColor(dc, sc, mode),
      alpha = mode === "alpha-add" ? Math.min(1, sa + da) : sa + da - sa * da;
    for (let k = 0; k < 3; k++)
      d[i + k] = (mode === "normal" ? (/** @type {number} */ x) => x : clamp)(
        (1 - sa) * Number(d[i + k]) +
          (1 - da) * Number(sc[k]) * sa +
          sa * da * Number(rgb[k]),
      );
    d[i + 3] = alpha;
  }
}
/** @param {Surface} s @param {number} radius */
function referenceGaussian(s, radius) {
  if (radius <= 0) return copy(s);
  const r = Math.ceil(radius),
    sigma = Math.max(radius / 3, 0.25),
    kernel = [];
  let sum = 0;
  for (let n = -r; n <= r; n++) {
    const w = Math.exp((-n * n) / (2 * sigma * sigma));
    kernel.push(w);
    sum += w;
  }
  let src = s;
  for (const horizontal of [true, false]) {
    const out = new Surface(s.width, s.height);
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++)
        for (let k = 0; k < 4; k++) {
          let v = 0;
          for (let n = -r; n <= r; n++) {
            const xx = horizontal ? x + n : x,
              yy = horizontal ? y : y + n;
            if (xx >= 0 && yy >= 0 && xx < s.width && yy < s.height)
              v +=
                (Number(src.data[(yy * s.width + xx) * 4 + k]) *
                  Number(kernel[n + r])) /
                sum;
          }
          out.data[(y * s.width + x) * 4 + k] = v;
        }
    src = out;
  }
  return src;
}
/** @param {Surface} s @param {(rgb:number[],a:number,x:number,y:number)=>number[]} fn */
function referenceColors(s, fn) {
  const out = new Surface(s.width, s.height);
  for (let i = 0; i < s.width * s.height; i++) {
    const a = Number(s.data[i * 4 + 3]);
    const rgb = [0, 1, 2].map((k) => (a ? Number(s.data[i * 4 + k]) / a : 0));
    const v = fn(rgb, a, i % s.width, Math.floor(i / s.width)),
      alpha = clamp(Number(v[3] ?? a));
    out.data.set(
      [Number(v[0]) * alpha, Number(v[1]) * alpha, Number(v[2]) * alpha, alpha],
      i * 4,
    );
  }
  return out;
}
/** @param {Surface} a @param {Surface} b @param {number} t */
function referenceMix(a, b, t) {
  const o = copy(a);
  for (let i = 0; i < o.data.length; i++)
    o.data[i] = Number(a.data[i]) * (1 - t) + Number(b.data[i]) * t;
  return o;
}
/** @param {Surface} s @param {string} from @param {string} to @param {boolean} [decode] @param {boolean} [encode] */
function referenceConvertSpace(s, from, to, decode = false, encode = false) {
  return referenceColors(s, (c) => {
    let v = decode ? c.map((x) => linearize(x, transferOf(from))) : c;
    v = convertRGB(v, from, to);
    return encode ? v.map((x) => encodeTransfer(x, transferOf(to))) : v;
  });
}
/** @param {Surface} s @param {string} space @param {string} transfer @param {boolean} preserveAlpha */
function referenceEncode16(s, space, transfer, preserveAlpha) {
  const converted = referenceConvertSpace(s, "linear-srgb", space);
  const out = Buffer.alloc(s.width * s.height * 8);
  for (let i = 0; i < converted.data.length; i += 4) {
    const alpha = Number(converted.data[i + 3]);
    for (let k = 0; k < 3; k++)
      out.writeUInt16LE(
        Math.round(
          clamp(
            encodeTransfer(
              alpha > 0
                ? Number(converted.data[i + k]) / (preserveAlpha ? alpha : 1)
                : 0,
              transfer === "auto" ? transferOf(space) : transfer,
            ),
          ) * 65535,
        ),
        (i + k) * 2,
      );
    out.writeUInt16LE(
      Math.round(clamp(preserveAlpha ? alpha : 1) * 65535),
      (i + 3) * 2,
    );
  }
  return out;
}
/** @param {Uint8Array|Float32Array} bytes @param {number} w @param {number} h @param {Record<string,any>} a */
function referenceRgbaSurface(bytes, w, h, a = {}) {
  const out = new Surface(w, h),
    div = bytes instanceof Float32Array ? 1 : 255,
    space = a.colorSpace ?? "srgb",
    transfer =
      a.transfer === "auto" || !a.transfer
        ? ["linear-srgb", "acescg", "aces2065-1", "xyz-d65", "raw"].includes(
            space,
          )
          ? "linear"
          : space === "acescct"
            ? "acescct"
            : space === "rec709"
              ? "bt1886"
              : space === "dci-p3"
                ? "gamma26"
                : "srgb"
        : a.transfer;
  for (let i = 0; i < w * h; i++) {
    let alpha = a.alpha === "none" ? 1 : Number(bytes[i * 4 + 3]) / div;
    alpha = Math.max(0, Math.min(1, alpha));
    let rgb = [0, 1, 2].map((k) => {
      let v = Number(bytes[i * 4 + k]) / div;
      if (a.alpha === "premultiplied") v = alpha ? v / alpha : 0;
      return linearize(v, transfer);
    });
    const m = ["srgb", "linear-srgb", "rec709"].includes(space)
      ? undefined
      : tables.matrices[space];
    if (m)
      rgb = [0, 1, 2].map(
        (r) =>
          Number(m[r * 3]) * Number(rgb[0]) +
          Number(m[r * 3 + 1]) * Number(rgb[1]) +
          Number(m[r * 3 + 2]) * Number(rgb[2]),
      );
    out.data.set([...rgb.map((v) => v * alpha), alpha], i * 4);
  }
  return out;
}
/** @param {Surface} source @param {number} width @param {number} height */
function referenceResize(source, width, height) {
  if (source.width === width && source.height === height) return source;
  const out = new Surface(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * source.width) / width - 0.5,
        sy = ((y + 0.5) * source.height) / height - 0.5,
        ix = Math.floor(sx),
        iy = Math.floor(sy),
        fx = sx - ix,
        fy = sy - iy;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const at =
              (Math.max(0, Math.min(source.height - 1, iy + j)) * source.width +
                Math.max(0, Math.min(source.width - 1, ix + i))) *
              4,
            k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
          for (let c = 0; c < 4; c++) {
            const target = (y * width + x) * 4 + c;
            out.data[target] =
              Number(out.data[target]) + Number(source.data[at + c]) * k;
          }
        }
    }
  return out;
}

const W = 23,
  H = 17,
  REGION = { x0: 3, y0: 2, x1: 15, y1: 12 };

test("composite matches the reference for every blend mode, with and without hints", () => {
  const random = rng(7);
  const modes = [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "difference",
    "exclusion",
    "color-dodge",
    "color-burn",
    "soft-light",
    "hard-light",
    "hue",
    "saturation",
    "color",
    "luminosity",
    "add",
    "plus-lighter",
    "behind",
    "dissolve",
    "alpha-add",
    "stencil-alpha",
    "stencil-luma",
    "silhouette-alpha",
    "silhouette-luma",
  ];
  // Outside a hinted region the reference evaluates the non-separable modes on
  // a zero source; with destination luminance above one that divides 0 by 0
  // and poisons the pixel with NaN, which the region-aware path does not
  // reproduce (it leaves the clamped destination). Those modes are checked on
  // display-range destinations.
  const nonSeparable = new Set(["hue", "saturation", "color", "luminosity"]);
  for (const mode of modes)
    for (const opacity of [1, 0.6, 0])
      for (const hinted of [true, false]) {
        const dst = surface(W, H, random, {
            hdr: !nonSeparable.has(mode),
            sparse: 0.1,
          }),
          src = surface(W, H, random, hinted ? { region: REGION } : {}),
          expected = copy(dst),
          actual = copy(dst);
        actual.bbox = dst.bbox;
        referenceComposite(expected, src, mode, opacity);
        composite(actual, src, mode, opacity);
        same(
          actual.data,
          expected.data,
          `${mode} opacity ${opacity} hinted ${hinted}`,
        );
      }
  // An empty hint changes nothing.
  const dst = surface(W, H, random),
    before = copy(dst),
    empty = new Surface(W, H);
  empty.bbox = { x0: 0, y0: 0, x1: 0, y1: 0 };
  composite(dst, empty);
  same(dst.data, before.data, "empty source");
});

test("gaussian matches the reference, including alpha-only blurs within a hint", () => {
  const random = rng(11);
  for (const radius of [0.4, 2, 5.5])
    for (const hinted of [true, false]) {
      const s = surface(
          W,
          H,
          random,
          hinted ? { region: REGION, opaque: 0.6 } : { opaque: 0.6 },
        ),
        expected = referenceGaussian(s, radius),
        actual = gaussian(s, radius);
      same(actual.data, expected.data, `gaussian ${radius} hinted ${hinted}`);
      assert.equal(actual.finite, true);
      const alphaOnly = gaussian(s, radius, true);
      for (let i = 3; i < expected.data.length; i += 4)
        assert.ok(
          alphaOnly.data[i] === expected.data[i] ||
            (Number.isNaN(alphaOnly.data[i]) && Number.isNaN(expected.data[i])),
          `alpha-only ${radius} at ${i}`,
        );
    }
});

test("colors and mix match the reference; sparse evaluation leaves zeros outside the hint", () => {
  const random = rng(13);
  const fns = [
    (/** @type {number[]} */ c) => c.map((v) => v * 0.5),
    (/** @type {number[]} */ c, /** @type {number} */ a) => [
      c[2],
      c[0],
      c[1],
      a * 0.75,
    ],
    (
      /** @type {number[]} */ c,
      /** @type {number} */ _a,
      /** @type {number} */ x,
      /** @type {number} */ y,
    ) => c.map((v) => v + x * 0.01 - y * 0.02),
  ];
  for (const fn of fns)
    for (const hinted of [true, false]) {
      const s = surface(W, H, random, hinted ? { region: REGION } : {});
      same(
        colors(s, fn).data,
        referenceColors(s, fn).data,
        `colors hinted ${hinted}`,
      );
      same(
        colors(s, fn, true).data,
        referenceColors(s, fn).data,
        `sparse colors hinted ${hinted}`,
      );
    }
  for (const t of [0, 0.35, 1])
    for (const hinted of [true, false]) {
      const a = surface(W, H, random, hinted ? { region: REGION } : {}),
        b = surface(
          W,
          H,
          random,
          hinted ? { region: { x0: 10, y0: 5, x1: 20, y1: 16 } } : {},
        );
      same(
        mix(a, b, t).data,
        referenceMix(a, b, t).data,
        `mix ${t} hinted ${hinted}`,
      );
    }
});

test("colour conversion, 16-bit encoding and image import match the reference", () => {
  const random = rng(17);
  for (const [from, to, decode, encode] of [
    ["linear-srgb", "srgb", false, false],
    ["linear-srgb", "rec2020", false, false],
    ["acescct", "linear-srgb", true, false],
    ["linear-srgb", "dci-p3", false, true],
  ])
    for (const hinted of [true, false]) {
      const s = surface(
        W,
        H,
        random,
        hinted ? { region: REGION, hdr: true } : { hdr: true },
      );
      same(
        convertSpace(s, from, to, decode, encode).data,
        referenceConvertSpace(s, from, to, decode, encode).data,
        `convertSpace ${from}->${to} ${decode} ${encode} hinted ${hinted}`,
      );
    }
  for (const [space, transfer] of [
    ["srgb", "auto"],
    ["rec709", "bt1886"],
    ["rec2020", "auto"],
    ["linear-srgb", "linear"],
    ["srgb", "gamma22"],
  ])
    for (const preserveAlpha of [true, false]) {
      const scene = /** @type {any} */ ({
        children: [
          { name: "project", attributes: {} },
          { name: "output", attributes: { colorSpace: space, transfer } },
        ],
      });
      const pipeline = new ColorPipeline(scene, () => new Uint8Array()),
        s = surface(W, H, random, { hdr: true, opaque: 0.5 });
      assert.deepEqual(
        [...pipeline.encode16(s, preserveAlpha)],
        [...referenceEncode16(s, space, transfer, preserveAlpha)],
        `encode16 ${space} ${transfer} alpha ${preserveAlpha}`,
      );
    }
  const bytes = new Uint8Array(W * H * 4);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
  const floats = new Float32Array(W * H * 4);
  for (let i = 0; i < floats.length; i++) floats[i] = random() * 1.2;
  for (const a of [
    {},
    { alpha: "none" },
    { alpha: "premultiplied" },
    { colorSpace: "rec2020" },
    { colorSpace: "acescg" },
    { transfer: "gamma22" },
  ]) {
    same(
      rgbaSurface(bytes, W, H, a).data,
      referenceRgbaSurface(bytes, W, H, a).data,
      `rgba8 ${JSON.stringify(a)}`,
    );
    same(
      rgbaSurface(floats, W, H, a).data,
      referenceRgbaSurface(floats, W, H, a).data,
      `rgba32f ${JSON.stringify(a)}`,
    );
  }
  const source = surface(W, H, random, { sparse: 0 });
  for (const [w, h] of [
    [7, 5],
    [40, 31],
    [W, 9],
  ])
    same(
      resizeSurface(source, w, h).data,
      referenceResize(source, w, h).data,
      `resize ${w}x${h}`,
    );
  assert.equal(resizeSurface(source, W, H), source);
});
