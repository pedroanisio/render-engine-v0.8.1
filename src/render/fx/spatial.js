/** Spatial filters use transparent borders, linear light, and pixel units. */
import { Surface, clampRect, expandRect, fullRect } from "../surface.js";
import { parseColor } from "../color.js";
import { composite } from "../geometry/blend.js";
import { hash01 } from "../effects.js";
import {
  copy,
  sample,
  warp,
  gaussian,
  integrate,
  colors,
  luminance,
  clamp,
  morphology,
  mix,
} from "./pixels.js";
/** @typedef {Record<string,any>} Params */
export const spatialTypes = new Set(
  "blur directional-blur radial-blur zoom-blur lens-blur tilt-shift bloom drop-shadow inner-shadow inner-glow long-shadow stroke outline matte-choke sharpen unsharp-mask emboss bevel vignette noise pixelate mosaic rgb-split chromatic-aberration mirror tile kaleidoscope twirl bulge spherize lens-distortion wave-warp ripple turbulent-displace heat-haze displacement-map chroma-key luma-key difference-key spill-suppress letterbox fractal-noise halation light-leak light-sweep glitch vhs god-rays lens-flare".split(
    " ",
  ),
);
/** Continuous seeded lattice noise, independent of call order.
 * @param {number} x @param {number} y @param {number} seed */
export function noise(x, y, seed) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (
    (hash01(ix, iy, seed, 0) * (1 - u) + hash01(ix + 1, iy, seed, 0) * u) *
      (1 - v) +
    (hash01(ix, iy + 1, seed, 0) * (1 - u) +
      hash01(ix + 1, iy + 1, seed, 0) * u) *
      v
  );
}
/** Solid colour with a computed alpha. `region` (pixel rectangle) bounds where
 * `alpha` can be non-zero; outside it the result is left at zero.
 * @param {Surface} s @param {number[]} c @param {(x:number,y:number)=>number} alpha @param {import('../surface.js').Rect} [region] */
