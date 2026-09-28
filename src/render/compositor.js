/** Affine/vector compositor. Skia supplies path coverage; color math stays linear. */
import { renderParticles } from "./dynamics/particles.js";
import { deformSurface, deformedBounds } from "./dynamics/deform.js";
import { geometryPass } from "./three/pass.js";
import { render3D } from "./three/scene.js";
import { uniformValue } from "./fx/native.js";
import { shutter } from "./shutter.js";
import { transitionWindows, transitionFrame, handles } from "./transitions.js";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import {
  Surface,
  EMPTY_RECT,
  unionRect,
  intersectRect,
  expandRect,
  clampRect,
  fullRect,
} from "./surface.js";
import {
  IDENTITY,
  multiply,
  inverse,
  point,
  transform,
  length,
} from "./geometry/matrix.js";
import { shapePath, modify, modifyPaths, trimPaths } from "./geometry/path.js";
import { paint } from "./geometry/paint.js";
import { composite } from "./geometry/blend.js";
import { layout, align, safeArea } from "./geometry/layout.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {import('./geometry/matrix.js').Matrix} Matrix */
/** @typedef {import('./geometry/layout.js').Box} Box */
/** Full-frame coverage mask; `bbox`, when set, bounds its non-zero pixels.
 * @typedef {Float32Array & {bbox?: import('./surface.js').Rect}} Mask */
