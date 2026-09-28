import { checkAnchorMode } from "./compatibility.js";
import { SurfaceCache } from "./cache.js";
/**
 * Scene walk for one instant: evaluates animated properties, orders children by
 * z, and draws groups (offset, clip, opacity), rectangles, image and text layers.
 * Features the renderer does not implement yet are collected once as
 * `unsupported`, never silently ignored.
 */
import { prepareCaptions } from "./captions.js";
import { captionPainter } from "./caption-render.js";
import { Tracking } from "./dynamics/tracking.js";
import { Constraints } from "./dynamics/constraints.js";
import { Physics } from "./dynamics/physics.js";
import { needsCycles, cyclesInfo } from "./three/native.js";
import { posix } from "node:path";
import { ColorPipeline } from "./color-management.js";
import { materialXResources } from "./three/materialx.js";
import { resources, nativeInfo } from "./fx/native.js";
import { processEffect } from "./fx/processor.js";
import { Compositor, needsCompositor } from "./compositor.js";
import { add } from "../eval/value.js";
import opentype from "opentype.js";
import { parseColor } from "./color.js";
import { decodePng } from "./image.js";
import { Surface, clampRect } from "./surface.js";
import { renderText } from "./text.js";
import { drawRotated, ellipseMask, rain } from "./effects.js";

/** @typedef {import('../xsd/validate.js').ValidNode} SceneNode */
/** @typedef {import('./surface.js').Rect} Rect */

/**
 * @typedef {object} AssetIo
 * @property {(src:string)=>string} [path]
 * @property {'pivot'|'position'} [anchorMode]
 * @property {Map<string,any>} [meshes]
 * @property {Map<string,{src:string,sha256:string}[]>} [meshDependencies]
 * @property {(src: string) => Uint8Array} read file bytes by scene-relative path
 * @property {(asset:SceneNode,host:FrameRenderer,layer?:SceneNode)=>Surface} [media]
 * @property {(asset:SceneNode)=>{width:number,height:number}|undefined} [dimensions]
 */

/** Seeds are xs:unsignedLong (bigint); the hash consumes their low 32 bits. @param {unknown} v */
export function seed32(v) {
  if (typeof v === "bigint") return Number(BigInt.asUintN(32, v));
  return typeof v === "number" ? v >>> 0 : 0;
}

