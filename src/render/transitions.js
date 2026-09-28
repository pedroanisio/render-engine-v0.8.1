/** Sibling transitions extend handles without moving the cut or nominal timeline. */
import { geometryTransition } from "./three/transitions.js";
import { Surface } from "./surface.js";
import { parseColor } from "./color.js";
import { easing } from "../eval/curves.js";
import {
  clamp,
  copy,
  mix,
  warp,
  sample,
  gaussian,
  luminance,
} from "./fx/pixels.js";
import { native } from "./fx/native.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {ReturnType<import('../eval/runtime.js').compileRuntime>} Runtime */
export const transitionTypes = new Set(
  "cut crossfade additive-dissolve dip-to-color wipe slide push cover reveal zoom-in zoom-out spin whip-pan circle-open circle-close iris clock-wipe radial-wipe barn-door blinds luma blur glitch pixelize film-roll stripe squash shuffle carousel light-leak morph shader flip cube page-curl".split(
    " ",
  ),
);
/** @param {Node} parent @param {number} t @param {Runtime} [runtime] */
export function transitionWindows(parent, t, runtime) {
  const nodes = new Map(
    parent.children.map((n) => [String(n.attributes.id), n]),
  );
  const clock = runtime?.timeline.spans.get(parent),
    time = clock?.composition(t) ?? t;
  return parent.children
    .filter((n) => n.name === "transition")
    .map((n) => {
      const a = runtime?.attributes(n, t) ?? n.attributes,
        from = nodes.get(String(a.from)),
        to = nodes.get(String(a.to));
      if (!from && !to)
        throw new Error("transition requires a sibling from or to");
      if ((a.from && !from) || (a.to && !to) || from === to)
        throw new Error("transition endpoints must be distinct siblings");
      const cut = to
        ? (runtime?.timeline.spans.get(to)?.start ??
          Number(to.attributes.start ?? 0))
        : (runtime?.timeline.spans.get(/** @type {Node} */ (from))?.end ??
          Number(from?.attributes.end));
      const duration = Number(a.duration ?? 0.5),
        start =
          cut -
          (a.alignment === "start"
            ? 0
            : a.alignment === "end"
              ? duration
              : duration / 2),
        end = start + duration;
      const raw = clamp((time - start) / duration),
        progress = clamp(easing(String(a.curve ?? "ease-in-out"))(raw));
      return {
        node: n,
        a,
        from,
        to,
        cut,
        start,
        end,
        time,
        raw,
        progress,
        active: time >= start && time < end,
      };
    });
}
/** Include descendants whose interval shares the extended root edge.
 * @param {Node} root @param {Runtime} [runtime] */
export function handles(root, runtime) {
  const result = new Set([root]),
    span = runtime?.timeline.spans.get(root);
  const walk = (/** @type {Node} */ n) => {
    for (const child of n.children) {
      const c = runtime?.timeline.spans.get(child);
      if (!c || !span || (c.start === span.start && c.end === span.end))
        result.add(child);
      walk(child);
    }
  };
  walk(root);
  return result;
}
/** Audio amplitude for exactly the same eased progress as the visual transition.
 * @param {number} progress @param {string} mode @param {boolean} incoming */