const visual = new Set([
  "object3D",
  "shape",
  "layer",
  "group",
  "sequence",
  "adjustment",
  "particleEmitter",
]);
export class Compositor {
  /** @param {import('./frame.js').FrameRenderer} renderer */
  constructor(renderer) {
    this.host = renderer;
    this.width = renderer.width;
    this.height = renderer.height;
    this.vw = this.width / renderer.scale;
    this.vh = this.height / renderer.scale;
    this.paints = new Map(
      (
        renderer.scene.children.find((n) => n.name === "paints")?.children ?? []
      ).map((n) => [String(n.attributes.id), n]),
    );
    this.nodes = new Map();
    this.parents = new Map();
    this.matrices = new Map();
    this.locals = new Map();
    this.boxes = new Map();
    this.hiddenMattes = new Set();
    this.warnings = new Set();
    /** @type {Node|undefined} */ this.captureTarget = undefined;
    /** @type {Surface|undefined} */ this.capture = undefined;
    /** @type {Map<Node,Record<string,any>>} */ this.attrCache = new Map();
    /** @type {number|undefined} */ this.attrTime = undefined;
    /** @type {unknown} */ this.attrOverrides = undefined;
    /** @type {unknown} */ this.attrSamples = undefined;
    /** Scratch canvas for path coverage, reused across fills of this frame.
     * @type {import('@napi-rs/canvas').Canvas|undefined} */
    this.canvas = undefined;
    const index = (/** @type {Node} */ n, /** @type {Node|null} */ parent) => {
      if (n.attributes.id !== undefined)
        this.nodes.set(String(n.attributes.id), n);
      if (parent) this.parents.set(n, parent);
      if (
        n.attributes.matte !== undefined &&
        n.attributes.matteVisible !== true
      )
        this.hiddenMattes.add(String(n.attributes.matte));
      for (const c of n.children) index(c, n);
    };
    index(renderer.composition, null);
    for (const section of renderer.scene.children)
      if (section.name === "lights")
        for (const light of section.children)
          this.nodes.set(String(light.attributes.id), light);
    const project = renderer.scene.children.find((n) => n.name === "project");
    const id = project?.attributes.safeArea;
    const safe = renderer.scene.children
      .find((n) => n.name === "safeAreas")
      ?.children.find((n) => n.attributes.id === id);
    this.safe = safe
      ? safeArea(this.attrs(safe), this.vw, this.vh)
      : { x: 0, y: 0, width: this.vw, height: this.vh };
    this.enforce = safe?.attributes.enforce ?? "off";
  }
  /** Evaluated attributes, memoised for the current instant and overrides.
   * Callers only read the result.
   * @param {Node} n @returns {Record<string,any>} */ attrs(n) {
    const host = this.host;
    if (
      this.attrTime !== host.time ||
      this.attrOverrides !== host.nodeOverrides ||
      this.attrSamples !== host.sampleTimes
    ) {
      this.attrTime = host.time;
      this.attrOverrides = host.nodeOverrides;
      this.attrSamples = host.sampleTimes;
      this.attrCache = new Map();
    }
    let a = this.attrCache.get(n);
    if (!a) {
      a = host.attributes(n);
      this.attrCache.set(n, a);
    }
    return a;
  }
  /** @param {Node} node @param {Matrix} parent @param {number} pw @param {number} ph @param {string} [overrideFit] */
  measure(node, parent, pw, ph, overrideFit) {
    let fit = IDENTITY;
    if (node.sourceBox) {
      const b = node.sourceBox,
        mode = overrideFit ?? b.fit;
      let sx = 1,
        sy = 1;
      if (mode === "fill") {
        sx = pw / b.width;
        sy = ph / b.height;
      } else if (mode !== "none") {
        sx = sy =
          mode === "cover"
            ? Math.max(pw / b.width, ph / b.height)
            : Math.min(pw / b.width, ph / b.height);
        if (mode === "scale-down") sx = sy = Math.min(1, sx);
      }
      fit = [sx, 0, 0, sy, (pw - b.width * sx) / 2, (ph - b.height * sy) / 2];
      pw = b.width;
      ph = b.height;
    }
    const a = this.attrs(node);
    const kids = node.children.filter((n) => visual.has(n.name));
    const sizes = kids.map((n) => {
      const at = this.attrs(n);
      const asset =
        n.name === "layer" ? this.host.assets.get(String(at.asset)) : undefined;
      if (asset?.name === "text" && a.alignItems === "baseline")
        this.host.text(asset);
      return {
        ...at,
        baseline: asset
          ? this.host.baselines.get(String(asset.attributes.id))
          : undefined,
        width:
          at.width ??
          at.boxWidth ??
          (asset ? this.host.io.dimensions?.(asset)?.width : undefined) ??
          asset?.attributes.width ??
          pw,
        height:
          at.height ??
          at.boxHeight ??
          (asset ? this.host.io.dimensions?.(asset)?.height : undefined) ??
          asset?.attributes.height ??
          ph,
      };
    });
    const ink = sizes.map((s, i) => {
      const n = /** @type {Node} */ (kids[i]);
      return ((a.layout && a.layout !== "none") ||
        this.attrs(n).alignX ||
        this.attrs(n).alignY) &&
        n.children.some((c) => c.name === "deform" || c.name === "softBody")
        ? deformedBounds(n, this.host, {
            width: length(s.width, pw, this.vw, this.vh),
            height: length(s.height, ph, this.vw, this.vh),
          })
        : undefined;
    });
    const boxes = layout(
      a,
      sizes.map((s, i) =>
        ink[i] ? { ...s, width: ink[i].width, height: ink[i].height } : s,
      ),
      pw,
      ph,
      this.vw,
      this.vh,
    );
    kids.forEach((n, i) => {
      const at = /** @type {Record<string,any>} */ (sizes[i]);
      let b = /** @type {Box} */ (boxes[i]);
      const target =
        at.alignTo === "frame"
          ? { x: 0, y: 0, width: this.vw, height: this.vh }
          : at.alignTo === "safe-area"
            ? this.safe
            : { x: 0, y: 0, width: pw, height: ph };
      if (at.alignTo === "frame" || at.alignTo === "safe-area") {
        const parentMatrix = multiply(parent, fit),
          inv = inverse(parentMatrix);
        if (inv) {
          const p0 = point(
              inv,
              target.x * this.host.scale,
              target.y * this.host.scale,
            ),
            p1 = point(
              inv,
              (target.x + target.width) * this.host.scale,
              (target.y + target.height) * this.host.scale,
            );
          b = align(
            at,
            b,
            {
              x: Math.min(p0.x, p1.x),
              y: Math.min(p0.y, p1.y),
              width: Math.abs(p1.x - p0.x),
              height: Math.abs(p1.y - p0.y),
            },
            this.vw,
            this.vh,
          );
        }
      } else b = align(at, b, target, this.vw, this.vh);
      const bounds = ink[i];
      if (bounds)
        b = {
          ...b,
          x: b.x - bounds.x,
          y: b.y - bounds.y,
          width: length(at.width, pw, this.vw, this.vh),
          height: length(at.height, ph, this.vw, this.vh),
        };
      this.boxes.set(n, b);
      const local = multiply(
        fit,
        transform(
          { ...at, x: b.x, y: b.y },
          b.width,
          b.height,
          this.vw,
          this.vh,
          this.host.anchorMode,
        ),
      );
      this.locals.set(n, local);
      const m = multiply(parent, local);
      this.matrices.set(n, m);
      this.measure(n, m, b.width, b.height);
    });
  }
  /** @param {Node} node @param {Set<Node>} [stack] @returns {Matrix} */ world(
    node,
    stack = new Set(),
  ) {
    if (stack.has(node)) throw new Error("parent transform cycle");
    stack.add(node);
    const parent = this.nodes.get(String(node.attributes.parent)),
      b = this.boxes.get(node);
    if (parent && b) {
      const a = this.attrs(node);
      return multiply(
        this.world(parent, stack),
        transform(
          { ...a, x: b.x, y: b.y },
          b.width,
          b.height,
          this.vw,
          this.vh,
          this.host.anchorMode,
        ),
      );
    }
    const container = this.parents.get(node);
    if (container && container !== this.host.composition && b)
      return multiply(
        this.world(container, stack),
        this.locals.get(node) ?? IDENTITY,
      );
    return this.matrices.get(node) ?? IDENTITY;
  }
  /**
   * Anti-aliased coverage of `path` under `m` as a full-frame mask whose `bbox`
   * bounds the rasterised area: the device bounds of the path plus stroke reach.
   * Only that area is read back from the canvas.
   * @param {Path2D} path @param {Matrix} m @param {Record<string,any>} [stroke] @returns {Mask}
   */
  coverage(path, m, stroke) {
    const W = this.width,
      H = this.height,
      out = /** @type {Mask} */ (new Float32Array(W * H));
    const lineWidth = stroke
      ? Number(stroke.strokeWidth ?? 0) *
        (stroke.strokePosition && stroke.strokePosition !== "center" ? 2 : 1)
      : 0;
    // Miter joins reach lineWidth/2 * miterLimit, square caps lineWidth/2 * sqrt 2.
    const pad = stroke
      ? (lineWidth / 2) * Math.max(Number(stroke.miterLimit ?? 4), Math.SQRT2)
      : 0;
    const [l, tp, r, b] = path.getBounds();
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [px, py] of /** @type {[number, number][]} */ ([
      [l - pad, tp - pad],
      [r + pad, tp - pad],
      [l - pad, b + pad],
      [r + pad, b + pad],
    ])) {
      const x = m[0] * px + m[2] * py + m[4],
        y = m[1] * px + m[3] * py + m[5];
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const region = Number.isFinite(x0 + y0 + x1 + y1)
      ? clampRect({ x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 }, W, H)
      : fullRect(this);
    out.bbox = region;
    if (region.x1 <= region.x0 || region.y1 <= region.y0) return out;
    const canvas = (this.canvas ??= createCanvas(W, H)),
      ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(...m);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    if (stroke) {
      ctx.lineWidth = lineWidth;
      ctx.lineCap = stroke.strokeCap ?? "butt";
      ctx.lineJoin = stroke.strokeJoin ?? "miter";
      ctx.miterLimit = Number(stroke.miterLimit ?? 4);
      ctx.setLineDash((stroke.dash ?? []).map(Number));
      ctx.lineDashOffset = Number(stroke.dashOffset ?? 0);
      ctx.stroke(path);
      if (
        stroke.strokePosition === "inside" ||
        stroke.strokePosition === "outside"
      ) {
        ctx.globalCompositeOperation =
          stroke.strokePosition === "inside"
            ? "destination-in"
            : "destination-out";
        ctx.fill(path, stroke.fillRule ?? "nonzero");
      }
    } else
      ctx.fill(
        path,
        path.getFillTypeString().toLowerCase().includes("even")
          ? "evenodd"
          : "nonzero",
      );
    const bw = region.x1 - region.x0,
      bytes = ctx.getImageData(
        region.x0,
        region.y0,
        bw,
        region.y1 - region.y0,
      ).data;
    ctx.restore();
    for (let y = region.y0; y < region.y1; y++) {
      let i = y * W + region.x0,
        k = (y - region.y0) * bw * 4 + 3;
      for (let x = region.x0; x < region.x1; x++, i++, k += 4)
        out[i] = /** @type {number} */ (bytes[k]) / 255;
    }
    return out;
  }
  /** @param {Float32Array} mask @param {number} radius */
  feather(mask, radius) {
    const r = Math.ceil(radius);
    if (!r) return mask;
    let src = mask;
    for (let axis = 0; axis < 2; axis++) {
      const out = new Float32Array(mask.length),
        outer = axis ? this.width : this.height,
        inner = axis ? this.height : this.width;
      for (let o = 0; o < outer; o++) {
        let sum = 0;
        for (let i = -r; i <= r; i++)
          if (i >= 0 && i < inner)
            sum += Number(src[axis ? i * this.width + o : o * this.width + i]);
        for (let i = 0; i < inner; i++) {
          const at = axis ? i * this.width + o : o * this.width + i;
          out[at] = sum / (2 * r + 1);
          const sub = i - r,
            add = i + r + 1;
          if (sub >= 0)
            sum -= Number(
              src[axis ? sub * this.width + o : o * this.width + sub],
            );
          if (add < inner)
            sum += Number(
              src[axis ? add * this.width + o : o * this.width + add],
            );
        }
      }
      src = out;
    }
    // A box window of zeros sums to zero: the blur reaches r beyond the input.
    const result = /** @type {Mask} */ (src),
      bounds = /** @type {Mask} */ (mask).bbox;
    result.bbox = bounds
      ? clampRect(expandRect(bounds, r), this.width, this.height)
      : undefined;
    return result;
  }
  /** @param {Node} node @param {Matrix} m @param {Box} box */
  masks(node, m, box) {
    /** @type {Mask|null} */ let mask = null;
    for (const n of node.children.filter((n) => n.name === "mask")) {
      const a = this.attrs(n);
      if (a.mode === "none") continue;
      const w = length(a.width ?? box.width, box.width, this.vw, this.vh),
        h = length(a.height ?? box.height, box.height, this.vw, this.vh);
      let p = shapePath(a, w, h);
      if (Number(a.expansion ?? 0) !== 0)
        p = /** @type {NonNullable<ReturnType<typeof modify>[number]>} */ (
          modify(
            p,
            { type: "offset-path", amount: Number(a.expansion) },
            this.host.time,
          )[0]
        ).path;
      const local = multiply(
        m,
        transform(a, w, h, this.vw, this.vh, this.host.anchorMode),
      );
      /** @type {Mask} */ let current = this.coverage(p, local);
      current = this.feather(
        current,
        Number(a.feather ?? 0) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
      );
      const opacity = Number(a.opacity ?? 1);
      if (a.invert) {
        for (let i = 0; i < current.length; i++)
          current[i] = (1 - /** @type {number} */ (current[i])) * opacity;
        current.bbox = undefined;
      } else {
        const rg = current.bbox
          ? clampRect(current.bbox, this.width, this.height)
          : fullRect(this);
        for (let y = rg.y0; y < rg.y1; y++)
          for (
            let i = y * this.width + rg.x0, e = y * this.width + rg.x1;
            i < e;
            i++
          )
            current[i] = /** @type {number} */ (current[i]) * opacity;
      }
      if (!mask) {
        mask =
          a.mode === "subtract"
            ? /** @type {Mask} */ (new Float32Array(current.length).fill(1))
            : current;
        if (a.mode !== "subtract") continue;
      }
      const mode = a.mode,
        xb = mask.bbox,
        yb = current.bbox;
      for (let i = 0; i < mask.length; i++) {
        const x = /** @type {number} */ (mask[i]),
          y = /** @type {number} */ (current[i]);
        mask[i] =
          mode === "add"
            ? x + y - x * y
            : mode === "subtract"
              ? x * (1 - y)
              : mode === "lighten"
                ? Math.max(x, y)
                : mode === "darken"
                  ? Math.min(x, y)
                  : mode === "difference"
                    ? x + y - 2 * x * y
                    : x * y;
      }
      mask.bbox =
        mode === "add" || mode === "lighten" || mode === "difference"
          ? unionRect(xb, yb)
          : mode === "subtract"
            ? xb
            : intersectRect(xb, yb);
    }
    return mask;
  }
  /** Multiplies a full-frame surface by a mask; zero stays zero on both sides.
   * @param {Surface} surface @param {Mask|null} mask */ applyMask(
    surface,
    mask,
  ) {
    if (!mask) return;
    const W = this.width,
      d = surface.data,
      region = surface.bbox
        ? clampRect(surface.bbox, W, this.height)
        : fullRect(this);
    for (let y = region.y0; y < region.y1; y++)
      for (let x = region.x0; x < region.x1; x++) {
        const i = y * W + x,
          j = i * 4,
          v = /** @type {number} */ (mask[i]);
        d[j] = /** @type {number} */ (d[j]) * v;
        d[j + 1] = /** @type {number} */ (d[j + 1]) * v;
        d[j + 2] = /** @type {number} */ (d[j + 2]) * v;
        d[j + 3] = /** @type {number} */ (d[j + 3]) * v;
      }
    if (mask.bbox) surface.bbox = intersectRect(surface.bbox, mask.bbox);
  }
  /** @param {string} id @param {Node} [layer] */ image(id, layer) {
    const asset = this.host.assets.get(id);
    if (!asset) throw new Error(`missing asset ${id}`);
    if (this.host.io.media) return this.host.io.media(asset, this.host, layer);
    if (asset.name === "image") return this.host.image(asset);
    if (asset.name === "text") return this.host.text(asset);
    this.host.unsupported.add(`<${asset.name}> assets`);
    return new Surface(1, 1);
  }
  /** @param {Surface} dst @param {Path2D} path @param {Matrix} m @param {string} value @param {Box} box @param {Record<string,any>} [stroke] */
  fill(dst, path, m, value, box, stroke) {
    const inv = inverse(m);
    if (!inv) return;
    const ocio = !!this.host.color.a.ocioConfig,
      target = ocio ? new Surface(this.width, this.height) : dst;
    if (ocio) target.bbox = EMPTY_RECT;
    const mask = this.coverage(path, m, stroke),
      sample = paint(
        value,
        {
          paints: this.paints,
          tokens: this.host.tokens,
          attributes: (n) => this.attrs(n),
          image: (id) => this.image(id),
          scale: this.host.scale,
        },
        box.width,
        box.height,
      ),
      W = this.width,
      region = mask.bbox
        ? clampRect(mask.bbox, W, this.height)
        : fullRect(this),
      // A plain colour is the same at every pixel: convert it once.
      constant = !value.startsWith("url(#");
    let pr = 0,
      pg = 0,
      pb = 0,
      pa = 0;
    if (constant) {
      const c = ocio ? sample(0, 0) : this.host.color.rgb(sample(0, 0));
      pa = Number(c[3]);
      pr = Number(c[0]) * pa;
      pg = Number(c[1]) * pa;
      pb = Number(c[2]) * pa;
    }
    for (let y = region.y0; y < region.y1; y++)
      for (let x = region.x0; x < region.x1; x++) {
        const i = y * W + x,
          coverage = mask[i];
        if (!coverage) continue;
        if (constant) {
          target.blend(i * 4, pr, pg, pb, pa, coverage);
          continue;
        }
        const hx = x + 0.5,
          hy = y + 0.5,
          qx = inv[0] * hx + inv[2] * hy + inv[4],
          qy = inv[1] * hx + inv[3] * hy + inv[5],
          c = ocio ? sample(qx, qy) : this.host.color.rgb(sample(qx, qy)),
          a = Number(c[3]);
        target.blend(
          i * 4,
          Number(c[0]) * a,
          Number(c[1]) * a,
          Number(c[2]) * a,
          a,
          coverage,
        );
      }
    target.bbox = unionRect(target.bbox, mask.bbox);
    if (target !== dst) composite(dst, this.host.color.input(target));
  }
  /** @param {Surface} dst @param {Surface} src @param {Matrix} m @param {Box} box @param {Record<string,any>} a */
  imageLayer(dst, src, m, box, a) {
    const original = src;
    src = this.host.color.input(src);
    if (src !== original) {
      src.logicalWidth = original.logicalWidth;
      src.logicalHeight = original.logicalHeight;
      src.originX = original.originX;
      src.originY = original.originY;
      src.overflow = original.overflow;
    }
    const inv = inverse(m);
    if (!inv) return;
    const sourceW = src.logicalWidth ?? src.width / this.host.scale,
      sourceH = src.logicalHeight ?? src.height / this.host.scale,
      cx = Number(a.cropLeft ?? 0),
      cy = Number(a.cropTop ?? 0),
      sw = sourceW * (1 - cx - Number(a.cropRight ?? 0)),
      sh = sourceH * (1 - cy - Number(a.cropBottom ?? 0));
    if (sw <= 0 || sh <= 0) throw new Error("crop leaves no source pixels");
    let sx = 1,
      sy = 1;
    const fit = a.fit ?? "none";
    if (["contain", "cover", "scale-down", "contain-blur"].includes(fit)) {
      sx = sy =
        fit === "cover"
          ? Math.max(box.width / sw, box.height / sh)
          : Math.min(box.width / sw, box.height / sh);
      if (fit === "scale-down") sx = sy = Math.min(1, sx);
    } else if (fit === "fill") {
      sx = box.width / sw;
      sy = box.height / sh;
    }
    const fx = Number(a.focusX ?? 0.5),
      fy = Number(a.focusY ?? 0.5),
      ox = (box.width - sw * sx) * fx,
      oy = (box.height - sh * sy) * fy;
    if (fit === "contain-blur") {
      const bg = new Surface(this.width, this.height);
      this.imageLayer(bg, src, m, box, { ...a, fit: "cover" });
      for (let k = 0; k < 4; k++) {
        const channel = new Float32Array(this.width * this.height);
        for (let i = 0; i < channel.length; i++)
          channel[i] = Number(bg.data[i * 4 + k]);
        const blurred = this.feather(channel, 12 * this.host.scale);
        for (let i = 0; i < channel.length; i++)
          bg.data[i * 4 + k] = Number(blurred[i]);
      }
      const boundary = new Path2D();
      boundary.rect(0, 0, box.width, box.height);
      this.applyMask(bg, this.coverage(boundary, m));
      composite(dst, bg);
    }
    const W = this.width,
      H = this.height,
      overflow = src.overflow,
      sd = src.data,
      dd = dst.data,
      sW = src.width,
      sH = src.height,
      hs = this.host.scale,
      originX = src.originX,
      originY = src.originY,
      bw = box.width,
      bh = box.height,
      flipX = a.flipX,
      flipY = a.flipY;
    // Pixel centres that map into the box lie inside the box's device bounds.
    let region = fullRect(this);
    if (!overflow) {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const [px, py] of /** @type {[number, number][]} */ ([
        [0, 0],
        [bw, 0],
        [0, bh],
        [bw, bh],
      ])) {
        const x = m[0] * px + m[2] * py + m[4],
          y = m[1] * px + m[3] * py + m[5];
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      if (Number.isFinite(x0 + y0 + x1 + y1))
        region = clampRect(
          { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 },
          W,
          H,
        );
    }
    // Without rotation or skew the zero terms vanish exactly (x + 0 is x), so
    // the vertical mapping is constant along a row.
    const axisAligned = inv[1] === 0 && inv[2] === 0;
    for (let y = region.y0; y < region.y1; y++) {
      const hy = y + 0.5,
        rowQy = inv[3] * hy + inv[5];
      for (let x = region.x0; x < region.x1; x++) {
        const hx = x + 0.5,
          qx = axisAligned
            ? inv[0] * hx + inv[4]
            : inv[0] * hx + inv[2] * hy + inv[4],
          qy = axisAligned ? rowQy : inv[1] * hx + inv[3] * hy + inv[5];
        if (!overflow && (qx < 0 || qy < 0 || qx >= bw || qy >= bh)) continue;
        let u = (qx - ox) / sx,
          v = (qy - oy) / sy;
        if (flipX) u = sw - u;
        if (flipY) v = sh - v;
        if (!overflow && (u < 0 || v < 0 || u >= sw || v >= sh)) continue;
        u += cx * sourceW;
        v += cy * sourceH;
        const px = Math.floor((u - originX) * hs),
          py = Math.floor((v - originY) * hs);
        if (px < 0 || py < 0 || px >= sW || py >= sH) continue;
        const i = (py * sW + px) * 4,
          sa = /** @type {number} */ (sd[i + 3]),
          o = (y * W + x) * 4;
        if (sa === 1) {
          // Opaque source over finite destination: r*1 + d*0 is r.
          dd[o] = /** @type {number} */ (sd[i]);
          dd[o + 1] = /** @type {number} */ (sd[i + 1]);
          dd[o + 2] = /** @type {number} */ (sd[i + 2]);
          dd[o + 3] = 1;
        } else
          dst.blend(
            o,
            /** @type {number} */ (sd[i]),
            /** @type {number} */ (sd[i + 1]),
            /** @type {number} */ (sd[i + 2]),
            sa,
            1,
          );
      }
    }
    dst.bbox = unionRect(dst.bbox, region);
  }
  /** @param {Node} node @param {Surface} dst @param {Mask|null} clip @param {Set<Node>} stack @param {boolean} [matte] */
  draw(node, dst, clip, stack, matte = false) {
    if (
      node.name === "object3D" ||
      (!this.host.inTexture && this.isGeometry(node))
    ) {
      if (
        this.host.active(node) &&
        (matte || !this.hiddenMattes.has(String(node.attributes.id)))
      )
        this.geometry([node], dst, clip);
      return;
    }
    if (
      !this.host.active(node) ||
      (!matte && this.hiddenMattes.has(String(node.attributes.id)))
    )
      return;
    const project = this.host.scene.children.find((n) => n.name === "project");
    let blurFlag = this.host.value(node, "motionBlur"),
      ancestor = this.parents.get(node);
    while ((blurFlag === undefined || blurFlag === "inherit") && ancestor) {
      blurFlag = this.host.value(ancestor, "motionBlur");
      ancestor = this.parents.get(ancestor);
    }
    const blurEnabled =
      blurFlag === "on" ||
      blurFlag === true ||
      ((blurFlag === undefined || blurFlag === "inherit") &&
        project?.attributes.motionBlur === true);
    if (
      blurEnabled &&
      !this.host.shutterSampling &&
      !this.host.effectStops.size &&
      ["shape", "layer", "particleEmitter", "adjustment"].includes(node.name)
    ) {
      const original = this.host.time;
      this.host.shutterSampling = true;
      try {
        const surface = shutter(
          original,
          this.host.fps,
          project?.attributes ?? {},
          (t) => {
            this.host.time = t;
            return new Compositor(this.host).render(node);
          },
        );
        this.host.time = original;
        if (node.name === "adjustment") {
          for (let i = 0; i < dst.data.length; i++) {
            const weight = clip ? Number(clip[Math.floor(i / 4)]) : 1;
            dst.data[i] =
              Number(dst.data[i]) * (1 - weight) +
              Number(surface.data[i]) * weight;
          }
          dst.bbox = undefined;
        } else {
          this.applyMask(surface, clip);
          composite(dst, surface, String(this.attrs(node).blend ?? "normal"));
        }
        return;
      } finally {
        this.host.time = original;
        this.host.shutterSampling = false;
      }
    }
    if (stack.has(node)) throw new Error("matte cycle");
    const next = new Set(stack).add(node),
      a = this.attrs(node),
      box = this.boxes.get(node) ?? {
        x: 0,
        y: 0,
        width: this.vw,
        height: this.vh,
      },
      m = this.world(node);
    if (Number(a.opacity ?? 1) <= 0) return;
    if (
      this.enforce !== "off" &&
      ((node.name === "layer" &&
        this.host.assets.get(String(a.asset))?.name === "text") ||
        (a.tags ?? []).some(
          (/** @type {string} */ t) => t === "cta" || t === "logo",
        ))
    ) {
      const invScale = 1 / this.host.scale,
        ink = node.children.some(
          (n) => n.name === "deform" || n.name === "softBody",
        )
          ? deformedBounds(node, this.host, box)
          : { x: 0, y: 0, width: box.width, height: box.height },
        corners = [
          [ink.x, ink.y],
          [ink.x + ink.width, ink.y],
          [ink.x, ink.y + ink.height],
          [ink.x + ink.width, ink.y + ink.height],
        ].map(([x, y]) => point(m, Number(x), Number(y)));
      if (
        corners.some(
          (p) =>
            p.x * invScale < this.safe.x ||
            p.y * invScale < this.safe.y ||
            p.x * invScale > this.safe.x + this.safe.width ||
            p.y * invScale > this.safe.y + this.safe.height,
        )
      ) {
        const message = `${String(a.id)} is outside the safe area`;
        if (this.enforce === "error") throw new Error(message);
        this.warnings.add(message);
        this.host.warnings.add(message);
      }
    }
    let localClip = clip;
    if (a.clip) {
      const rect = new Path2D();
      rect.rect(0, 0, box.width, box.height);
      localClip = this.coverage(rect, m);
      if (clip) {
        for (let i = 0; i < clip.length; i++)
          localClip[i] =
            /** @type {number} */ (localClip[i]) *
            /** @type {number} */ (clip[i]);
        localClip.bbox = intersectRect(localClip.bbox, clip.bbox);
      }
    }
    let masks = this.masks(node, m, box);
    const opacity = Number(a.opacity ?? 1),
      effects = (a.effects ?? []).map(String);
    const grouped = node.name === "group" || node.name === "sequence";
    const isolated =
      node.sourceBox?.fit === "contain-blur" ||
      a.isolate ||
      opacity !== 1 ||
      (a.blend && a.blend !== "normal") ||
      effects.length ||
      masks ||
      a.matte;
    if (grouped && !isolated) {
      this.children(node, dst, localClip, next);
      return;
    }
    const layer = new Surface(this.width, this.height);
    layer.bbox = EMPTY_RECT;
    if (grouped) {
      if (node.sourceBox?.fit === "contain-blur") {
        this.measure(node, m, box.width, box.height, "cover");
        this.children(node, layer, null, next);
        for (let k = 0; k < 4; k++) {
          const channel = new Float32Array(this.width * this.height);
          for (let i = 0; i < channel.length; i++)
            channel[i] = Number(layer.data[i * 4 + k]);
          const blurred = this.feather(channel, 12 * this.host.scale);
          for (let i = 0; i < channel.length; i++)
            layer.data[i * 4 + k] = Number(blurred[i]);
        }
        layer.bbox = undefined;
        this.measure(node, m, box.width, box.height);
      }
      this.children(node, layer, null, next);
    } else if (node.name === "shape") {
      let paths = [{ path: shapePath(a, box.width, box.height), opacity: 1 }];
      for (const modifier of node.children.filter(
        (n) => n.name === "shapeModifier",
      ))
        paths = modifyPaths(paths, this.attrs(modifier), this.host.time);
      paths = trimPaths(paths, a);
      for (const part of paths) {
        const temp = new Surface(this.width, this.height),
          p = part.path,
          fill = () =>
            this.fill(temp, p, m, String(a.fill ?? "#FFFFFFFF"), box),
          stroke = () => {
            if (Number(a.strokeWidth) > 0)
              this.fill(temp, p, m, String(a.stroke ?? "#00000000"), box, a);
          };
        temp.bbox = EMPTY_RECT;
        if (a.paintOrder === "stroke-fill") {
          stroke();
          fill();
        } else {
          fill();
          stroke();
        }
        composite(layer, temp, "normal", part.opacity);
      }
    } else if (node.name === "layer") {
      const isText = this.host.assets.get(String(a.asset))?.name === "text";
      if (isText && this.host.suppressText) return;
      this.imageLayer(layer, this.image(String(a.asset), node), m, box, a);
    } else if (node.name === "adjustment") {
      layer.data.set(dst.data);
      layer.bbox = dst.bbox;
    } else if (node.name === "particleEmitter") {
      const samplePaint = (
        /** @type {string} */ spec,
        /** @type {number} */ x,
        /** @type {number} */ y,
      ) =>
        this.host.color.rgb(
          paint(
            spec,
            {
              paints: this.paints,
              tokens: this.host.tokens,
              attributes: (n) => this.attrs(n),
              image: (id) => this.image(id),
              scale: this.host.scale,
            },
            box.width,
            box.height,
          )(x, y),
        );
      layer.data.set(renderParticles(node, this.host, m, samplePaint).data);
      layer.bbox = undefined;
    }
    if (
      node.children.some((c) => c.name === "deform" || c.name === "softBody")
    ) {
      layer.data.set(deformSurface(layer, node, this.host, m, box).data);
      layer.bbox = undefined;
      if (masks) {
        const maskSurface = new Surface(this.width, this.height);
        for (let i = 0; i < masks.length; i++)
          maskSurface.data.set(
            [
              Number(masks[i]),
              Number(masks[i]),
              Number(masks[i]),
              Number(masks[i]),
            ],
            i * 4,
          );
        const warped = deformSurface(maskSurface, node, this.host, m, box);
        for (let i = 0; i < masks.length; i++)
          masks[i] = Number(warped.data[i * 4 + 3]);
        masks.bbox = undefined;
      }
    }
    for (const id of effects) {
      if (this.host.effectStops.get(node) === id) break;
      const effect = this.host.effects.get(id),
        ea = effect ? this.attrs(effect) : {};
      let source;
      const sourcePaint =
        ea.type === "gradient-map" && this.paints.has(String(ea.source))
          ? `url(#${String(ea.source)})`
          : undefined;
      if (ea.source && !sourcePaint) {
        const target = this.nodes.get(String(ea.source));
        if (target) {
          source = new Surface(this.width, this.height);
          this.draw(target, source, null, next, true);
        } else source = this.host.color.input(this.image(String(ea.source)));
      }
      const shaderPaint =
        ea.paint || sourcePaint
          ? paint(
              String(ea.paint || sourcePaint),
              {
                paints: this.paints,
                tokens: this.host.tokens,
                attributes: (n) => this.attrs(n),
                image: (id) => this.image(id),
                scale: this.host.scale,
              },
              this.vw,
              this.vh,
            )
          : undefined;
      this.host.applyEffects([id], layer, layer.bounds(), {
        source,
        params: Object.fromEntries(
          (effect?.children ?? [])
            .filter((n) => n.name === "param")
            .map((n) => [
              String(n.attributes.name),
              uniformValue(n.attributes.value),
            ]),
        ),
        lights: (ea.lights ?? []).map((/** @type {string} */ id) => {
          const n = this.nodes.get(String(id));
          if (!n) throw new Error(`Missing light ${id}`);
          return this.attrs(n);
        }),
        paint: shaderPaint
          ? (x, y) =>
              this.host.color.rgb(
                shaderPaint(x / this.host.scale, y / this.host.scale),
              )
          : undefined,
        sample: (t) => {
          const original = this.host.time,
            previous = this.host.effectStops.get(node);
          try {
            this.host.time = t;
            this.host.effectStops.set(node, id);
            return new Compositor(this.host).render(node);
          } finally {
            this.host.time = original;
            if (previous) this.host.effectStops.set(node, previous);
            else this.host.effectStops.delete(node);
          }
        },
      });
    }
    if (this.host.effectStops.has(node)) {
      dst.data.set(layer.data);
      dst.bbox = layer.bbox;
      if (this.captureTarget === node) this.capture = layer;
      return;
    }
    if (a.matte !== undefined) {
      const target = this.nodes.get(String(a.matte));
      if (!target) throw new Error("missing matte");
      const source = new Surface(this.width, this.height);
      source.bbox = EMPTY_RECT;
      this.draw(target, source, null, next, true);
      const mask = /** @type {Mask} */ (
          new Float32Array(this.width * this.height)
        ),
        sdata = source.data,
        luma = String(a.matteMode).startsWith("luma"),
        inverted = String(a.matteMode).endsWith("inverted");
      for (let i = 0; i < mask.length; i++) {
        const j = i * 4,
          alpha = /** @type {number} */ (sdata[j + 3]);
        let v = luma
          ? 0.2126 * /** @type {number} */ (sdata[j]) +
            0.7152 * /** @type {number} */ (sdata[j + 1]) +
            0.0722 * /** @type {number} */ (sdata[j + 2])
          : alpha;
        if (inverted) v = 1 - v;
        mask[i] = v;
      }
      if (!inverted) mask.bbox = source.bbox;
      if (masks) {
        for (let i = 0; i < mask.length; i++)
          mask[i] =
            /** @type {number} */ (mask[i]) * /** @type {number} */ (masks[i]);
        mask.bbox = intersectRect(mask.bbox, masks.bbox);
      }
      masks = mask;
    }
    if (node.name === "adjustment") {
      if (a.blend && a.blend !== "normal") {
        const mixed = new Surface(this.width, this.height);
        mixed.data.set(dst.data);
        mixed.bbox = dst.bbox;
        composite(mixed, layer, String(a.blend));
        layer.data.set(mixed.data);
        layer.bbox = mixed.bbox;
      }
      const dd = dst.data,
        ld = layer.data;
      for (let i = 0; i < ld.length; i += 4) {
        const amount =
          opacity *
          (masks ? /** @type {number} */ (masks[i / 4]) : 1) *
          (localClip ? /** @type {number} */ (localClip[i / 4]) : 1);
        for (let k = 0; k < 4; k++)
          dd[i + k] =
            /** @type {number} */ (dd[i + k]) * (1 - amount) +
            /** @type {number} */ (ld[i + k]) * amount;
      }
      dst.bbox = unionRect(dst.bbox, layer.bbox);
      if (this.captureTarget === node) {
        this.capture = new Surface(this.width, this.height);
        this.capture.data.set(dst.data);
      }
      return;
    }
    this.applyMask(layer, masks);
    this.applyMask(layer, localClip);
    if (
      this.host.captureContrast &&
      node.name === "layer" &&
      this.host.assets.get(String(a.asset))?.name === "text"
    )
      this.host.recordTextMask(layer, String(a.id));
    if (localClip && /^(stencil|silhouette)/.test(String(a.blend))) {
      const copy = new Surface(this.width, this.height);
      copy.data.set(dst.data);
      copy.bbox = dst.bbox;
      composite(copy, layer, String(a.blend), opacity);
      const dd = dst.data,
        cd = copy.data;
      for (let i = 0; i < localClip.length; i++) {
        const w = /** @type {number} */ (localClip[i]),
          j = i * 4;
        for (let k = 0; k < 4; k++)
          dd[j + k] =
            /** @type {number} */ (dd[j + k]) * (1 - w) +
            /** @type {number} */ (cd[j + k]) * w;
      }
      dst.bbox = unionRect(dst.bbox, copy.bbox);
    } else composite(dst, layer, String(a.blend ?? "normal"), opacity);
  }
  /** @param {Node} n */
  isGeometry(n) {
    return (
      n.name === "object3D" ||
      this.attrs(n).threeD === true ||
      this.nodes.get(String(this.attrs(n).parent))?.name === "object3D"
    );
  }
  /** Render a contiguous 3D stack with one shared depth buffer.
   * @param {Node[]} nodes @param {Surface} dst @param {Mask|null} clip */
  geometry(nodes, dst, clip) {
    const previous = this.host.geometryFilter,
      excluded = this.host.geometryExcluded,
      overrides = this.host.nodeOverrides;
    const selected = new Set(nodes);
    const descendants = (/** @type {Node} */ n) => {
      for (const c of n.children) {
        if (c.name === "object3D") selected.add(c);
        descendants(c);
      }
    };
    for (const n of nodes) if (n.name === "object3D") descendants(n);
    this.host.geometryFilter = selected;
    this.host.geometryExcluded = this.hiddenMattes;
    this.host.nodeOverrides = new Map(overrides);
    // Opacity of ordinary groups is applied once by the isolating compositor.
    for (const n of this.nodes.values())
      if (
        ["group", "sequence"].includes(n.name) &&
        this.attrs(n).threeD !== true
      )
        this.host.nodeOverrides.set(n, { ...overrides.get(n), opacity: 1 });
    try {
      const surface = geometryPass(this.host);
      this.applyMask(surface, clip);
      composite(dst, surface);
    } finally {
      this.host.geometryFilter = previous;
      this.host.geometryExcluded = excluded;
      this.host.nodeOverrides = overrides;
    }
  }
  /** @param {Node} node @param {Surface} dst @param {Mask|null} clip @param {Set<Node>} stack */
  children(node, dst, clip, stack) {
    const flatten = (/** @type {Node} */ parent) => {
      /** @type {Node[]} */ const result = [];
      for (const n of parent.children
        .filter((n) => visual.has(n.name))
        .sort(
          (a, b) => Number(this.attrs(a).z ?? 0) - Number(this.attrs(b).z ?? 0),
        )) {
        const a = this.attrs(n);
        if (
          ["group", "sequence"].includes(n.name) &&
          !this.isGeometry(n) &&
          !(a.tags ?? []).some((/** @type {string} */ t) =>
            ["logo", "cta"].includes(t),
          ) &&
          !n.sourceBox &&
          !a.clip &&
          !a.isolate &&
          Number(a.opacity ?? 1) === 1 &&
          (!a.blend || a.blend === "normal") &&
          !a.effects?.length &&
          !a.matte &&
          !n.children.some((c) =>
            ["mask", "transition", "deform", "softBody"].includes(c.name),
          ) &&
          this.host.active(n)
        )
          result.push(...flatten(n));
        else result.push(n);
      }
      return result;
    };
    const captions =
      node === this.host.composition
        ? this.host.captionTracks.filter((t) =>
            this.host.captionOutput.burnCaptions
              ? t.attributes.id === this.host.captionOutput.burnCaptions
              : t.attributes.mode !== "sidecar",
          )
        : [];
    const kids = [
      ...flatten(node).filter((n) => visual.has(n.name)),
      ...captions,
    ]
      .map((n, i) => ({ n, i, z: Number(this.host.value(n, "z") ?? 0) }))
      .sort((a, b) => a.z - b.z || a.i - b.i);
    const windows = transitionWindows(
        node,
        this.host.time,
        this.host.runtime,
      ).filter((w) => w.active),
      claimed = new Set();
    for (const window of windows)
      for (const endpoint of [window.from, window.to])
        if (endpoint) {
          if (claimed.has(endpoint))
            throw new Error("overlapping transitions share an endpoint");
          claimed.add(endpoint);
        }
    const drawn = new Set();
    /** @type {Node[]} */ let pending = [];
    const flush = () => {
      if (pending.length) this.geometry(pending, dst, clip);
      pending = [];
    };
    for (const { n } of kids) {
      if (n.name === "captionTrack") {
        flush();
        this.host.paintCaption?.(n, dst);
        dst.bbox = undefined;
        continue;
      }
      if (
        !this.host.inTexture &&
        this.isGeometry(n) &&
        !windows.some((w) => w.from === n || w.to === n)
      ) {
        if (
          this.host.active(n) &&
          !this.hiddenMattes.has(String(n.attributes.id))
        )
          pending.push(n);
        continue;
      }
      flush();
      if (this.capture) return;
      const window = windows.find((w) => w.from === n || w.to === n);
      if (!window) {
        this.draw(n, dst, clip, stack);
        continue;
      }
      if (drawn.has(window)) continue;
      drawn.add(window);
      const endpoint = (/** @type {Node|undefined} */ target) => {
        const surface = new Surface(this.width, this.height);
        if (!target) return surface;
        const before = this.host.handles;
        this.host.handles = new Set([
          ...before,
          ...handles(target, this.host.runtime),
        ]);
        try {
          this.draw(target, surface, null, stack, true);
          return surface;
        } finally {
          this.host.handles = before;
        }
      };
      const from = endpoint(window.from),
        to = endpoint(window.to),
        matte = window.a.matte
          ? endpoint(this.nodes.get(String(window.a.matte)))
          : undefined;
      const params = Object.fromEntries(
        window.node.children
          .filter((c) => c.name === "param")
          .map((c) => [
            String(c.attributes.name),
            uniformValue(c.attributes.value),
          ]),
      );
      let result = transitionFrame(
        from,
        to,
        window.a,
        window.a.type === "cut"
          ? Number(window.time >= window.cut)
          : window.progress,
        {
          matte,
          color: (c) => this.host.color.rgb(c),
          read: this.host.effectRead,
          params,
          time: this.host.time,
        },
      );
      const project = this.host.scene.children.find(
        (n) => n.name === "project",
      );
      if (
        project?.attributes.motionBlur === true &&
        window.a.motionBlur !== false &&
        !this.host.shutterSampling
      ) {
        const original = this.host.time;
        this.host.shutterSampling = true;
        try {
          result = shutter(original, this.host.fps, project.attributes, (t) => {
            this.host.time = t;
            const current = transitionWindows(node, t, this.host.runtime).find(
              (w) => w.node === window.node,
            );
            if (!current)
              throw new Error("transition disappeared during shutter");
            const read = (/** @type {Node|undefined} */ target) => {
              if (!target) return new Surface(this.width, this.height);
              const previous = this.host.handles;
              this.host.handles = new Set([
                ...previous,
                ...handles(target, this.host.runtime),
              ]);
              try {
                return new Compositor(this.host).render(target);
              } finally {
                this.host.handles = previous;
              }
            };
            return transitionFrame(
              read(window.from),
              read(window.to),
              current.a,
              current.a.type === "cut"
                ? Number(current.time >= current.cut)
                : current.progress,
              {
                matte,
                color: (c) => this.host.color.rgb(c),
                read: this.host.effectRead,
                params,
                time: t,
              },
            );
          });
        } finally {
          this.host.time = original;
          this.host.shutterSampling = false;
        }
      }
      this.applyMask(result, clip);
      composite(dst, result);
    }
    flush();
  }
  /** @param {Node} [target] */
  render(target) {
    const scale = this.host.scale,
      reframe = this.host.scene.reframe;
    /** @type {Matrix} */
    let root = [scale, 0, 0, scale, 0, 0];
    if (reframe) {
      const ratio =
        reframe.mode === "crop"
          ? Math.max(this.vw / reframe.width, this.vh / reframe.height)
          : Math.min(this.vw / reframe.width, this.vh / reframe.height);
      root = [
        scale * ratio,
        0,
        0,
        scale * ratio,
        (this.vw - reframe.width * ratio) * reframe.focusX * scale,
        (this.vh - reframe.height * ratio) * reframe.focusY * scale,
      ];
    }
    this.measure(
      this.host.composition,
      root,
      reframe?.width ?? this.vw,
      reframe?.height ?? this.vh,
    );
    const out = new Surface(this.width, this.height);
    out.bbox = EMPTY_RECT;
    if (target?.name === "adjustment") this.captureTarget = target;
    else if (target) {
      this.draw(target, out, null, new Set(), true);
      return out;
    }
    const project = this.host.scene.children.find((n) => n.name === "project");
    const background = String(project?.attributes.background ?? "#00000000");
    const p = paint(
      background,
      {
        paints: this.paints,
        tokens: this.host.tokens,
        attributes: (n) => this.attrs(n),
        image: (id) => this.image(id),
        scale,
      },
      this.vw,
      this.vh,
    );
    if (!background.startsWith("url(#")) {
      // One colour everywhere; blended onto zero it is stored unchanged.
      const c = this.host.color.a.ocioConfig
          ? p(0, 0)
          : this.host.color.rgb(p(0, 0)),
        a = Number(c[3]),
        r = Number(c[0]) * a,
        g = Number(c[1]) * a,
        b = Number(c[2]) * a,
        d = out.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = a;
      }
      out.bbox =
        a === 0 && r === 0 && g === 0 && b === 0 ? EMPTY_RECT : fullRect(this);
    } else {
      for (let y = 0; y < this.height; y++)
        for (let x = 0; x < this.width; x++) {
          const c = this.host.color.a.ocioConfig
              ? p(x / scale, y / scale)
              : this.host.color.rgb(p(x / scale, y / scale)),
            a = Number(c[3]);
          out.blend(
            (y * this.width + x) * 4,
            Number(c[0]) * a,
            Number(c[1]) * a,
            Number(c[2]) * a,
            a,
            1,
          );
        }
      out.bbox = fullRect(this);
    }
    if (this.host.color.a.ocioConfig)
      out.data.set(this.host.color.input(out).data);
    if (reframe?.mode === "fit-blur") {
      const bg = new Surface(this.width, this.height),
        ratio = Math.max(this.vw / reframe.width, this.vh / reframe.height);
      this.measure(
        this.host.composition,
        [
          scale * ratio,
          0,
          0,
          scale * ratio,
          (this.vw - reframe.width * ratio) * reframe.focusX * scale,
          (this.vh - reframe.height * ratio) * reframe.focusY * scale,
        ],
        reframe.width,
        reframe.height,
      );
      const previousMode = reframe.mode;
      reframe.mode = "crop";
      try {
        this.children(this.host.composition, bg, null, new Set());
      } finally {
        reframe.mode = previousMode;
      }
      for (let k = 0; k < 4; k++) {
        const channel = new Float32Array(this.width * this.height);
        for (let i = 0; i < channel.length; i++)
          channel[i] = Number(bg.data[i * 4 + k]);
        const blur = this.feather(channel, 12 * scale);
        for (let i = 0; i < channel.length; i++)
          bg.data[i * 4 + k] = Number(blur[i]);
      }
      bg.bbox = undefined;
      composite(out, bg);
      this.measure(this.host.composition, root, reframe.width, reframe.height);
    }
    if (
      this.host.cycles &&
      this.host.scene.children
        .find((n) => n.name === "lights")
        ?.children.some((n) => n.attributes.environmentVisible === true)
    ) {
      const previous = this.host.geometryFilter;
      this.host.geometryFilter = new Set();
      try {
        composite(out, geometryPass(this.host));
      } finally {
        this.host.geometryFilter = previous;
      }
    }