function colored(s, c, alpha, region) {
  const o = new Surface(s.width, s.height),
    W = s.width,
    d = o.data,
    c0 = Number(c[0]),
    c1 = Number(c[1]),
    c2 = Number(c[2]),
    c3 = Number(c[3]),
    rg = region ?? fullRect(s);
  for (let y = rg.y0; y < rg.y1; y++)
    for (let x = rg.x0; x < rg.x1; x++) {
      const a = clamp(alpha(x, y)) * c3,
        j = (y * W + x) * 4;
      d[j] = c0 * a;
      d[j + 1] = c1 * a;
      d[j + 2] = c2 * a;
      d[j + 3] = a;
    }
  o.bbox = region;
  return o;
}
/** @param {Surface} s @param {Params} p @param {{scale:number,time:number,frame:number,source?:Surface}} env */
export function spatial(s, p, env) {
  const w = s.width,
    h = s.height,
    type = String(p.type),
    scale = env.scale,
    r = Math.max(0, Number(p.radius ?? 4) * scale),
    amount = Number(p.amount ?? 1),
    intensity = Number(p.intensity ?? 1),
    angle = (Number(p.angle ?? 0) * Math.PI) / 180,
    samples = Number(p.samples ?? 16),
    cx = Number(p.centerX ?? w / scale / 2) * scale - 0.5,
    cy = Number(p.centerY ?? h / scale / 2) * scale - 0.5,
    ox = Number(p.offsetX ?? 8) * scale,
    oy = Number(p.offsetY ?? 8) * scale,
    seed = Number(BigInt(p.seed ?? 0) & 0xffffffffn),
    size = Math.max(0.001, Number(p.size ?? 1) * scale),
    freq = Number(p.frequency ?? 1),
    time = env.time * Number(p.speed ?? 1),
    color = p.colorValue ?? parseColor(String(p.color ?? "#FFFFFF")),
    source = env.source;
  if (type === "blur") return gaussian(s, r);
  if (type === "directional-blur")
    return integrate(s, samples, (x, y, t) => [
      x + (t - 0.5) * r * 2 * Math.cos(angle),
      y + (t - 0.5) * r * 2 * Math.sin(angle),
    ]);
  if (type === "radial-blur")
    return integrate(s, samples, (x, y, t) => {
      const a = (t - 0.5) * angle,
        c = Math.cos(a),
        sn = Math.sin(a);
      return [
        cx + (x - cx) * c - (y - cy) * sn,
        cy + (x - cx) * sn + (y - cy) * c,
      ];
    });
  if (type === "zoom-blur")
    return integrate(s, samples, (x, y, t) => [
      cx + (x - cx) * (1 + (t - 0.5) * amount),
      cy + (y - cy) * (1 + (t - 0.5) * amount),
    ]);
  if (type === "lens-blur")
    return integrate(s, samples, (x, y, t) => {
      const a = t * samples * 2.399963229728653;
      return [
        x + Math.cos(a) * Math.sqrt(t) * r,
        y + Math.sin(a) * Math.sqrt(t) * r,
      ];
    });
  if (type === "tilt-shift") {
    const blurred = gaussian(s, r),
      o = copy(s);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = clamp(
          (Math.abs((x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)) -
            size) /
            Math.max(1, r),
        );
        for (let k = 0; k < 4; k++) {
          const j = (y * w + x) * 4 + k;
          o.data[j] = Number(s.data[j]) * (1 - t) + Number(blurred.data[j]) * t;
        }
      }
    return o;
  }
  if (type === "bloom" || type === "halation") {
    const bright = colors(s, (c, a) => {
        const l = luminance(c),
          v = Math.max(0, l - Number(p.threshold ?? 0.7)) / Math.max(l, 1e-8);
        return [...c, a * v];
      }),
      blurred = gaussian(bright, r),
      o = copy(s);
    for (let i = 0; i < o.data.length; i += 4) {
      for (let k = 0; k < 3; k++)
        o.data[i + k] =
          Number(o.data[i + k]) +
          Number(blurred.data[i + k]) *
            intensity *
            (type === "halation" ? Number([1, 0.15, 0.02][k]) : 1);
      o.data[i + 3] = clamp(
        Number(o.data[i + 3]) +
          Number(blurred.data[i + 3]) * intensity * (1 - Number(o.data[i + 3])),
      );
    }
    return o;
  }
  if (
    [
      "drop-shadow",
      "inner-shadow",
      "inner-glow",
      "long-shadow",
      "stroke",
      "outline",
      "matte-choke",
    ].includes(type)
  ) {
    if (type === "matte-choke") return morphology(s, -amount * scale);
    let mask = s;
    if (type === "stroke" || type === "outline") {
      const position = p.position ?? "outside",
        outer = morphology(
          s,
          position === "inside" ? 0 : position === "center" ? r / 2 : r,
        ),
        inner = morphology(
          s,
          position === "outside" ? 0 : position === "center" ? -r / 2 : -r,
        );
      const o = colored(
        s,
        color,
        (x, y) => sample(outer, x, y, 3) - sample(inner, x, y, 3),
      );
      if (type === "stroke") {
        if (position === "outside") composite(o, s);
        else {
          const dst = copy(s);
          composite(dst, o);
          return dst;
        }
      }
      return o;
    }
    if (type === "long-shadow") {
      mask = copy(s);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let alpha = 0;
          for (let j = 0; j <= samples; j++)
            alpha = Math.max(
              alpha,
              sample(s, x - (ox * j) / samples, y - (oy * j) / samples, 3),
            );
          mask.data[(y * w + x) * 4 + 3] = alpha;
        }
    } else mask = gaussian(s, r, true); // only the mask's alpha is sampled
    const inner = type === "inner-shadow" || type === "inner-glow";
    // Bilinear taps reach one pixel: the shadow lives within the (offset) mask
    // bounds plus a margin, an inner effect within the source bounds.
    const region =
      type === "long-shadow"
        ? undefined
        : inner
          ? s.bbox
            ? clampRect(expandRect(s.bbox, 2), w, h)
            : undefined
          : mask.bbox
            ? clampRect(
                {
                  x0: mask.bbox.x0 + ox - 2,
                  y0: mask.bbox.y0 + oy - 2,
                  x1: mask.bbox.x1 + ox + 2,
                  y1: mask.bbox.y1 + oy + 2,
                },
                w,
                h,
              )
            : undefined;
    let o;
    if (
      !inner &&
      type !== "long-shadow" &&
      Number.isInteger(ox) &&
      Number.isInteger(oy) &&
      region
    ) {
      // Integer offsets sample the blurred alpha on pixel centres, where the
      // bilinear tap reduces to one value: intensity * mask alpha.
      o = new Surface(w, h);
      const od = o.data,
        md = mask.data,
        c0 = Number(color[0]),
        c1 = Number(color[1]),
        c2 = Number(color[2]),
        c3 = Number(color[3]);
      for (let y = region.y0; y < region.y1; y++) {
        const my = y - oy;
        for (let x = region.x0; x < region.x1; x++) {
          const mx = x - ox,
            b =
              mx >= 0 && my >= 0 && mx < w && my < h
                ? /** @type {number} */ (md[(my * w + mx) * 4 + 3])
                : 0,
            a = clamp(intensity * b) * c3,
            j = (y * w + x) * 4;
          od[j] = c0 * a;
          od[j + 1] = c1 * a;
          od[j + 2] = c2 * a;
          od[j + 3] = a;
        }
      }
      o.bbox = region;
    } else
      o = colored(
        s,
        color,
        (x, y) => {
          const a = sample(s, x, y, 3),
            b = sample(
              mask,
              x - (type === "inner-glow" || type === "long-shadow" ? 0 : ox),
              y - (type === "inner-glow" || type === "long-shadow" ? 0 : oy),
              3,
            );
          return intensity * (inner ? a * (1 - b) : b);
        },
        region,
      );
    const mode = p.compositeOriginal ?? "behind";
    if (mode === "none") return o;
    if (mode === "behind") {
      const dst = copy(s, true);
      composite(dst, o);
      return dst;
    }
    composite(o, s);
    return o;
  }
  if (type === "sharpen" || type === "unsharp-mask") {
    const b = type === "unsharp-mask" ? gaussian(s, r) : null;
    return colors(s, (c, a, x, y) =>
      c.map((v, k) => {
        const low = b
          ? sample(b, x, y, k) / Math.max(sample(b, x, y, 3), 1e-8)
          : [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ].reduce(
              (v, d) =>
                v +
                sample(s, x + Number(d[0]), y + Number(d[1]), k) /
                  Math.max(
                    sample(s, x + Number(d[0]), y + Number(d[1]), 3),
                    1e-8,
                  ),
              0,
            ) / 4;
        return (
          v +
          (type === "sharpen" || Math.abs(v - low) >= Number(p.threshold ?? 0)
            ? (v - low) * amount
            : 0)
        );
      }),
    );
  }
  if (type === "emboss" || type === "bevel")
    return colors(s, (c, a, x, y) => {
      const channel = type === "bevel" ? 3 : -1;
      const v = (/** @type {number} */ xx, /** @type {number} */ yy) =>
        channel === 3
          ? sample(s, xx, yy, 3)
          : luminance([0, 1, 2].map((k) => sample(s, xx, yy, k)));
      const dx = v(x + 1, y) - v(x - 1, y),
        dy = v(x, y + 1) - v(x, y - 1),
        shade = (dx * Math.cos(angle) + dy * Math.sin(angle)) * amount;
      return type === "bevel"
        ? c.map((v) => v * (1 + shade))
        : Array(3).fill(0.5 + shade);
    });
  if (type === "vignette")
    return colors(s, (c, a, x, y) => {
      const d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2)),
        v =
          clamp(
            (d - Number(p.threshold ?? 0.7)) /
              Math.max(0.001, Number(p.softness ?? 0.1)),
          ) * intensity;
      return c.map((q, k) => q * (1 - v) + Number(color[k]) * v);
    });
  if (type === "noise")
    return colors(s, (c, a, x, y) =>
      c.map(
        (v, k) => v + (hash01(x, y, env.frame, seed + k) - 0.5) * amount * 2,
      ),
    );
  if (type === "fractal-noise")
    return colors(s, (_, a, x, y) => {
      let v = 0,
        n = 0;
      for (let j = 0; j < 6; j++) {
        const weight = 2 ** -j;
        v +=
          noise(
            (x / size) * freq * 2 ** j,
            (y / size) * freq * 2 ** j + time,
            seed + j,
          ) * weight;
        n += weight;
      }
      return [(v / n) * amount, (v / n) * amount, (v / n) * amount, a];
    });
  if (type === "pixelate")
    return warp(
      s,
      (x, y) => [
        Math.floor(x / size) * size + (size - 1) / 2,
        Math.floor(y / size) * size + (size - 1) / 2,
      ],
      true,
    );
  if (type === "mosaic") {
    const out = copy(s),
      cell = Math.max(1, Math.round(size));
    for (let y = 0; y < h; y += cell)
      for (let x = 0; x < w; x += cell) {
        const c = [0, 0, 0, 0];
        let count = 0;
        for (let yy = y; yy < Math.min(y + cell, h); yy++)
          for (let xx = x; xx < Math.min(x + cell, w); xx++) {
            count++;
            for (let k = 0; k < 4; k++)
              c[k] = Number(c[k]) + Number(s.data[(yy * w + xx) * 4 + k]);
          }
        for (let yy = y; yy < Math.min(y + cell, h); yy++)
          for (let xx = x; xx < Math.min(x + cell, w); xx++)
            out.data.set(
              c.map((v) => v / count),
              (yy * w + xx) * 4,
            );
      }
    return out;
  }
  if (type === "rgb-split" || type === "chromatic-aberration") {
    const out = copy(s);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4,
          a = Number(s.data[j + 3]);
        for (let k = 0; k < 3; k++) {
          const d = k - 1,
            xx =
              type === "rgb-split"
                ? x + ox * d
                : cx + (x - cx) * (1 + amount * d * 0.01),
            yy =
              type === "rgb-split"
                ? y + oy * d
                : cy + (y - cy) * (1 + amount * d * 0.01),
            al = sample(s, xx, yy, 3);
          out.data[j + k] = al ? (sample(s, xx, yy, k) / al) * a : 0;
        }
      }
    return out;
  }
  if (type === "mirror")
    return warp(s, (x, y) => {
      const dx = x - cx,
        dy = y - cy,
        u = dx * Math.cos(angle) + dy * Math.sin(angle),
        v = -dx * Math.sin(angle) + dy * Math.cos(angle);
      return [
        cx + Math.abs(u) * Math.cos(angle) - v * Math.sin(angle),
        cy + Math.abs(u) * Math.sin(angle) + v * Math.cos(angle),
      ];
    });
  if (type === "tile")
    return warp(
      s,
      (x, y) => [
        ((((x - ox) * amount) % w) + w) % w,
        ((((y - oy) * amount) % h) + h) % h,
      ],
      true,
    );
  if (type === "kaleidoscope")
    return warp(s, (x, y) => {
      const dx = x - cx,
        dy = y - cy,
        d = Math.hypot(dx, dy),
        period = (Math.PI * 2) / Math.max(1, Math.round(Number(p.levels ?? 8))),
        a = (((Math.atan2(dy, dx) + angle) % period) + period) % period,
        fold = Math.min(a, period - a);
      return [cx + Math.cos(fold) * d, cy + Math.sin(fold) * d];
    });
  if (
    ["twirl", "bulge", "spherize", "lens-distortion", "ripple"].includes(type)
  )
    return warp(s, (x, y) => {
      const dx = x - cx,
        dy = y - cy,
        d = Math.hypot(dx, dy),
        norm = d / Math.max(r, 1),
        theta = Math.atan2(dy, dx);
      if (type === "twirl") {
        const a = theta + angle * Math.max(0, 1 - norm) ** 2;
        return [cx + d * Math.cos(a), cy + d * Math.sin(a)];
      }
      let q = d;
      if (type === "bulge" && norm < 1)
        q = d * (1 - amount * (1 - norm * norm));
      if (type === "spherize" && norm < 1)
        q = (1 - amount) * d + ((amount * Math.asin(norm) * 2) / Math.PI) * r;
      if (type === "lens-distortion")
        q = d * (1 + amount * (d / Math.max(w, h)) ** 2);
      if (type === "ripple")
        q =
          d +
          Math.sin((d / size) * freq * 2 * Math.PI - time * 2 * Math.PI) *
            amount *
            scale;
      return [cx + q * Math.cos(theta), cy + q * Math.sin(theta)];
    });
  if (type === "wave-warp")
    return warp(s, (x, y) => {
      const phase =
          ((x * Math.cos(angle) + y * Math.sin(angle)) / size) *
            freq *
            2 *
            Math.PI -
          time * 2 * Math.PI,
        d = Math.sin(phase) * amount * scale;
      return [x - d * Math.sin(angle), y + d * Math.cos(angle)];
    });
  if (type === "turbulent-displace" || type === "heat-haze")
    return warp(s, (x, y) => [
      x +
        (noise((x / size) * freq, (y / size) * freq + time, seed) - 0.5) *
          2 *
          amount *
          scale,
      y +
        (type === "heat-haze"
          ? 0
          : (noise((x / size) * freq, (y / size) * freq + time, seed + 1) -
              0.5) *
            2 *
            amount *
            scale),
    ]);
  if (type === "displacement-map") {
    if (!source) throw new Error("displacement-map requires source");
    return warp(s, (x, y) => [
      x + (sample(source, x, y, 0) - 0.5) * ox * amount,
      y + (sample(source, x, y, 1) - 0.5) * oy * amount,
    ]);
  }
  if (
    ["chroma-key", "luma-key", "difference-key", "spill-suppress"].includes(
      type,
    )
  ) {
    const key = p.keyValue ?? parseColor(String(p.keyColor ?? "#00FF00")),
      tolerance = Number(p.tolerance ?? 0.2),
      softness = Math.max(1e-8, Number(p.softness ?? 0.1));
    if (type === "difference-key" && !source)
      throw new Error("difference-key requires source");
    return colors(s, (c, a, x, y) => {
      const dominant =
        key[0] >= key[1] && key[0] >= key[2] ? 0 : key[1] >= key[2] ? 1 : 2;
      if (type === "spill-suppress")
        return c.map((v, k) =>
          k === dominant
            ? v -
              Math.max(
                0,
                v - Math.max(Number(c[(k + 1) % 3]), Number(c[(k + 2) % 3])),
              ) *
                Number(p.spill ?? 0.5)
            : v,
        );
      let distance = luminance(c);
      if (type === "chroma-key")
        distance =
          Math.hypot(...c.map((v, k) => v - Number(key[k]))) / Math.sqrt(3);
      if (type === "difference-key")
        distance =
          Math.hypot(
            ...c.map(
              (v, k) =>
                v -
                sample(/** @type {Surface} */ (source), x, y, k) /
                  Math.max(
                    sample(/** @type {Surface} */ (source), x, y, 3),
                    1e-8,
                  ),
            ),
          ) / Math.sqrt(3);
      const keep = clamp(
        (distance -
          (type === "luma-key" ? Number(p.threshold ?? 0.7) : tolerance)) /
          softness,
      );
      return [...c, a * keep];
    });
  }
  if (type === "letterbox")
    return colors(s, (c, a, x, y) =>
      y < h * clamp(amount, 0, 0.49) || y >= h * (1 - clamp(amount, 0, 0.49))
        ? [...color]
        : [...c, a],
    );
  if (type === "light-leak" || type === "light-sweep" || type === "lens-flare")
    return colors(s, (c, a, x, y) => {
      let v;
      if (type === "light-sweep")
        v = Math.exp(
          -(
            ((x - cx) * Math.cos(angle) +
              (y - cy) * Math.sin(angle) -
              time * size) **
            2
          ) / Math.max(1, r * r),
        );
      else if (type === "light-leak")
        v =
          Math.exp(-Math.hypot(x - cx, y - cy) / Math.max(1, r)) *
          (0.5 + 0.5 * noise(x / size, y / size + time, seed));
      else {
        const d = Math.hypot(x - cx, y - cy);
        v =
          Math.exp((-d * d) / Math.max(1, r * r)) +
          Math.exp(-Math.abs(d - r * 3) / Math.max(1, r * 0.12)) * 0.2 +
          Math.exp(-Math.abs(y - cy) / Math.max(1, size)) *
            Math.exp(-Math.abs(x - cx) / Math.max(1, r * 8)) *
            0.3;
      }
      return [
        ...c.map((q, k) => q + Number(color[k]) * v * intensity),
        clamp(a + v * intensity * (1 - a)),
      ];
    });
  if (type === "god-rays") {
    const rays = integrate(s, samples, (x, y, t) => [
      x + (cx - x) * t * amount,
      y + (cy - y) * t * amount,
    ]);
    const out = copy(s);
    for (let i = 0; i < out.data.length; i++)
      out.data[i] =
        i % 4 === 3
          ? clamp(
              Number(s.data[i]) +
                Number(rays.data[i]) * intensity * (1 - Number(s.data[i])),
            )
          : Number(s.data[i]) + Number(rays.data[i]) * intensity;
    return out;
  }
  if (type === "glitch" || type === "vhs") {
    const o = warp(s, (x, y) => {
      const band = Math.floor(y / Math.max(1, size)),
        shift =
          type === "glitch"
            ? hash01(band, env.frame, seed, 0) > 0.8
              ? (hash01(band, env.frame, seed, 1) - 0.5) * amount * ox
              : 0
            : Math.sin(y * 0.1 + time * 12) * amount +
              noise(y * 0.04, time, seed) * amount * 4;
      return [x + shift, y];
    });
    return type === "vhs"
      ? colors(o, (c, a, x, y) => {
          const l = luminance(c),
            n = (hash01(x, y, env.frame, seed) - 0.5) * amount * 0.03;
          return c.map((v) => (l + (v - l) * 0.6) * (y % 2 ? 0.9 : 1) + n);
        })
      : o;
  }
  throw new Error(`Unsupported spatial effect: ${type}`);
}