export class FrameRenderer {
  /**
   * @param {SceneNode} scene
   * @param {Map<string, import('../eval/track.js').Track[]>} tracks
   * @param {AssetIo} io
   * @param {number} scale output scale relative to the project size
   * @param {ReturnType<import('../eval/runtime.js').compileRuntime>} [runtime]
   */
  constructor(scene, tracks, io, scale, runtime) {
    checkAnchorMode(scene, io.anchorMode);
    this.scene = scene;
    this.anchorMode = io.anchorMode ?? "pivot";
    this.suppressText = false;
    this.captureContrast = false;
    /** @type {Array<{id:string,pixels:number[]}>} */ this.contrastChecks = [];
    /** @type {Record<string,any>} */ this.captionOutput = {};

    /** @type {Set<SceneNode>|undefined} */ this.geometryFilter = undefined;
    /** @type {Set<string>} */ this.geometryExcluded = new Set();
    this.runtime = runtime;
    this.tracks = tracks;
    this.io = io;
    /** @type {Map<string,Uint8Array>} */ this.effectFiles = new Map();
    const collect = (/** @type {SceneNode} */ n) => {
      const src =
        n.name === "effect" || n.name === "look"
          ? n.attributes.src
          : n.name === "transition"
            ? n.attributes.shader
            : n.name === "colorManagement"
              ? n.attributes.ocioConfig
              : undefined;
      if (src) resources(String(src), io.read, this.effectFiles);
      if (n.name === "object3D" && n.attributes.font) {
        const font = scene.children
          .find((c) => c.name === "assets")
          ?.children.find(
            (c) =>
              c.name === "font" &&
              (c.attributes.id === n.attributes.font ||
                c.attributes.family === n.attributes.font),
          );
        resources(
          String(font?.attributes.src ?? n.attributes.font),
          io.read,
          this.effectFiles,
        );
      }
      if (n.name === "trackData")
        resources(String(n.attributes.src), io.read, this.effectFiles);
      if (n.name === "skeleton" && n.attributes.weights)
        resources(String(n.attributes.weights), io.read, this.effectFiles);
      if (n.name === "material" && n.attributes.materialX)
        materialXResources(
          String(n.attributes.materialX),
          io.read,
          this.effectFiles,
        );
      if (n.name === "material")
        for (const key of [
          "baseColorMap",
          "normalMap",
          "metallicRoughnessMap",
          "occlusionMap",
          "emissiveMap",
          "displacementMap",
          "materialX",
        ])
          if (n.attributes[key])
            resources(String(n.attributes[key]), io.read, this.effectFiles);
      if (n.name === "light")
        for (const key of ["ies", "environment"])
          if (n.attributes[key])
            resources(String(n.attributes[key]), io.read, this.effectFiles);
      if (n.name === "physics" && n.attributes.cache)
        resources(String(n.attributes.cache), io.read, this.effectFiles);
      for (const c of n.children) collect(c);
    };
    collect(scene);
    const usesShader = (/** @type {SceneNode} */ n) =>
      n.attributes.type === "shader" || n.children.some(usesShader);
    const usesNative = (/** @type {SceneNode} */ n) =>
      ["lut", "shader"].includes(String(n.attributes.type)) ||
      ["agx", "filmic", "aces2"].includes(
        String(n.attributes.toneMapping ?? n.attributes.tonemapper),
      ) ||
      n.attributes.ocioConfig !== undefined ||
      (n.name === "look" && n.attributes.src !== undefined) ||
      n.children.some(usesNative);
    this.cycles = needsCycles(scene);
    this.nativeInfo = {
      ...(usesNative(scene) ? nativeInfo(usesShader(scene)) : {}),
      ...(this.cycles ? cyclesInfo() : {}),
    };
    this.effectRead = (/** @type {string} */ src) =>
      this.effectFiles.get(posix.normalize(src)) ?? io.read(src);
    this.color = new ColorPipeline(scene, this.effectRead);
    this.scale = scale;
    /** current time in seconds */
    this.time = 0;
    /** @type {Map<SceneNode,Record<string,any>>} */ this.nodeOverrides =
      new Map();
    this.inTexture = false;
    /** @type {Map<SceneNode,number>} */ this.sampleTimes = new Map();
    /** @type {Set<SceneNode>} */ this.handles = new Set();
    this.shutterSampling = false;
    const project = /** @type {SceneNode} */ (
      scene.children.find((c) => c.name === "project")
    );
    const panorama =
      project.attributes.mode === "viewport"
        ? undefined
        : scene.children.find((n) => n.name === "scene360")?.attributes;
    this.width = Math.round(
      Number(panorama?.width ?? project.attributes.width) * scale,
    );
    this.height = Math.round(
      Number(panorama?.height ?? project.attributes.height) * scale,
    );
    this.duration = /** @type {number} */ (project.attributes.duration);
    this.background = String(project.attributes.background).startsWith("url(")
      ? [0, 0, 0, 0]
      : parseColor(String(project.attributes.background));
    /** @type {Map<string, SceneNode>} */
    this.assets = new Map();
    /** @type {Map<string, string>} */
    this.tokens = new Map();
    /** @type {Map<string, SceneNode>} */
    this.styles = new Map();
    /** @type {Map<string, SceneNode>} */
    this.effects = new Map();
    this.fps = (() => {
      const [n, d] = String(project.attributes.fps).split("/").map(Number);
      return /** @type {number} */ (n) / (d ?? 1);
    })();
    for (const section of scene.children) {
      if (section.name === "assets")
        for (const a of section.children)
          this.assets.set(String(a.attributes.id), a);
      if (section.name === "effects")
        for (const e of section.children)
          this.effects.set(String(e.attributes.id), e);
      if (section.name === "styles") {
        for (const s of section.children) {
          if (s.name === "token")
            this.tokens.set(
              String(s.attributes.name),
              String(s.attributes.value),
            );
          else this.styles.set(String(s.attributes.id), s);
        }
      }
    }
    /** @type {Map<string, Surface>} */
    this.cache = new SurfaceCache();
    /** @type {Map<string,import("./three/geometry.js").Geometry>} */ this.geometryCache =
      new Map();
    /** @type {Map<string, opentype.Font>} */
    this.fonts = new Map();
    /** @type {Set<string>} */
    this.unsupported = new Set();
    /** @type {Set<string>} */ this.warnings = new Set();
    /** @type {Map<string,number>} */ this.baselines = new Map();
    this.useCompositor =
      !!io.media || needsCompositor(scene) || this.effects.size > 0;
    /** @type {Map<SceneNode,string>} */ this.effectStops = new Map();
    /** Post-effect layers of the previous frames, reused while their inputs hold.
     * `SCENE_RENDER_LAYER_CACHE=0` disables it (for A/B verification).
     * @type {Map<SceneNode,Map<string,{frame:number,rect:import('./surface.js').Rect,pixels:Float32Array<ArrayBufferLike>,bbox:import('./surface.js').Rect|undefined,finite:boolean|undefined,masks:Array<{id:string,pixels:number[]}>|undefined}>>|undefined} */
    this.layerCache =
      process.env.SCENE_RENDER_LAYER_CACHE === "0" ? undefined : new Map();
    this.layerFrame = 0;
    /** Set while renderDeferred composites: the compositor leaves a final
     * full-frame adjustment to the GPU tail. */
    this.deferTail = false;
    /** @type {Map<SceneNode,boolean>} */ this.cacheableNodes = new Map();
    /** @type {Map<SceneNode,boolean>} */ this.textNodes = new Map();
    const needsTemporal = (/** @type {SceneNode} */ n) =>
      ["deform", "particleEmitter", "transformConstraint", "tracking"].includes(
        n.name,
      ) ||
      n.name === "transition" ||
      n.attributes.property === "motionBlur" ||
      n.attributes.motionBlur === "on" ||
      n.attributes.motionBlur === true ||
      n.children.some(needsTemporal);
    this.useCompositor ||=
      scene.children.some(
        (n) => n.name === "cameras" || n.name === "materials",
      ) ||
      needsTemporal(scene) ||
      this.color.enabled;
    this.composition = /** @type {SceneNode} */ (
      scene.children.find((c) => c.name === "composition")
    );
    this.tracking = new Tracking(scene, this.effectRead, this.fps);
    this.constraints = new Constraints(
      scene,
      (n, t) => this.rawAttributes(n, t),
      this.tracking,
      (n, t) =>
        this.runtime?.timeline.spans.get(n)?.local(t) ??
        t - Number(n.attributes.start ?? 0),
    );
    /** @type {Physics|undefined} */ this.physics = undefined;
    const needsPhysics = (/** @type {SceneNode} */ n) =>
      ["rigidBody", "softBody"].includes(n.name) ||
      n.children.some(needsPhysics);
    if (needsPhysics(scene))
      this.physics = new Physics(
        scene,
        (n, t) => this.constraints.attributes(n, t),
        (n) => {
          const a = this.rawAttributes(n, 0),
            asset = this.assets.get(String(a.asset)),
            d = asset ? this.io.dimensions?.(asset) : undefined;
          return {
            width: Number(
              a.width ?? a.boxWidth ?? d?.width ?? asset?.attributes.width ?? 1,
            ),
            height: Number(
              a.height ??
                a.boxHeight ??
                d?.height ??
                asset?.attributes.height ??
                1,
            ),
          };
        },
        this.effectRead,
        (n) => {
          const asset = this.assets.get(String(n.attributes.asset));
          if (!asset) throw new Error("convex-hull body needs an image asset");
          return this.io.media
            ? this.io.media(asset, this, n)
            : this.image(asset);
        },
      );
    this.captionTracks = prepareCaptions(
      scene,
      (src) => {
        const data = this.effectRead(src);
        this.effectFiles.set(src, data);
        return data;
      },
      io.path,
    );
    this.paintCaption = this.captionTracks.length
      ? captionPainter(this)
      : undefined;
    this.useCompositor ||=
      !!this.physics ||
      this.cycles ||
      this.captionTracks.some((t) => t.attributes.mode !== "sidecar");
  }