    this.children(this.host.composition, out, null, new Set());
    return this.capture ?? out;
  }
}
/** Use the existing scalar fast path only when no affine/vector/layout operation is needed. */
export function needsCompositor(/** @type {Node} */ scene) {
  const fields = new Set(
    "rotation scaleX scaleY anchorX anchorY parent matte alignX alignY alignTo margin skewX skewY cornerRadii innerRadius outerRadius innerRoundness outerRoundness dash dashOffset strokePosition paintOrder trimStart trimEnd trimOffset trimMode fit boxWidth boxHeight flipX flipY cropLeft cropRight cropTop cropBottom focusX focusY isolate collapse layout safeArea".split(
      " ",
    ),
  );
  const walk = (/** @type {Node} */ n) => {
    if (n.sourceBox || n.sourceClock || n.reframe) return true;
    if (
      [
        "paints",
        "safeAreas",
        "layouts",
        "symbols",
        "sequence",
        "instance",
        "include",
        "repeat",
        "adjustment",
        "shapeModifier",
      ].includes(n.name)
    )
      return true;
    if (
      n.name === "shape" &&
      !["rect", "rounded-rect"].includes(String(n.attributes.shape))
    )
      return true;
    if (n.name === "mask" || Number(n.attributes.strokeWidth ?? 0) > 0)
      return true;
    if (
      ["shape", "group"].includes(n.name) &&
      ["rotation", "anchorX", "anchorY", "scaleX", "scaleY"].some(
        (k) =>
          Number(n.attributes[k] ?? (k.startsWith("scale") ? 1 : 0)) !==
          (k.startsWith("scale") ? 1 : 0),
      )
    )
      return true;
    if (n.attributes.blend !== undefined && n.attributes.blend !== "normal")
      return true;
    for (const [k, v] of Object.entries(n.attributes)) {
      if (
        typeof v === "string" &&
        (/^-?[\d.]+(%|vw|vh|vmin|vmax)$/.test(v) || v.startsWith("url(#"))
      )
        return true;
      if (["rotation", "scaleX", "scaleY", "anchorX", "anchorY"].includes(k))
        continue;
      if ((k === "focusX" || k === "focusY") && v === 0.5) continue;
      if (
        fields.has(k) &&
        v !== undefined &&
        v !== false &&
        v !== 0 &&
        v !== "none" &&
        v !== "center" &&
        v !== "fill-stroke" &&
        v !== "parent" &&
        v !== "simultaneous" &&
        !(k === "trimEnd" && v === 1)
      )
        return true;
    }
    if (
      ["animate", "expression", "link"].includes(n.name) &&
      fields.has(String(n.attributes.property))
    )
      return true;
    return n.children.some(walk);
  };
  return walk(scene);
}
