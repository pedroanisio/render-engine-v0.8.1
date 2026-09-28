/** Ordered effect evaluation. Stateless temporal reads stop before the current effect. */
import { convertSpace } from "../color-management.js";
import { native, resources, bundle } from "./native.js";
import { composite } from "../geometry/blend.js";
import { Surface, clampRect, fullRect } from "../surface.js";
import { parseColor } from "../color.js";
import { frameIndex } from "../../eval/frames.js";
import { filmGrain, halftone, scanlines, blur } from "../effects.js";
import { grade, gradeTypes } from "./grade.js";
import { spatial, spatialTypes } from "./spatial.js";
import { copy, mix, colors, luminance, sample, clamp } from "./pixels.js";
/** @typedef {Record<string,any>} Params */
/** @typedef {{scale:number,time:number,frame:number,fps:number,workingSpace?:string,color?:(c:number[])=>number[],parseColor?:(value:string)=>number[],read?:(src:string)=>Uint8Array,params?:Record<string,any>,lights?:Record<string,any>[],source?:Surface,sample?:(t:number)=>Surface,paint?:(x:number,y:number)=>number[]}} Context */
export const effectTypes = new Set([
  ...gradeTypes,
  ...spatialTypes,
  "glow",
  "film-grain",
  "halftone",
  "scanlines",
  "echo",
  "posterize-time",
  "pixel-motion-blur",
  "gradient-overlay",
  "gradient-map",
  "selective-color",
  "lut",
  "shader",
  "lighting",
]);
/** Block-matched backward flow. Each block minimises luma SSD including coverage.
 * @param {Surface} s @param {Surface} next @param {Params} p @param {number} scale */