  /** Record core glyph pixels after layout, deformation, effects and clipping.
   * @param {Surface} mask @param {string} id */
  recordTextMask(mask, id) {
    // Only the zero-region hint can hold ink; rows are scanned in the same
    // order as a full scan, so the pixel list is unchanged.
    const r = mask.bbox
        ? clampRect(mask.bbox, mask.width, mask.height)
        : { x0: 0, y0: 0, x1: mask.width, y1: mask.height },
      d = mask.data;
    let maximum = 0;
    for (let y = r.y0; y < r.y1; y++)
      for (
        let i = (y * mask.width + r.x0) * 4 + 3,
          end = (y * mask.width + r.x1) * 4;
        i < end;
        i += 4
      )
        maximum = Math.max(maximum, Number(d[i]));
    if (maximum <= 0) return;
    const pixels = [];
    for (let y = r.y0; y < r.y1; y++)
      for (
        let i = (y * mask.width + r.x0) * 4 + 3,
          end = (y * mask.width + r.x1) * 4;
        i < end;
        i += 4
      )
        if (Number(d[i]) >= maximum * 0.95) pixels.push(i - 3);
    this.contrastChecks.push({ id, pixels });
  }

  /** @param {SceneNode} node @param {number} [time] @returns {Record<string,any>} */
  rawAttributes(node, time = this.time) {
    time = this.sampleTimes.get(node) ?? time;
    return this.runtime
      ? this.runtime.attributes(node, time)
      : Object.fromEntries(
          Object.keys(node.attributes).map((k) => [k, this.value(node, k)]),
        );
  }
  /** @param {SceneNode} node @returns {Record<string,any>} */
  attributes(node) {
    return {
      ...this.constraints.attributes(
        node,
        this.sampleTimes.get(node) ?? this.time,
      ),
      ...this.physics?.renderPose(node, this.time),
      ...this.nodeOverrides.get(node),
    };
  }
  /** @param {SceneNode} node @param {string} prop */
  value(node, prop) {
    if (this.runtime) return this.runtime.value(node, prop, this.time);
    let result = node.attributes[prop];
    for (const t of this.tracks.get(String(node.attributes.id ?? node.path)) ??
      [])
      if (t.property === prop)
        result = t.additive
          ? add(result ?? 0, t.valueAt(this.time))
          : t.valueAt(this.time);
    return result;
  }

