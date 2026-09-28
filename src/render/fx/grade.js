/** Scene-linear color operators. All RGB curves act on unassociated channels. */
import { native } from "./native.js";
import { linearize } from "../../media/color.js";
import { colors, clamp, luminance } from "./pixels.js";
import { Surface, clampRect, fullRect } from "../surface.js";
import { parseColor } from "../color.js";
/** @typedef {Record<string,any>} Params */
/** @param {unknown} s @param {number} fallback */
const triple = (s, fallback) =>
  s === undefined
    ? [fallback, fallback, fallback]
    : String(s).split(/[ ,]+/).map(Number);
/** @param {number} x @param {string} type */
export function tone(x, type) {
  x = Math.max(0, x);
  if (type === "pq-to-sdr") {
    const pq = (/** @type {number} */ v) =>
      ((0.8359375 + 18.8515625 * (v / 100) ** 0.1593017578125) /
        (1 + 18.6875 * (v / 100) ** 0.1593017578125)) **
      78.84375;
    const peak = pq(1),
      knee = 1.5 * peak - 0.5,
      v = pq(Math.min(x, 100));
    if (v <= knee) return x;
    const t = (v - knee) / (1 - knee),
      y =
        (2 * t ** 3 - 3 * t * t + 1) * knee +
        (t ** 3 - 2 * t * t + t) * (1 - knee) +
        (-2 * t ** 3 + 3 * t * t) * peak;
    return linearize(y, "pq");
  }
  if (type === "reinhard") return x / (1 + x);
  if (type === "aces")
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
  if (type === "hable") {
    const f = (/** @type {number} */ v) =>
      (v * (0.15 * v + 0.05) + 0.004) / (v * (0.15 * v + 0.5) + 0.06) -
      0.02 / 0.3;
    return f(x * 2) / f(11.2);
  }
  if (type === "filmic") {
    x = Math.max(0, x - 0.004);
    return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
  }
  throw new Error(`Unsupported tone mapper: ${type}`);
}
/** @param {number[]} c @param {number} degrees @param {number} saturation */
function hue(c, degrees, saturation) {
  // Rotate the chroma plane around the Rec.709 luminance axis (YIQ coordinates).
  const y = luminance(c),
    u = (Number(c[2]) - y) / 1.8556,
    v = (Number(c[0]) - y) / 1.5748;
  const a = (degrees * Math.PI) / 180,
    uu = (u * Math.cos(a) - v * Math.sin(a)) * saturation,
    vv = (u * Math.sin(a) + v * Math.cos(a)) * saturation;
  const r = y + 1.5748 * vv,
    b = y + 1.8556 * uu,
    g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return [r, g, b];
}
export const gradeTypes = new Set(
  "color-grade lift-gamma-gain cdl curves levels white-balance exposure hue-saturation tonemap tint tritone grayscale sepia invert posterize threshold color-overlay fill".split(
    " ",
  ),
);
/** @param {Surface} s @param {Params} p */
export function grade(s, p) {
  if (
    p.type === "tonemap" &&
    ["agx", "filmic", "aces2"].includes(String(p.tonemapper))
  ) {
    const out = native(s, {
      kind: p.tonemapper === "aces2" ? "aces2" : "builtin-display",
      view: p.tonemapper === "agx" ? "AgX" : "Filmic",
    });
    return colors(out, (c) => c.map((v) => linearize(v, "srgb")));
  }
  const type = String(p.type),
    color = p.colorValue ?? parseColor(String(p.color ?? "#FFFFFF")),
    lift = triple(p.lift, 0),
    gamma = triple(p.gamma, 1),
    gain = triple(p.gain, 1),
    slope = triple(p.slope, 1),
    offset = triple(p.offset, 0),
    power = triple(p.power, 1);
  const points = String(p.curve ?? "0,0 1,1")
    .trim()
    .split(/\s+/)
    .map((v) => v.split(",").map(Number))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (
    type === "curves" &&
    (points.length < 2 ||
      points.some(
        (q) => q.length !== 2 || q.some((v) => !Number.isFinite(v)),
      ) ||
      points.some(
        (q, i) => i > 0 && Number(q[0]) === Number(points[i - 1]?.[0]),
      ))
  )
    throw new Error("curves requires distinct finite x,y points");
  if (
    type === "levels" &&
    Number(p.inputWhite ?? 1) <= Number(p.inputBlack ?? 0)
  )
    throw new Error("levels inputWhite must exceed inputBlack");
  for (const v of [lift, gamma, gain, slope, offset, power])
    if (v.length !== 3 || v.some((x) => !Number.isFinite(x)))
      throw new Error("color triples require three finite values");
  if (gamma.some((x) => x <= 0) || power.some((x) => x <= 0))
    throw new Error("gamma and power must be positive");
  // Every grade keeps zero alpha at zero except an alpha curve, so pixels
  // outside the zero-region hint can stay untouched.
  const sparse = !(type === "curves" && (p.channel ?? "rgb") === "alpha");
  const saturation = Number(p.saturation ?? 1),
    amount = Number(p.amount ?? 1),
    contrast = Number(p.contrast ?? 1),
    brightness = Number(p.brightness ?? 0),
    exposureGain = 2 ** Number(p.exposure ?? 0),
    lift0 = Number(lift[0]),
    lift1 = Number(lift[1]),
    lift2 = Number(lift[2]),
    gain0 = Number(gain[0]),
    gain1 = Number(gain[1]),
    gain2 = Number(gain[2]),
    invGamma0 = 1 / Number(gamma[0]),
    invGamma1 = 1 / Number(gamma[1]),
    invGamma2 = 1 / Number(gamma[2]),
    // The common grades write into one reused quadruple; the per-channel
    // arithmetic is unchanged.
    quad = [0, 0, 0, 0];
  if (
    type === "color-grade" ||
    type === "lift-gamma-gain" ||
    type === "exposure"
  ) {
    // Same per-pixel arithmetic as the colors() callback below, without the
    // call; x ** 1 is x, so a unit gamma skips the power.
    const out = new Surface(s.width, s.height),
      W = s.width,
      d = s.data,
      o = out.data,
      region = s.bbox ? clampRect(s.bbox, W, s.height) : fullRect(s);
    let finite = true;
    for (let y = region.y0; y < region.y1; y++)
      for (let x = region.x0; x < region.x1; x++) {
        const j = (y * W + x) * 4,
          a = /** @type {number} */ (d[j + 3]),
          opaque = a === 1,
          r = opaque
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
        if (type === "color-grade") {
          const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
          quad[0] =
            (l + (r - l) * saturation - 0.18) * contrast + 0.18 + brightness;
          quad[1] =
            (l + (g - l) * saturation - 0.18) * contrast + 0.18 + brightness;
          quad[2] =
            (l + (b - l) * saturation - 0.18) * contrast + 0.18 + brightness;
        } else if (type === "lift-gamma-gain") {
          const b0 = Math.max(0, (r + (1 - r) * lift0) * gain0),
            b1 = Math.max(0, (g + (1 - g) * lift1) * gain1),
            b2 = Math.max(0, (b + (1 - b) * lift2) * gain2);
          quad[0] = invGamma0 === 1 ? b0 : b0 ** invGamma0;
          quad[1] = invGamma1 === 1 ? b1 : b1 ** invGamma1;
          quad[2] = invGamma2 === 1 ? b2 : b2 ** invGamma2;
        } else {
          quad[0] = r * exposureGain;
          quad[1] = g * exposureGain;
          quad[2] = b * exposureGain;
        }
        const alpha = clamp(a),
          o0 = opaque ? /** @type {number} */ (quad[0]) : quad[0] * alpha,
          o1 = opaque ? /** @type {number} */ (quad[1]) : quad[1] * alpha,
          o2 = opaque ? /** @type {number} */ (quad[2]) : quad[2] * alpha;
        if (o0 - o0 !== 0 || o1 - o1 !== 0 || o2 - o2 !== 0) finite = false;
        o[j] = o0;
        o[j + 1] = o1;
        o[j + 2] = o2;
        o[j + 3] = alpha;
      }
    out.bbox = s.bbox;
    out.finite = finite;
    return out;
  }
  return colors(
    s,
    (rgb, a) => {
      const y = luminance(rgb);
      let c = rgb;
      if (type === "cdl") {
        c = rgb.map(
          (v, k) =>
            Math.max(0, v * Number(slope[k]) + Number(offset[k])) **
            Number(power[k]),
        );
        const l = luminance(c);
        c = c.map((v) => l + (v - l) * saturation);
      } else if (type === "curves") {
        const curve = (/** @type {number} */ v) => {
          if (v <= Number(points[0]?.[0])) return Number(points[0]?.[1]);
          for (let i = 1; i < points.length; i++) {
            const l = points[i - 1],
              h = points[i];
            if (v <= Number(h?.[0]))
              return (
                Number(l?.[1]) +
                ((Number(h?.[1]) - Number(l?.[1])) * (v - Number(l?.[0]))) /
                  (Number(h?.[0]) - Number(l?.[0]))
              );
          }
          return Number(points.at(-1)?.[1]);
        };
        const channel = p.channel ?? "rgb";
        if (channel === "alpha") a = curve(a);
        else if (channel === "luma") {
          const l = curve(y);
          c = rgb.map((v) => (y ? (v * l) / y : l));
        } else
          c = rgb.map((v, k) =>
            channel === "rgb" || channel === ["red", "green", "blue"][k]
              ? curve(v)
              : v,
          );
      } else if (type === "levels")
        c = rgb.map(
          (v, k) =>
            Number(p.outputBlack ?? 0) +
            clamp(
              (v - Number(p.inputBlack ?? 0)) /
                (Number(p.inputWhite ?? 1) - Number(p.inputBlack ?? 0)),
            ) **
              (1 / Number(gamma[k])) *
              (Number(p.outputWhite ?? 1) - Number(p.outputBlack ?? 0)),
        );
      else if (type === "white-balance") {
        const t = Number(p.temperature ?? 0) / 100,
          g = Number(p.tint ?? 0) / 100;
        c = [
          Number(rgb[0]) * 2 ** t,
          Number(rgb[1]) * 2 ** -g,
          Number(rgb[2]) * 2 ** -t,
        ];
        const l = luminance(c);
        c = c.map((v) => (l ? (v * y) / l : v));
      } else if (type === "hue-saturation")
        c = hue(rgb, Number(p.hue ?? 0), saturation);
      else if (type === "tonemap")
        c = rgb.map((v) => tone(v, String(p.tonemapper ?? "aces")));
      else if (type === "grayscale") c = [y, y, y];
      else if (type === "sepia")
        c = [
          0.393 * Number(rgb[0]) +
            0.769 * Number(rgb[1]) +
            0.189 * Number(rgb[2]),
          0.349 * Number(rgb[0]) +
            0.686 * Number(rgb[1]) +
            0.168 * Number(rgb[2]),
          0.272 * Number(rgb[0]) +
            0.534 * Number(rgb[1]) +
            0.131 * Number(rgb[2]),
        ];
      else if (type === "invert") c = rgb.map((v) => 1 - v);
      else if (type === "posterize") {
        const n = Math.max(2, Number(p.levels ?? 8));
        c = rgb.map((v) => Math.round(clamp(v) * (n - 1)) / (n - 1));
      } else if (type === "threshold")
        c = Array(3).fill(y >= Number(p.threshold ?? 0.7) ? 1 : 0);
      else if (type === "tint")
        c = rgb.map((v, k) => v * (1 - amount) + y * Number(color[k]) * amount);
      else if (type === "tritone")
        c = rgb.map((_, k) =>
          y < 0.5
            ? Number(color[k]) * y * 2
            : Number(color[k]) + (1 - Number(color[k])) * (y - 0.5) * 2,
        );
      else if (type === "color-overlay") {
        const weight = clamp(amount * Number(color[3]));
        c = rgb.map((v, k) => v * (1 - weight) + Number(color[k]) * weight);
      } else if (type === "fill") {
        c = color.slice(0, 3);
        a *= Number(color[3]);
      } else throw new Error(`Unsupported grade: ${type}`);
      return [...c, a];
    },
    sparse,
  );
}