export function transitionGain(progress, mode, incoming) {
  if (mode === "none") return 1;
  if (mode === "cut")
    return incoming ? Number(progress >= 0.5) : Number(progress < 0.5);
  if (mode === "equal-power")
    return incoming
      ? Math.sin((progress * Math.PI) / 2)
      : Math.cos((progress * Math.PI) / 2);
  return incoming ? progress : 1 - progress;
}
/** @param {Surface} from @param {Surface} to @param {Record<string,any>} a @param {number} p @param {{matte?:Surface,color?:(c:number[])=>number[],read?:(src:string)=>Uint8Array,params?:Record<string,any>,time?:number}} [ctx] */
export function transitionFrame(from, to, a, p, ctx = {}) {
  p = clamp(p);
  if (p === 0) return copy(from);
  if (p === 1) return copy(to);
  const type = String(a.type),
    w = from.width,
    h = from.height,
    angle =
      ((a.direction === "angle"
        ? Number(a.angle ?? 0)
        : a.direction === "right"
          ? 180
          : a.direction === "up"
            ? 90
            : a.direction === "down"
              ? -90
              : 0) *
        Math.PI) /
      180,
    dx = Math.cos(angle),
    dy = Math.sin(angle),
    soft = Number(a.softness ?? 0.1),
    color = ctx.color
      ? ctx.color(parseColor(String(a.color ?? "#000000")))
      : parseColor(String(a.color ?? "#000000"));
  const blend = (/** @type {(x:number,y:number)=>number} */ fn) => {
    const out = copy(from);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const q = clamp(fn(x, y));
        for (let k = 0; k < 4; k++) {
          const j = (y * w + x) * 4 + k;
          out.data[j] = Number(from.data[j]) * (1 - q) + Number(to.data[j]) * q;
        }
      }
    return out;
  };
  const edge = (/** @type {number} */ v) =>
    soft ? clamp((p * (1 + soft) - v) / soft) : Number(p >= v);
  const coordinate = (/** @type {number} */ x, /** @type {number} */ y) =>
    0.5 +
    (((x + 0.5) / w - 0.5) * dx + ((y + 0.5) / h - 0.5) * dy) /
      (Math.abs(dx) + Math.abs(dy));
  if (["flip", "cube", "page-curl"].includes(type))
    return geometryTransition(from, to, a, p);
  if (type === "cut") return copy(p < 0.5 ? from : to);
  if (type === "crossfade") return mix(from, to, p);
  if (type === "additive-dissolve") {
    const out = copy(from);
    for (let i = 0; i < out.data.length; i++)
      out.data[i] =
        Number(from.data[i]) * Math.min(1, 2 * (1 - p)) +
        Number(to.data[i]) * Math.min(1, 2 * p);
    for (let i = 3; i < out.data.length; i += 4)
      out.data[i] = clamp(Number(out.data[i]));
    return out;
  }
  if (type === "dip-to-color") {
    const solid = new Surface(w, h);
    for (let i = 0; i < solid.data.length; i += 4)
      solid.data.set(
        [
          Number(color[0]) * Number(color[3]),
          Number(color[1]) * Number(color[3]),
          Number(color[2]) * Number(color[3]),
          Number(color[3]),
        ],
        i,
      );
    return p < 0.5 ? mix(from, solid, p * 2) : mix(solid, to, p * 2 - 1);
  }
  if (type === "wipe") return blend((x, y) => edge(coordinate(x, y)));
  if (type === "barn-door")
    return blend((x, y) => edge(Math.abs(coordinate(x, y) - 0.5) * 2));
  if (type === "blinds")
    return blend((x, y) => edge((coordinate(x, y) * 10) % 1));
  if (type === "stripe")
    return blend((x, y) =>
      edge((coordinate(x, y) + (Math.floor((y / h) * 8) % 2) * 0.5) % 1),
    );
  if (type === "circle-open" || type === "circle-close" || type === "iris")
    return blend((x, y) => {
      const r =
        type === "iris"
          ? Math.max(
              Math.abs((x + 0.5 - w / 2) / (w / 2)),
              Math.abs((y + 0.5 - h / 2) / (h / 2)),
            )
          : Math.hypot((x + 0.5 - w / 2) / w, (y + 0.5 - h / 2) / h) *
            Math.SQRT2;
      return edge(type === "circle-close" ? 1 - r : r);
    });
  if (type === "clock-wipe" || type === "radial-wipe")
    return blend((x, y) => {
      const phase =
        ((Math.atan2(y + 0.5 - h / 2, x + 0.5 - w / 2) - angle) / Math.PI / 2 +
          1) %
        1;
      return edge(type === "radial-wipe" ? Math.abs(phase - 0.5) * 2 : phase);
    });
  if (type === "luma") {
    if (!ctx.matte) throw new Error("luma transition requires matte");
    return blend((x, y) =>
      edge(
        luminance(
          [0, 1, 2].map((k) =>
            sample(/** @type {Surface} */ (ctx.matte), x, y, k),
          ),
        ),
      ),
    );
  }
  if (type === "blur") {
    const r = Math.sin(Math.PI * p) * Math.min(w, h) * 0.12;
    return mix(gaussian(from, r), gaussian(to, r), p);
  }
  if (type === "pixelize") {
    const cell = Math.max(
        1,
        Math.round(Math.sin(Math.PI * p) * Math.min(w, h) * 0.2),
      ),
      pixel = (/** @type {Surface} */ s) =>
        warp(
          s,
          (x, y) => [
            Math.floor(x / cell) * cell + (cell - 1) / 2,
            Math.floor(y / cell) * cell + (cell - 1) / 2,
          ],
          true,
        );
    return mix(pixel(from), pixel(to), p);
  }
  if (type === "shader") {
    if (!ctx.read || !a.shader)
      throw new Error("shader transition requires readable shader");
    return native(
      from,
      {
        kind: "shader",
        shader: Buffer.from(ctx.read(String(a.shader))).toString("utf8"),
        progress: p,
        time: ctx.time ?? 0,
        params: ctx.params,
      },
      to,
    );
  }
  if (type === "light-leak") {
    const out = mix(from, to, p);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v =
          Math.sin(Math.PI * p) *
          Math.exp(-((x / w - p) ** 2 + (y / h - 0.5) ** 2) * 8);
        for (let k = 0; k < 3; k++) {
          const j = (y * w + x) * 4 + k;
          out.data[j] = Number(out.data[j]) + v * Number(color[k]);
        }
      }
    return out;
  }
  if (type === "glitch") {
    const shift =
      Math.sin(Math.floor(p * 20) * 91 + Math.floor(h * p)) *
      w *
      0.2 *
      Math.sin(Math.PI * p);
    return mix(
      warp(from, (x, y) => [x + (Math.floor(y / 8) % 2 ? shift : -shift), y]),
      warp(to, (x, y) => [x - (Math.floor(y / 8) % 2 ? shift : -shift), y]),
      p,
    );
  }
  if (type === "morph") {
    // Dense block correspondence drives a bidirectional image warp, then dissolves.
    const out = new Surface(w, h),
      radius = Math.min(8, Math.ceil(Math.min(w, h) / 8)),
      block = 8;
    for (let by = 0; by < h; by += block)
      for (let bx = 0; bx < w; bx += block) {
        let best = Infinity,
          vx = 0,
          vy = 0;
        for (let yy = -radius; yy <= radius; yy++)
          for (let xx = -radius; xx <= radius; xx++) {
            let cost = 0;
            for (let y = by; y < Math.min(h, by + block); y += 2)
              for (let x = bx; x < Math.min(w, bx + block); x += 2)
                for (let k = 0; k < 4; k++)
                  cost +=
                    (sample(from, x, y, k) - sample(to, x + xx, y + yy, k)) **
                    2;
            if (
              cost < best - 1e-9 ||
              (Math.abs(cost - best) < 1e-9 &&
                xx * xx + yy * yy < vx * vx + vy * vy)
            ) {
              best = cost;
              vx = xx;
              vy = yy;
            }
          }
        for (let y = by; y < Math.min(h, by + block); y++)
          for (let x = bx; x < Math.min(w, bx + block); x++)
            for (let k = 0; k < 4; k++)
              out.data[(y * w + x) * 4 + k] =
                sample(from, x - vx * p, y - vy * p, k) * (1 - p) +
                sample(to, x + vx * (1 - p), y + vy * (1 - p), k) * p;
      }
    return out;
  }
  if (
    [
      "slide",
      "push",
      "cover",
      "reveal",
      "whip-pan",
      "film-roll",
      "shuffle",
      "carousel",
      "zoom-in",
      "zoom-out",
      "spin",
      "squash",
    ].includes(type)
  ) {
    const a = warp(from, (x, y) => {
      if (type === "cover" || type === "slide") return [x, y];
      if (type === "zoom-in")
        return [
          w / 2 + (x - w / 2) / (1 + p * 3),
          h / 2 + (y - h / 2) / (1 + p * 3),
        ];
      if (type === "zoom-out")
        return [
          w / 2 + (x - w / 2) / Math.max(0.001, 1 - p),
          h / 2 + (y - h / 2) / Math.max(0.001, 1 - p),
        ];
      if (type === "spin") {
        const a = p * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a);
        return [
          w / 2 + (x - w / 2) * c - (y - h / 2) * s,
          h / 2 + (x - w / 2) * s + (y - h / 2) * c,
        ];
      }
      if (type === "squash")
        return [w / 2 + (x - w / 2) / Math.max(0.001, 1 - p), y];
      if (type === "film-roll") return [x, y + h * p];
      if (type === "shuffle")
        return [x + w * p * (Math.floor(y / 16) % 2 ? 1 : -1), y];
      if (type === "carousel")
        return [
          w / 2 + (x - w / 2 + w * p) / Math.max(0.001, 1 - p * 0.5),
          h / 2 + (y - h / 2) / Math.max(0.001, 1 - p * 0.5),
        ];
      return [x + w * p * dx, y + h * p * dy];
    });
    const b = warp(to, (x, y) => {
      if (type === "reveal") return [x, y];
      if (type === "zoom-in")
        return [
          w / 2 + (x - w / 2) / Math.max(0.001, p),
          h / 2 + (y - h / 2) / Math.max(0.001, p),
        ];
      if (type === "zoom-out")
        return [
          w / 2 + (x - w / 2) / (1 + (1 - p) * 3),
          h / 2 + (y - h / 2) / (1 + (1 - p) * 3),
        ];
      if (type === "spin") {
        const a = (p - 1) * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a);
        return [
          w / 2 + (x - w / 2) * c - (y - h / 2) * s,
          h / 2 + (x - w / 2) * s + (y - h / 2) * c,
        ];
      }
      if (type === "squash")
        return [w / 2 + (x - w / 2) / Math.max(0.001, p), y];
      if (type === "film-roll") return [x, y - h * (1 - p)];
      if (type === "shuffle")
        return [x - w * (1 - p) * (Math.floor(y / 16) % 2 ? 1 : -1), y];
      if (type === "carousel")
        return [
          w / 2 + (x - w / 2 - w * (1 - p)) / Math.max(0.001, 0.5 + p * 0.5),
          h / 2 + (y - h / 2) / Math.max(0.001, 0.5 + p * 0.5),
        ];
      return [x - w * (1 - p) * dx, y - h * (1 - p) * dy];
    });
    if (["zoom-in", "zoom-out", "spin", "squash", "carousel"].includes(type))
      return mix(a, b, p);
    const out = copy(type === "reveal" ? b : a),
      over = type === "reveal" ? a : b;
    for (let i = 0; i < out.data.length; i += 4) {
      const alpha = Number(over.data[i + 3]);
      for (let k = 0; k < 4; k++)
        out.data[i + k] =
          Number(over.data[i + k]) + Number(out.data[i + k]) * (1 - alpha);
    }
    if (type === "whip-pan")
      return gaussian(out, Math.sin(Math.PI * p) * Math.min(w, h) * 0.06);
    if (type === "slide") return mix(from, out, p);
    return out;
  }
  throw new Error(`Unsupported transition: ${type}`);
}