function motion(s, next, p, scale) {
  const out = copy(s),
    block = Math.max(2, Math.round(Number(p.size ?? 4) * scale)),
    radius = Math.min(32, Math.ceil(Number(p.radius ?? 4) * scale)),
    n = Math.max(1, Math.min(256, Number(p.samples ?? 16)));
  for (let by = 0; by < s.height; by += block)
    for (let bx = 0; bx < s.width; bx += block) {
      let best = Infinity,
        dx = 0,
        dy = 0;
      for (let y = -radius; y <= radius; y++)
        for (let x = -radius; x <= radius; x++) {
          let error = 0;
          for (let yy = by; yy < Math.min(by + block, s.height); yy++)
            for (let xx = bx; xx < Math.min(bx + block, s.width); xx++)
              for (let k = 0; k < 4; k++)
                error +=
                  (sample(s, xx, yy, k) - sample(next, xx + x, yy + y, k)) ** 2;
          if (
            error < best - 1e-12 ||
            (Math.abs(error - best) < 1e-12 &&
              x * x + y * y < dx * dx + dy * dy)
          ) {
            best = error;
            dx = x;
            dy = y;
          }
        }
      for (let y = by; y < Math.min(by + block, s.height); y++)
        for (let x = bx; x < Math.min(bx + block, s.width); x++)
          for (let k = 0; k < 4; k++) {
            let v = 0;
            for (let j = 0; j < n; j++) {
              const t = ((j + 0.5) / n - 0.5) * Number(p.amount ?? 1);
              v += sample(s, x - dx * t, y - dy * t, k) / n;
            }
            out.data[(y * s.width + x) * 4 + k] = v;
          }
    }
  return out;
}
/** @param {Surface} s @param {Params} p @param {Context} ctx @returns {Surface} */
export function processEffect(s, p, ctx) {
  if (p.enabled === false || Number(p.mix ?? 1) === 0) return copy(s);
  for (const [key, value] of Object.entries(p))
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`effect ${key} must be finite`);
  if (Number(p.samples ?? 16) > 256)
    throw new Error("effect samples exceeds the 256-sample budget");
  const type = String(p.type);
  let out;
  if (ctx.color)
    p = {
      ...p,
      colorValue: ctx.color(
        (ctx.parseColor ?? parseColor)(
          String(
            p.color ??
              ([
                "vignette",
                "drop-shadow",
                "inner-shadow",
                "long-shadow",
              ].includes(type)
                ? "#000000"
                : "#FFFFFF"),
          ),
        ),
      ),
      keyValue: ctx.color(
        (ctx.parseColor ?? parseColor)(
          String(
            p.keyColor ?? (type === "selective-color" ? "#FF0000" : "#00FF00"),
          ),
        ),
      ),
    };
  if (gradeTypes.has(type)) {
    const working = ctx.workingSpace ?? "linear-srgb";
    // The OCIO display tonemappers take and return linear sRGB.
    out =
      type === "tonemap" &&
      ["agx", "filmic", "aces2"].includes(String(p.tonemapper)) &&
      working !== "linear-srgb"
        ? convertSpace(
            grade(convertSpace(s, working, "linear-srgb"), p),
            "linear-srgb",
            working,
          )
        : grade(s, p);
  } else if (spatialTypes.has(type)) out = spatial(s, p, ctx);
  else if (
    type === "glow" ||
    type === "film-grain" ||
    type === "halftone" ||
    type === "scanlines"
  ) {
    out = copy(s);
    const seed = Number(BigInt(p.seed ?? 0) & 0xffffffffn);
    if (type === "glow") {
      const alpha = new Float32Array(s.width * s.height);
      for (let i = 0; i < alpha.length; i++)
        alpha[i] = Number(s.data[i * 4 + 3]);
      const b = blur(
          alpha,
          s.width,
          s.height,
          Number(p.radius ?? 4) * ctx.scale,
        ),
        c = p.colorValue ?? parseColor(String(p.color ?? "#FFFFFF")),
        halo = new Surface(s.width, s.height);
      for (let i = 0; i < b.length; i++) {
        const v = clamp(Number(b[i]) * Number(p.intensity ?? 1) * Number(c[3]));
        halo.data.set(
          [Number(c[0]) * v, Number(c[1]) * v, Number(c[2]) * v, v],
          i * 4,
        );
      }
      if (p.compositeOriginal === "none") out = halo;
      else if (
        p.compositeOriginal === "behind" ||
        p.compositeOriginal === undefined
      )
        composite(out, halo);
      else {
        composite(halo, out);
        out = halo;
      }
    }
    if (type === "film-grain")
      filmGrain(
        out,
        out.bounds(),
        {
          amount: Number(p.amount ?? 1) * Number(p.intensity ?? 1),
          size: Number(p.size ?? 1) * ctx.scale,
          mix: 1,
          seed,
        },
        ctx.frame,
      );
    if (type === "halftone")
      halftone(out, out.bounds(), {
        size: Number(p.size ?? 1) * ctx.scale,
        angle: Number(p.angle ?? 0),
        mix: 1,
      });
    if (type === "scanlines")
      scanlines(out, out.bounds(), {
        size: Number(p.size ?? 1) * ctx.scale,
        intensity: Number(p.intensity ?? 1),
        mix: 1,
      });
  } else if (type === "lut" || type === "shader") {
    if (!ctx.read || !p.src) throw new Error(`${type} requires a readable src`);
    const files = resources(String(p.src), ctx.read);
    const input =
      type === "lut"
        ? convertSpace(
            s,
            ctx.workingSpace ?? "linear-srgb",
            String(p.space ?? ctx.workingSpace ?? "linear-srgb"),
            false,
            true,
          )
        : s;
    out = native(input, {
      kind: type,
      src: String(p.src),
      files: bundle(files),
      shader:
        type === "shader"
          ? Buffer.from(ctx.read(String(p.src))).toString("utf8")
          : undefined,
      time: ctx.time,
      params: ctx.params,
    });
    if (type === "lut")
      out = convertSpace(
        out,
        String(p.space ?? ctx.workingSpace ?? "linear-srgb"),
        ctx.workingSpace ?? "linear-srgb",
        true,
        false,
      );
  } else if (type === "lighting") {
    if (!ctx.lights?.length)
      throw new Error("lighting requires referenced 2D lights");
    // Per-light constants are hoisted; the per-pixel work is the same arithmetic.
    const relief = Number(p.relief ?? 0),
      intensityAll = Number(p.intensity ?? 1),
      falloff = p.falloff,
      scale = ctx.scale,
      lights = (ctx.lights ?? []).map((l) => {
        const raw = (ctx.parseColor ?? parseColor)(
            String(l.color ?? "#FFFFFF"),
          ),
          lc = ctx.color ? ctx.color(raw) : raw,
          gain = Number(l.intensity ?? 1),
          exposure = 2 ** Number(l.exposure ?? 0);
        return {
          ambient: l.type === "ambient",
          lx: Number(l.x ?? 0) * scale,
          ly: Number(l.y ?? 0) * scale,
          dz: Number(l.z ?? 100) * scale,
          range: Math.max(1, Number(l.range ?? 1000) * scale),
          g0: Number(lc[0]) * gain * exposure,
          g1: Number(lc[1]) * gain * exposure,
          g2: Number(lc[2]) * gain * exposure,
        };
      }),
      lit = [0, 0, 0];
    // Same per-pixel arithmetic as a colors() callback, without the call.
    out = new Surface(s.width, s.height);
    const W = s.width,
      d = s.data,
      o = out.data,
      region = s.bbox ? clampRect(s.bbox, W, s.height) : fullRect(s);
    let finite = true;
    for (let y = region.y0; y < region.y1; y++)
      for (let x = region.x0; x < region.x1; x++) {
        const j = (y * W + x) * 4,
          a = /** @type {number} */ (d[j + 3]),
          cr = a ? /** @type {number} */ (d[j]) / a : 0,
          cg = a ? /** @type {number} */ (d[j + 1]) / a : 0,
          cb = a ? /** @type {number} */ (d[j + 2]) / a : 0,
          nx = (sample(s, x - 1, y, 3) - sample(s, x + 1, y, 3)) * relief,
          ny = (sample(s, x, y - 1, 3) - sample(s, x, y + 1, 3)) * relief,
          norm = Math.hypot(nx, ny, 1);
        let l0 = 0,
          l1 = 0,
          l2 = 0;
        for (const l of lights) {
          const dx = l.lx - x,
            dy = l.ly - y,
            dz = l.dz,
            dist = Math.hypot(dx, dy, dz),
            q = clamp(1 - dist / l.range),
            atten =
              falloff === "none"
                ? 1
                : falloff === "linear"
                  ? q
                  : falloff === "quadratic"
                    ? q * q
                    : q * q * (3 - 2 * q),
            diffuse = l.ambient
              ? 1
              : Math.max(
                  0,
                  (nx * dx + ny * dy + dz) / (norm * Math.max(dist, 1e-8)),
                ) * atten;
          l0 = l0 + l.g0 * diffuse;
          l1 = l1 + l.g1 * diffuse;
          l2 = l2 + l.g2 * diffuse;
        }
        const alpha = clamp(a),
          o0 = cr * l0 * intensityAll * alpha,
          o1 = cg * l1 * intensityAll * alpha,
          o2 = cb * l2 * intensityAll * alpha;
        if (o0 - o0 !== 0 || o1 - o1 !== 0 || o2 - o2 !== 0) finite = false;
        o[j] = o0;
        o[j + 1] = o1;
        o[j + 2] = o2;
        o[j + 3] = alpha;
      }
    out.bbox = s.bbox;
    out.finite = finite;
  } else if (type === "gradient-overlay" || type === "gradient-map") {
    if (!ctx.paint && !ctx.source)
      throw new Error(`${type} requires paint or source`);
    out = colors(s, (c, a, x, y) => {
      const l = luminance(c),
        q = ctx.paint
          ? ctx.paint(
              type === "gradient-map" ? l * s.width : x,
              type === "gradient-map" ? 0 : y,
            )
          : [0, 1, 2, 3].map((k) =>
              sample(
                /** @type {Surface} */ (ctx.source),
                type === "gradient-map" ? clamp(l) * (s.width - 1) : x,
                type === "gradient-map" ? 0 : y,
                k,
              ),
            );
      // Raster sources are premultiplied; colors() expects unassociated RGB.
      const qa = Number(q[3]),
        u = ctx.paint ? 1 : qa ? 1 / qa : 0;
      return [Number(q[0]) * u, Number(q[1]) * u, Number(q[2]) * u, a * qa];
    });
  } else if (type === "selective-color") {
    const key = p.keyValue ?? parseColor(String(p.keyColor ?? "#FF0000")),
      color = p.colorValue ?? parseColor(String(p.color ?? "#FFFFFF"));
    out = colors(s, (c) => {
      const d = Math.hypot(...c.map((v, k) => v - Number(key[k]))),
        weight =
          1 -
          clamp(
            (d - Number(p.tolerance ?? 0.2)) /
              Math.max(1e-8, Number(p.softness ?? 0.1)),
          );
      return c.map(
        (v, k) => v + Number(color[k]) * weight * Number(p.amount ?? 1),
      );
    });
  } else if (["echo", "posterize-time", "pixel-motion-blur"].includes(type)) {
    if (!ctx.sample) throw new Error(`${type} requires a temporal sampler`);
    const frequency = Number(p.frequency ?? 1);
    if (frequency <= 0) throw new Error(`${type} frequency must be positive`);
    if (type === "posterize-time")
      out = ctx.sample(frameIndex(ctx.time, frequency) / frequency);
    else if (type === "pixel-motion-blur")
      out = motion(s, ctx.sample(ctx.time + 1 / ctx.fps), p, ctx.scale);
    else {
      out = new Surface(s.width, s.height);
      let total = 0;
      const count = Math.min(256, Number(p.samples ?? 16)),
        decay = clamp(Number(p.amount ?? 1));
      for (let j = 0; j < count; j++) {
        const weight = decay ** j,
          frame = j === 0 ? s : ctx.sample(ctx.time - j / frequency);
        total += weight;
        for (let k = 0; k < out.data.length; k++)
          out.data[k] = Number(out.data[k]) + Number(frame.data[k]) * weight;
      }
      for (let k = 0; k < out.data.length; k++)
        out.data[k] = Number(out.data[k]) / total;
    }
  } else throw new Error(`Unsupported effect: ${type}`);
  // Producers that checked every value they wrote set `finite`; otherwise scan.
  // Outside a zero-region hint every value is zero, hence finite.
  if (out.finite !== true) {
    // v - v is NaN exactly for NaN and the infinities.
    const od = out.data,
      W = out.width,
      finite = out.bbox ? clampRect(out.bbox, W, out.height) : fullRect(out);
    for (let y = finite.y0; y < finite.y1; y++) {
      const end = (y * W + finite.x1) * 4;
      for (let i = (y * W + finite.x0) * 4; i < end; i++) {
        const v = /** @type {number} */ (od[i]);
        if (v - v !== 0)
          throw new Error(`effect ${type} produced non-finite pixels`);
      }
    }
  }
  // At mix 1 the blend a*0 + b*1 is b itself; the buffer is handed over as is.
  const amount = clamp(Number(p.mix ?? 1));
  return amount === 1 ? out : mix(s, out, amount);
}