  /** @param {SceneNode} node @param {string} prop @param {number} fallback */
  num(node, prop, fallback) {
    const v = this.value(node, prop);
    if (v === undefined) return fallback;
    if (typeof v !== "number") {
      this.unsupported.add(
        `${node.name}/@${prop}="${String(v)}" (relative lengths)`,
      );
      return fallback;
    }
    return v;
  }

  /** @param {SceneNode} node */
  active(node) {
    if (this.runtime)
      return this.runtime.enabled(node, this.time, this.handles.has(node));
    const start =
      typeof node.attributes.start === "number" ? node.attributes.start : 0;
    const end =
      typeof node.attributes.end === "number"
        ? node.attributes.end
        : this.duration;
    return (
      (this.handles.has(node) || (this.time >= start && this.time < end)) &&
      node.attributes.visible !== false
    );
  }

  /** @param {number} t seconds on the composition timeline @returns {Surface} */
  render(t) {
    this.time = t;
    // Layer states unused for half a second are unlikely to recur soon.
    this.layerFrame++;
    if (this.layerCache)
      for (const [node, variants] of this.layerCache) {
        for (const [key, entry] of variants)
          if (entry.frame < this.layerFrame - 12) variants.delete(key);
        if (!variants.size) this.layerCache.delete(node);
      }
    if (this.useCompositor)
      return this.color.finish(new Compositor(this).render());
    const out = new Surface(this.width, this.height);
    out.fillRect(
      0,
      0,
      this.width,
      this.height,
      /** @type {import('./color.js').Rgba} */ (this.background),
      out.bounds(),
    );
    this.children(this.composition, out, 0, 0, out.bounds());
    return out;
  }

  /**
   * The frame at `t` up to its GPU tail: the composited surface before a final
   * full-frame adjustment of point operations (`tail`, empty when there is
   * none) and before the display finish. Undefined when the frame needs the
   * CPU path (no compositor, or a colour pipeline the GPU tail cannot finish).
   * @param {number} t @param {boolean} preserveAlpha
   * @returns {{surface: Surface, tail: import('./gpu.js').TailOp[], plan: import('./gpu.js').GpuPlan}|undefined}
   */
  renderDeferred(t, preserveAlpha) {
    const plan = this.color.gpuPlan(preserveAlpha);
    if (!this.useCompositor || !plan) return undefined;
    this.time = t;
    this.layerFrame++;
    if (this.layerCache)
      for (const [node, variants] of this.layerCache) {
        for (const [key, entry] of variants)
          if (entry.frame < this.layerFrame - 12) variants.delete(key);
        if (!variants.size) this.layerCache.delete(node);
      }
    this.deferTail = true;
    try {
      const compositor = new Compositor(this),
        surface = compositor.render();
      return { surface, tail: compositor.tail ?? [], plan };
    } finally {
      this.deferTail = false;
    }
  }

