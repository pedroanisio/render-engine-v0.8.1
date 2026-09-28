/** Preparation is asynchronous; frame sampling is synchronous and provider-free. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { assetPath, digest, sequenceFrames } from "./resolve.js";
import { decodeImage, probe, VideoDecoder, resizeSurface } from "./decode.js";
import { timecode } from "../eval/clock.js";
import { mediaTime, mediaRemap, fpsOf } from "./clock.js";
import { decodeAudio, audiogramSurface } from "./audio.js";
import { inlineSvg } from "./svg.js";
import { createTypography } from "./text.js";
import { SequenceCache } from "./sequence.js";
import { Surface } from "../render/surface.js";
import {
  svgSurface,
  vectorSurface,
  generatorSurface,
  chartSurface,
  codeSurface,
  formulaSurface,
} from "./special.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {import('../render/frame.js').FrameRenderer} Host */
/** @param {Node} scene @param {{base:string,available?:boolean}} options */
export async function prepareMedia(scene, { base, available = false }) {
  const assets =
    scene.children.find((n) => n.name === "assets")?.children ?? [];
  /** @type {Map<string,{src:string,sha256:string}[]>} */ const dependencies =
    new Map();
  /** @type {Array<Record<string,any>>} */ const manifest = [];
  /** @type {Map<string,(a:Record<string,any>,time:number,scale:number,host:Host,layer?:Node)=>Surface>} */ const samplers =
    new Map();
  /** @type {Map<string,any>} */ const meshes = new Map();
  /** @type {Array<()=>void>} */ const close = [];
  const imageCache = new SequenceCache({}, 256 * 1024 * 1024);
  /** @type {Map<string,{channels:number,sampleRate:number,duration:number}>} */ const audioInfo =
    new Map();
  /** @type {ReturnType<typeof createTypography>} */ let typography;
  /** @type {Map<string,{width:number,height:number}>} */ const dimensions =
    new Map();
  /** @type {Map<string,number>} */ const durations = new Map();
  /** @param {Node} node @param {string} src @param {string} [hash] */
  function read(node, src, hash) {
    const bytes = readFileSync(assetPath(base, src)),
      sha256 = digest(bytes);
    if (hash && sha256.toLowerCase() !== hash.toLowerCase())
      throw new Error(`${src}: SHA-256 mismatch`);
    const id = String(node.attributes.id ?? node.path);
    let list = dependencies.get(id);
    if (!list) {
      list = [];
      dependencies.set(id, list);
    }
    if (!list.some((d) => d.src === src)) list.push({ src, sha256 });
    return bytes;
  }
  /** @param {Record<string,any>} a @param {Record<string,any>} actual @param {string[]} keys */
  function metadata(a, actual, keys) {
    for (const key of keys) {
      if (a[key] === undefined) continue;
      const tolerance =
        key === "duration"
          ? Math.max(0.025, 1 / (a.fps ? fpsOf(a.fps).value : 48000))
          : 0;
      if (
        Math.abs(Number(a[key]) - Number(actual[key])) > tolerance ||
        !Number.isFinite(Number(actual[key]))
      )
        throw new Error(
          `${a.id}: ${key} declared ${a[key]}, found ${actual[key]}`,
        );
    }
  }
  try {
    for (const node of assets) {
      const a = { ...node.attributes },
        id = String(a.id),
        src = String(a.src ?? ""),
        width = Number(a.width),
        height = Number(a.height);
      manifest.push({
        id,
        kind: node.name,
        license: a.license,
        credit: a.credit,
        representation: node.selectedRepresentation,
        timecodeStart: a.timecodeStart,
        provider: a.provider,
        model: a.model,
        prompt: a.prompt,
        voice: a.voice,
        language: a.language,
        seed: a.seed === undefined ? undefined : String(a.seed),
        source: src || undefined,
      });
      if (
        src &&
        node.name !== "imageSequence" &&
        available &&
        !existsSync(assetPath(base, src, true))
      )
        continue;
      const bytes =
        src && node.name !== "imageSequence"
          ? read(
              node,
              src,
              a.sha256 === undefined ? undefined : String(a.sha256),
            )
          : undefined;
      const staticSurface = (/** @type {Surface} */ surface) =>
        samplers.set(id, (_a, _t, s) =>
          resizeSurface(
            surface,
            Math.max(
              1,
              Math.round((dimensions.get(id)?.width ?? surface.width) * s),
            ),
            Math.max(
              1,
              Math.round((dimensions.get(id)?.height ?? surface.height) * s),
            ),
          ),
        );
      if (node.name === "image") {
        const result = await decodeImage(
          /** @type {Uint8Array} */ (bytes),
          a,
          1,
          assetPath(base, src),
        );
        if (node.selectedRepresentation !== "proxy")
          metadata(a, result.metadata, ["width", "height"]);
        dimensions.set(
          id,
          node.logicalSize ?? {
            width: result.metadata.width,
            height: result.metadata.height,
          },
        );
        const naturalWidth = result.metadata.width,
          naturalHeight = result.metadata.height;
        const key = imageCache.add(
          assetPath(base, src),
          digest(/** @type {Uint8Array} */ (bytes)),
          result.surface,
          {
            ...a,
            width: result.metadata.width,
            height: result.metadata.height,
          },
        );
        samplers.set(id, (_a, _t, s, host) => {
          const cacheKey = "media:" + id + ":" + s,
            hit = host.cache.get(cacheKey);
          if (hit) return hit;
          const size = dimensions.get(id) ?? {
              width: naturalWidth,
              height: naturalHeight,
            },
            surface = resizeSurface(
              imageCache.frame(key),
              Math.round(size.width * s),
              Math.round(size.height * s),
            );
          host.cache.set(cacheKey, surface);
          return surface;
        });
      } else if (node.name === "video" || node.name === "audio") {
        const info = probe(assetPath(base, src)),
          stream = info.streams.find(
            (/** @type {any} */ s) =>
              s.codec_type === (node.name === "video" ? "video" : "audio"),
          );
        if (!stream) throw new Error(`${src}: missing ${node.name} stream`);
        if (a.fps === undefined && node.name === "video")
          a.fps = String(stream.avg_frame_rate);
        if (a.duration === undefined)
          a.duration = Number(stream.duration ?? info.format.duration);
        if (a.width === undefined && node.name === "video")
          a.width = Number(stream.width);
        if (a.height === undefined && node.name === "video")
          a.height = Number(stream.height);
        durations.set(id, Number(a.duration));
        const selectedAudio = info.streams.filter(
          (/** @type {any} */ stream) => stream.codec_type === "audio",
        )[Number(a.audioStream ?? 0)];
        if (selectedAudio)
          audioInfo.set(id, {
            channels: Number(selectedAudio.channels),
            sampleRate: Number(selectedAudio.sample_rate),
            duration: Number(selectedAudio.duration ?? info.format.duration),
          });
        if (
          !selectedAudio &&
          scene.children
            .find((n) => n.name === "audioMix")
            ?.children.some(
              (n) => n.name === "audioTrack" && n.attributes.asset === id,
            )
        )
          throw new Error(`${src}: missing selected audio stream`);
        const actual = {
          ...stream,
          sampleRate: stream.sample_rate,
          duration: Number(stream.duration ?? info.format.duration),
        };
        metadata(
          a,
          actual,
          node.name === "video"
            ? ["width", "height", "duration"]
            : ["duration", "sampleRate", "channels"],
        );
        if (node.name === "video") {
          if (!node.specifiedAttributes?.includes("rotation")) {
            const rotation =
              stream.side_data_list?.find(
                (/** @type {any} */ v) => v.rotation !== undefined,
              )?.rotation ?? stream.tags?.rotate;
            if (rotation !== undefined)
              a.rotation = ((Number(rotation) % 360) + 360) % 360;
          }
          if (
            !node.specifiedAttributes?.includes("pixelAspect") &&
            /^\d+:\d+$/.test(stream.sample_aspect_ratio ?? "")
          ) {
            const [n, d] = String(stream.sample_aspect_ratio)
              .split(":")
              .map(Number);
            if (n && d) a.pixelAspect = n / d;
          }
          if (a.timecodeStart !== undefined) {
            timecode(String(a.timecodeStart), fpsOf(a.fps).value);
            const actual = stream.tags?.timecode ?? info.format.tags?.timecode;
            if (actual && actual !== a.timecodeStart)
              throw new Error(`${src}: timecodeStart mismatch`);
          }

          const size = node.logicalSize ?? {
            width: Number(a.width) * Number(a.pixelAspect ?? 1),
            height: Number(a.height),
          };
          dimensions.set(
            id,
            Number(a.rotation ?? 0) % 180
              ? { width: size.height, height: size.width }
              : size,
          );
          const rate = fpsOf(stream.avg_frame_rate).value;
          if (Math.abs(rate - fpsOf(a.fps).value) > 1e-4)
            throw new Error(`${src}: FPS mismatch`);
          if (
            a.hasAudio &&
            !info.streams.filter(
              (/** @type {any} */ s) => s.codec_type === "audio",
            )[Number(a.audioStream ?? 0)]
          )
            throw new Error(`${src}: missing selected audio stream`);
          const decoder = new VideoDecoder(assetPath(base, src), a);
          samplers.set(id, (_a, t, s, _host, layer) =>
            decoder.frame(
              t,
              s,
              String(
                layer?.children.find((n) => n.name === "timeRemap")?.attributes
                  .frameBlend ??
                  layer?.attributes.frameBlend ??
                  "none",
              ),
            ),
          );
        }
        execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-xerror",
            "-i",
            assetPath(base, src),
            "-f",
            "null",
            "-",
          ],
          { maxBuffer: 4 << 20 },
        );
      } else if (node.name === "imageSequence") {
        const files = sequenceFrames(a),
          cache = new SequenceCache(a);
        /** @type {Array<string|Surface>} */
        const frames = [];
        /** @type {string|undefined} */
        let previous;
        for (const file of files) {
          const path = assetPath(base, file, true);
          if (!existsSync(path)) {
            if (a.missingFrame === "error" || a.missingFrame === undefined)
              throw new Error(`missing sequence frame ${file}`);
            if (a.missingFrame === "hold" && !previous)
              throw new Error(
                `cannot hold before first sequence frame: ${file}`,
              );
            const blank = new Surface(width, height);
            if (a.missingFrame === "black")
              for (let i = 3; i < blank.data.length; i += 4) blank.data[i] = 1;
            frames.push(
              a.missingFrame === "hold"
                ? /** @type {string} */ (previous)
                : blank,
            );
          } else {
            const decoded = await decodeImage(read(node, file), a, 1, path);
            metadata(a, decoded.metadata, ["width", "height"]);
            previous = cache.add(
              path,
              digest(readFileSync(path)),
              decoded.surface,
            );
            frames.push(previous);
          }
        }
        if (a.sha256) {
          const actual = digest(
            new TextEncoder().encode(
              JSON.stringify(dependencies.get(id) ?? []),
            ),
          );
          if (actual !== a.sha256)
            throw new Error(`${id}: sequence manifest SHA-256 mismatch`);
        }
        samplers.set(id, (_a, t, s) => {
          const frame =
            frames[
              Math.min(frames.length - 1, Math.floor(t * fpsOf(a.fps).value))
            ];
          return resizeSurface(
            typeof frame === "string"
              ? cache.frame(frame)
              : /** @type {Surface} */ (frame),
            Math.max(1, Math.round(width * s)),
            Math.max(1, Math.round(height * s)),
          );
        });
      } else if (node.name === "vector" && a.shape === "svg")
        staticSurface(
          svgSurface(
            inlineSvg(new TextDecoder().decode(bytes), src, (p) =>
              read(node, p),
            ),
            width,
            height,
          ),
        );
      else if (node.name === "vector")
        samplers.set(id, (at, _t, s, host) => vectorSurface(at, s, env(host)));
      else if (node.name === "generator")
        samplers.set(id, (at, _t, s, host) =>
          generatorSurface(at, s, env(host)),
        );
      else if (node.name === "code") staticSurface(codeSurface(a, 1));
      else if (node.name === "formula")
        samplers.set(id, (at, _t, s, host) => formulaSurface(at, s, env(host)));
      else if (node.name === "chart") {
        const series = bytes
          ? JSON.parse(new TextDecoder().decode(bytes))
          : node.children
              .filter((c) => c.name === "series")
              .map((c) => c.attributes);
        if (
          !Array.isArray(series) ||
          series.some(
            (s) =>
              !Array.isArray(s.values) ||
              !s.values.every((/** @type {unknown} */ v) =>
                Number.isFinite(Number(v)),
              ),
          )
        )
          throw new Error(`${id}: chart requires series with numeric values`);
        samplers.set(id, (at, _t, s, host) =>
          chartSurface(
            at,
            series,
            s,
            typography.canvasStyle(node, String(at.textStyle)),
            env(host),
          ),
        );
      } else if (node.name === "lottie") {
        const { loadLottie } = await import("./lottie.js");
        const player = await loadLottie(
          /** @type {Uint8Array} */ (bytes),
          a,
          (p) => read(node, join(dirname(src), p)),
        );
        close.push(player.close);
        durations.set(id, player.duration);
        const slots = Object.fromEntries(
          node.children
            .filter((c) => c.name === "slot")
            .map((c) => [
              String(c.attributes.id),
              JSON.parse(String(c.attributes.value)),
            ]),
        );
        samplers.set(id, (_a, t, s) =>
          resizeSurface(
            player.frame(t % player.duration, slots),
            Math.round(width * s),
            Math.round(height * s),
          ),
        );
      } else if (node.name === "mesh") {
        const { importMesh } = await import("./mesh.js");
        meshes.set(
          id,
          await importMesh(
            src,
            /** @type {Uint8Array} */ (bytes),
            (p) => read(node, p),
            assetPath(base, src),
            a.format === undefined ? undefined : String(a.format),
          ),
        );
      }
    }
    for (const node of assets)
      if (node.name === "audiogram") {
        const source = String(node.attributes.source),
          track = scene.children
            .find((n) => n.name === "audioMix")
            ?.children.find((n) => n.attributes.id === source),
          asset = assets.find(
            (n) => n.attributes.id === (track?.attributes.asset ?? source),
          );
        if (!asset) throw new Error(`unknown audiogram source ${source}`);
        const pcm = decodeAudio(
          assetPath(base, String(asset.attributes.src)),
          Number(asset.attributes.audioStream ?? 0),
        );
        samplers.set(String(node.attributes.id), (a, t, s, host) => {
          const placed = track
              ? (host.runtime?.timeline.spans.get(track)?.start ??
                Number(track.attributes.start ?? 0))
              : 0,
            sourceTime = t - placed + Number(track?.attributes.clipIn ?? 0);
          const outside =
            track &&
            (t < placed ||
              sourceTime >= Number(track.attributes.clipOut ?? Infinity));
          return audiogramSurface(
            pcm,
            a,
            outside ? -1 : sourceTime,
            s,
            env(host),
          );
        });
      }
    typography = createTypography(
      scene,
      (node, src) => read(node, src),
      (node, path, bytes) => {
        const id = String(node.attributes.id),
          files = dependencies.get(id) ?? [];
        files.push({ src: "system-font:" + path, sha256: digest(bytes) });
        dependencies.set(id, files);
      },
    );
    for (const node of assets)
      if (node.name === "chart")
        typography.canvasStyle(node, String(node.attributes.textStyle));
    /** @type {Map<string,number>} */ const textBaselines = new Map();
    for (const node of assets)
      if (node.name === "text")
        samplers.set(String(node.attributes.id), (at, _t, s, host, layer) => {
          const id = String(node.attributes.id),
            changes = Object.fromEntries(
              Object.entries(at).filter(([k, v]) => v !== node.attributes[k]),
            );
          // A static text render depends only on the asset, its animated
          // attribute values, the scale and the placing layer: reuse it.
          const key =
            "text:" +
            id +
            ":" +
            s +
            ":" +
            (layer ? String(layer.attributes.id ?? layer.path ?? "") : "") +
            ":" +
            JSON.stringify(changes, (_k, v) =>
              typeof v === "bigint" ? String(v) : v,
            );
          const hit = host.cache.get(key);
          if (hit) {
            host.baselines.set(
              id,
              /** @type {number} */ (textBaselines.get(key)),
            );
            return hit;
          }
          const rendered = typography.render(
            node,
            s,
            changes,
            layer,
            host,
            env(host),
          );
          host.baselines.set(id, rendered.baseline);
          if (!rendered.dynamic) {
            host.cache.set(key, rendered.surface);
            textBaselines.set(key, rendered.baseline);
          }
          return rendered.surface;
        });
  } catch (e) {
    for (const release of close) release();
    throw e;
  }
  /** @param {Host} host @returns {Parameters<typeof vectorSurface>[2]} */
  function env(host) {
    return {
      paints: new Map(
        (scene.children.find((n) => n.name === "paints")?.children ?? []).map(
          (n) => [String(n.attributes.id), n],
        ),
      ),
      tokens: host.tokens,
      attributes: (n) => host.runtime?.attributes(n, host.time) ?? n.attributes,
      image: (id) => render(/** @type {Node} */ (host.assets.get(id)), host),
      scale: host.scale,
    };
  }
  /** @type {WeakMap<Node,ReturnType<typeof mediaRemap>>} */ const remaps =
    new WeakMap();
  /** @param {Node} asset @param {Host} host @param {Node} [layer] @returns {Surface} */
  function render(asset, host, layer) {
    const a = host.runtime?.attributes(asset, host.time) ?? asset.attributes,
      id = String(a.id),
      sample = samplers.get(id);
    if (!sample)
      throw new Error(`no prepared renderer for ${asset.name} ${id}`);
    const duration =
      asset.name === "imageSequence"
        ? sequenceFrames(a).length / fpsOf(a.fps).value
        : Number(durations.get(id) ?? a.duration ?? host.duration);
    let t = host.time;
    if (layer) {
      if (!remaps.has(layer)) remaps.set(layer, mediaRemap(scene, layer));
      const local =
        host.runtime?.timeline.spans.get(layer)?.local(host.time) ??
        host.time - Number(layer.attributes.start ?? 0);
      t = mediaTime(
        {
          ...(host.runtime?.attributes(layer, host.time) ?? layer.attributes),
          transitionHandle: host.handles.has(layer),
        },
        local,
        duration,
        remaps.get(layer),
      );
    }
    const result = sample(a, t, host.scale, host, layer),
      size = dimensions.get(id);
    return asset.logicalSize && size
      ? resizeSurface(
          result,
          Math.round(size.width * host.scale),
          Math.round(size.height * host.scale),
        )
      : result;
  }
  return {
    render,
    audioInfo,
    dimensions: (/** @type {Node} */ asset) =>
      dimensions.get(String(asset.attributes.id)),
    dependencies,
    meshes,
    manifest: () =>
      manifest.map((m) => ({ ...m, files: dependencies.get(m.id) ?? [] })),
    close: () => {
      for (const release of close) release();
    },
    read: (/** @type {string} */ src) => readFileSync(assetPath(base, src)),
  };
}