  /**
   * @param {SceneNode} parent @param {Surface} dst @param {number} ox @param {number} oy origin in project px
   * @param {Rect} clip in destination px
   */
  children(parent, dst, ox, oy, clip) {
    const kids = parent.children
      .map((c, i) => ({ c, i, z: Number(this.value(c, "z") ?? 0) }))
      .sort((a, b) => a.z - b.z || a.i - b.i);
    for (const { c } of kids) {
      if (
        ["animate", "key", "expression", "link", "motionPath"].includes(c.name)
      )
        continue;
      if (!this.active(c)) continue;
      if (c.name === "group") this.group(c, dst, ox, oy, clip);
      else if (c.name === "shape") this.shape(c, dst, ox, oy, clip);
      else if (c.name === "layer") this.layer(c, dst, ox, oy, clip);
      else if (c.name === "particleEmitter")
        this.particles(c, dst, ox, oy, clip);
      else if (c.name !== "mask") this.unsupported.add(`<${c.name}>`);
    }
  }

  /** @param {SceneNode} g @param {Surface} dst @param {number} ox @param {number} oy @param {Rect} clip */
  group(g, dst, ox, oy, clip) {
    for (const [prop, initial] of /** @type {Array<[string, number]>} */ ([
      ["scaleX", 1],
      ["scaleY", 1],
      ["rotation", 0],
      ["anchorX", 0],
      ["anchorY", 0],
      ["skewX", 0],
      ["skewY", 0],
    ])) {
      if (this.num(g, prop, initial) !== initial)
        this.unsupported.add(`group/@${prop} is not implemented`);
    }
    const s = this.scale;
    const x = ox + this.num(g, "x", 0);
    const y = oy + this.num(g, "y", 0);
    let inner = clip;
    if (
      this.value(g, "clip") === true &&
      typeof this.value(g, "width") === "number" &&
      typeof this.value(g, "height") === "number"
    ) {
      inner = {
        x0: Math.max(clip.x0, Math.round(x * s)),
        y0: Math.max(clip.y0, Math.round(y * s)),
        x1: Math.min(clip.x1, Math.round((x + this.num(g, "width", 0)) * s)),
        y1: Math.min(clip.y1, Math.round((y + this.num(g, "height", 0)) * s)),
      };
      if (inner.x0 >= inner.x1 || inner.y0 >= inner.y1) return;
    }
    const fx = Array.isArray(g.attributes.effects)
      ? g.attributes.effects.map(String)
      : [];
    const masks = g.children.filter((c) => c.name === "mask");
    const opacity = this.num(g, "opacity", 1);
    if (opacity >= 1 && !fx.length && !masks.length) {
      this.children(g, dst, x, y, inner);
      return;
    }
    const layer = new Surface(dst.width, dst.height);
    this.children(g, layer, x, y, inner);
    for (const m of masks) this.mask(m, layer, x, y, inner);
    this.applyEffects(fx, layer, inner);
    dst.drawSurface(layer, 0, 0, 1, 1, opacity, inner);
  }

  /** @param {SceneNode} m @param {Surface} layer @param {number} ox @param {number} oy @param {Rect} clip */
  mask(m, layer, ox, oy, clip) {
    const s = this.scale;
    const a = this.runtime
      ? this.runtime.attributes(m, this.time)
      : m.attributes;
    if (
      a.type !== "ellipse" ||
      (a.mode ?? "intersect") !== "intersect" ||
      a.expansion
    ) {
      this.unsupported.add(
        `mask type="${String(a.type)}" mode="${String(a.mode)}"`,
      );
      return;
    }
    const w = this.num(m, "width", 0);
    const h = this.num(m, "height", 0);
    ellipseMask(layer, clip, {
      cx: (ox + this.num(m, "x", 0) + w / 2) * s,
      cy: (oy + this.num(m, "y", 0) + h / 2) * s,
      rx: (w / 2) * s,
      ry: (h / 2) * s,
      feather: this.num(m, "feather", 0) * s,
      invert: a.invert === true,
    });
  }

  /** @param {string[]} ids @param {Surface} layer @param {Rect} clip * @param {Partial<import('./fx/processor.js').Context>} [context]
   */
  applyEffects(ids, layer, clip, context = {}) {
    for (const id of ids) {
      const e = this.effects.get(id);
      if (!e) throw new Error(`Unknown effect ${id}`);
      const a = this.runtime
        ? this.runtime.attributes(e, this.time)
        : Object.fromEntries(
            Object.keys(e.attributes).map((k) => [k, this.value(e, k)]),
          );
      const out = processEffect(layer, a, {
        scale: this.scale,
        time: this.time,
        frame: Math.round(this.time * this.fps),
        fps: this.fps,
        read: this.effectRead,
        workingSpace: this.color.working,
        color: (c) => this.color.rgb(c),
        parseColor: (value) => parseColor(value, this.tokens),
        ...context,
      });
      if (
        clip.x0 <= 0 &&
        clip.y0 <= 0 &&
        clip.x1 >= layer.width &&
        clip.y1 >= layer.height
      ) {
        // The effect's output buffer replaces the layer's: nothing else holds it.
        layer.data = out.data;
        layer.bbox = out.bbox;
      } else {
        for (let y = clip.y0; y < clip.y1; y++) {
          const end = (y * layer.width + clip.x1) * 4;
          for (let i = (y * layer.width + clip.x0) * 4; i < end; i++)
            layer.data[i] = /** @type {number} */ (out.data[i]);
        }
        layer.bbox = undefined;
      }
    }
  }

  /** @param {SceneNode} e @param {Surface} dst @param {number} ox @param {number} oy @param {Rect} clip */
  particles(e, dst, ox, oy, clip) {
    const a = this.runtime
      ? this.runtime.attributes(e, this.time)
      : e.attributes;
    if (a.preset !== "rain" || (a.shape ?? "streak") !== "streak") {
      this.unsupported.add(`particleEmitter preset="${String(a.preset)}"`);
      return;
    }
    const n = (/** @type {string} */ k, /** @type {number} */ d) =>
      this.num(e, k, d);
    rain(
      dst,
      clip,
      {
        x: ox + n("x", 0),
        y: oy + n("y", 0),
        width: n("emitterWidth", 0),
        height: n("emitterHeight", 0),
        rate: n("rate", 10),
        lifetime: n("lifetime", 1),
        speed: n("speed", 100),
        direction: n("direction", 90),
        spread: n("spread", 0),
        size: n("size", 1),
        trail: n("trail", 0),
        color: parseColor(String(a.color ?? "#FFFFFF"), this.tokens),
        seed: seed32(a.seed),
        start: typeof a.start === "number" ? a.start : 0,
        preroll: n("preroll", 0),
        maxParticles: n("maxParticles", 1000),
      },
      this.time,
      this.scale,
    );
  }

  /** @param {SceneNode} n @param {Surface} dst @param {number} ox @param {number} oy @param {Rect} clip */
  shape(n, dst, ox, oy, clip) {
    const s = this.scale;
    const kind = this.value(n, "shape");
    const x = (ox + this.num(n, "x", 0)) * s;
    const y = (oy + this.num(n, "y", 0)) * s;
    const w = this.num(n, "width", 0) * s;
    const h = this.num(n, "height", 0) * s;
    const opacity = this.num(n, "opacity", 1);
    /** @param {string} p @returns {import('./color.js').Rgba | null} */
    const paint = (p) => {
      const v = this.value(n, p);
      if (typeof v !== "string") return null;
      if (v.startsWith("url(")) {
        this.unsupported.add("gradient and pattern paints");
        return null;
      }
      const c = parseColor(v, this.tokens);
      return [c[0], c[1], c[2], c[3] * opacity];
    };
    const fill = paint("fill");
    const stroke = paint("stroke");
    const sw = this.num(n, "strokeWidth", 0) * s;
    const fx = Array.isArray(n.attributes.effects)
      ? n.attributes.effects.map(String)
      : [];
    if (fx.length) {
      const layer = new Surface(dst.width, dst.height);
      this.shape(
        { ...n, attributes: { ...n.attributes, effects: [] } },
        layer,
        ox,
        oy,
        clip,
      );
      this.applyEffects(fx, layer, clip);
      dst.drawSurface(layer, 0, 0, 1, 1, 1, clip);
      return;
    }
    if (kind === "rect") {
      if (fill) dst.fillRect(x, y, w, h, fill, clip);
      if (stroke && sw > 0) dst.strokeRect(x, y, w, h, sw, stroke, clip);
    } else if (kind === "rounded-rect") {
      dst.roundedRect(
        x,
        y,
        w,
        h,
        this.num(n, "radius", 0) * s,
        fill,
        stroke,
        sw,
        clip,
      );
    } else this.unsupported.add(`shape="${String(kind)}"`);
  }

  /** @param {SceneNode} n @param {Surface} dst @param {number} ox @param {number} oy @param {Rect} clip */
  layer(n, dst, ox, oy, clip) {
    const s = this.scale;
    const asset = this.assets.get(String(this.value(n, "asset")));
    if (!asset) return;
    const src =
      asset.name === "image"
        ? this.image(asset)
        : asset.name === "text"
          ? this.text(asset)
          : null;
    if (!src) {
      this.unsupported.add(`<${asset.name}> assets`);
      return;
    }
    const sx = this.num(n, "scaleX", 1);
    const sy = this.num(n, "scaleY", 1);
    const ax = this.num(n, "anchorX", 0);
    const ay = this.num(n, "anchorY", 0);
    const deg = this.num(n, "rotation", 0);
    if (deg !== 0) {
      drawRotated(
        dst,
        src,
        {
          px: ax * s,
          py: ay * s,
          dx: (ox + this.num(n, "x", 0) + ax) * s,
          dy: (oy + this.num(n, "y", 0) + ay) * s,
          sx,
          sy,
          deg,
          opacity: this.num(n, "opacity", 1),
        },
        clip,
      );
      return;
    }
    const x = ox + this.num(n, "x", 0) + ax * (1 - sx);
    const y = oy + this.num(n, "y", 0) + ay * (1 - sy);
    dst.drawSurface(src, x * s, y * s, sx, sy, this.num(n, "opacity", 1), clip);
  }

  /** @param {SceneNode} asset */
  image(asset) {
    if (this.io.media) return this.io.media(asset, this);
    const id = String(asset.attributes.id);
    let img = this.cache.get(id);
    if (!img) {
      img = decodePng(this.io.read(String(asset.attributes.src)), this.scale);
      this.cache.set(id, img);
    }
    return img;
  }

  /** @param {SceneNode} asset */
  text(asset) {
    if (this.io.media) return this.io.media(asset, this);
    const a = this.runtime
      ? this.runtime.attributes(asset, this.time)
      : asset.attributes;
    const style =
      typeof a.style === "string" ? this.styles.get(a.style) : undefined;
    const styleAttrs =
      style && this.runtime
        ? this.runtime.attributes(style, this.time)
        : style?.attributes;
    const id =
      String(asset.attributes.id) +
      JSON.stringify({ a, styleAttrs }, (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      );
    const hit = this.cache.get(id);
    if (hit) return hit;
    const pick = (/** @type {string} */ k) => a[k] ?? styleAttrs?.[k];
    const fontId = String(pick("fontAsset"));
    let font = this.fonts.get(fontId);
    if (!font) {
      const fa = /** @type {SceneNode} */ (this.assets.get(fontId));
      const bytes = this.io.read(String(fa.attributes.src));
      font = opentype.parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      this.fonts.set(fontId, font);
    }
    const size = Number(pick("size") ?? 48);
    const r = renderText(
      font,
      {
        text: String(a.text ?? ""),
        width: Number(a.width),
        height: Number(a.height),
        size,
        minSize: Number(a.minSize ?? size),
        maxSize: Number(a.maxSize ?? size),
        lineHeight: Number(pick("lineHeight") ?? 1.2),
        align: /** @type {any} */ (a.align ?? "left"),
        verticalAlign: /** @type {any} */ (a.verticalAlign ?? "top"),
        shrink: a.autoFit === "shrink",
      },
      parseColor(String(pick("color") ?? "#000000"), this.tokens),
      this.scale,
    );
    for (const old of this.cache.keys())
      if (old.startsWith(String(asset.attributes.id) + "{") && old !== id)
        this.cache.delete(old);
    this.cache.set(id, r.surface);
    this.baselines.set(String(asset.attributes.id), r.baseline);
    return r.surface;
  }
}
