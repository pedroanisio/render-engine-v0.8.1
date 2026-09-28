import { fileURLToPath } from "node:url";
import { fileDigest } from "./integrity.js";
/**
 * Scene renderer: lossless, content-addressed frame segments -> codec-aware exports.
 * Isolated audio worker, timed captions, color/alpha, integrity and atomic publication.
 */
import sharp from "sharp";
import { outputLock, publishFile } from "./output-lock.js";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  statSync,
  readdirSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileDependencies } from "../assets.js";
import { createRenderer } from "./setup.js";
import { FramePool, defaultThreads } from "./frame-pool.js";

import { loadScene } from "../index.js";
import { accessibilityReport } from "./accessibility.js";
import { measureAudio } from "./audio.js";
import { captionLanguage } from "./caption-languages.js";
import { toVtt, clipCaptions } from "./captions.js";
import { FrameRenderer } from "./frame.js";
import { assetPath } from "../media/resolve.js";
import { sphericalMetadata } from "./three/metadata.js";
import {
  videoArguments,
  colorArguments,
  audioArguments,
  encoderPreflight,
  checkEncoding,
  passArguments,
} from "./export.js";
import { processRun } from "./process.js";
import { metadataFile, offsetTimecode } from "./export-metadata.js";
import { destinationPlan, deliver } from "./delivery.js";
import { stillBytes } from "./stills.js";

export const RENDERER_VERSION = "13";

/** @typedef {import('../xsd/validate.js').ValidNode} SceneNode */

/**
 * @typedef {object} RenderOptions
 * @property {Record<string, import('../eval/value.js').Value>} [parameters]
 * @property {string} [variant]
 * @property {'pivot'|'position'} [anchorMode] explicit 2D anchor convention
 * @property {string} [data]
 * @property {number} [row]
 * @property {AbortSignal} [signal]
 * @property {string} sceneFile
 * @property {string} [outputId] output element id; default: the first <output>
 * @property {string} [representation] preferred asset representation name or proxy
 * @property {number} [scale] override: output width / project width
 * @property {number} [from] seconds; render only segments overlapping [from, to)
 * @property {number} [to]
 * @property {string} [work] scratch directory (default: <scene dir>/_tmp/render)
 * @property {[number, number]} [shard] [k, n]: render only segments whose index % n === k, then stop
 * @property {number} [jobs] run this many shard processes in parallel before assembling
 * @property {number} [threads] render frames on this many worker threads (default: chosen from cores and free memory; 1 inside shards)
 * @property {boolean} [available] render only segments whose image assets exist; skip assembly
 * @property {(line: string) => void} [log]
 */

/** @param {string} path @param {string | Uint8Array} data */
function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/**
 * @param {RenderOptions} o
 * @returns {Promise<{ video: string, captions: string[], posters: string[], rendered: number, cached: number, outputs?: {video:string,captions:string[],posters:string[],rendered:number,cached:number}[] }> }
 */
export async function renderEpisode(o) {
  o.signal?.throwIfAborted();
  const started = performance.now();
  if (
    o.jobs !== undefined &&
    (!Number.isInteger(o.jobs) || o.jobs < 1 || o.jobs > 32)
  )
    throw new Error("jobs must be an integer from 1 to 32");
  const log = o.log ?? (() => {});
  if (o.outputId === "*") {
    const loaded = loadScene(readFileSync(o.sceneFile, "utf8"));
    if (!loaded.ok)
      throw new Error(`scene is invalid: ${loaded.diagnostics[0]?.message}`);
    const outputs = loaded.scene.children.filter((n) => n.name === "output");
    if (outputs.some((n) => !n.attributes.id))
      throw new Error("multiple-output export requires output IDs");
    const targets = outputs.map((n) =>
      resolve(dirname(o.sceneFile), String(n.attributes.path)),
    );
    if (new Set(targets).size !== targets.length)
      throw new Error("multiple outputs must have distinct paths");
    const results = [];
    for (const out of outputs)
      results.push(
        await renderEpisode({ ...o, outputId: String(out.attributes.id) }),
      );
    const last = results.at(-1);
    if (!last) throw new Error("no outputs");
    return {
      ...last,
      outputs: results,
      captions: results.flatMap((r) => r.captions),
      posters: results.flatMap((r) => r.posters),
      rendered: results.reduce((a, b) => a + b.rendered, 0),
      cached: results.reduce((a, b) => a + b.cached, 0),
    };
  }
  if (o.jobs && o.jobs > 1 && !o.shard) {
    const bin = fileURLToPath(
      new URL("../../bin/scene-render.js", import.meta.url),
    );
    const n = o.jobs;
    const extra = [
      ...Object.entries(o.parameters ?? {}).flatMap(([k, v]) => [
        "--param",
        `${k}=${String(v)}`,
      ]),
      ...(o.variant ? ["--variant", o.variant] : []),
      ...(o.anchorMode ? ["--anchor-mode", o.anchorMode] : []),
      ...(o.data ? ["--data", o.data] : []),
      ...(o.row !== undefined ? ["--row", String(o.row)] : []),
      ...(o.outputId ? ["--output", o.outputId] : []),
      ...(o.representation ? ["--representation", o.representation] : []),
      ...(o.scale ? ["--scale", String(o.scale)] : []),
      ...(o.work ? ["--work", o.work] : []),
      ...(o.threads !== undefined ? ["--threads", String(o.threads)] : []),
      ...(o.from !== undefined ? ["--from", String(o.from)] : []),
      ...(o.to !== undefined ? ["--to", String(o.to)] : []),
      ...(o.available ? ["--available", "yes"] : []),
    ];
    const siblings = new AbortController();
    const signal = o.signal
      ? AbortSignal.any([o.signal, siblings.signal])
      : siblings.signal;
    /** @type {unknown} */ let firstFailure;
    const shards = await Promise.allSettled(
      Array.from({ length: n }, async (_, k) => {
        try {
          await processRun(
            process.execPath,
            [bin, "render", o.sceneFile, "--shard", `${k}/${n}`, ...extra],
            {
              signal,
              graceful: true,
              onStdout: (line) => log(line.trimEnd()),
            },
          );
        } catch (error) {
          const detail = (
            error instanceof Error ? error.message : String(error)
          ).replace(/^[^\n]* exited [^:]+: /, "");
          firstFailure ??= new Error(`shard ${k}/${n}: ${detail}`);
          siblings.abort();
          throw error;
        }
      }),
    );
    const failed = shards.find((s) => s.status === "rejected");
    if (failed?.status === "rejected") throw firstFailure;
    return o.available
      ? { video: "", captions: [], posters: [], rendered: 0, cached: 0 }
      : renderEpisode({ ...o, jobs: 1 });
  }
  const {
    sceneFile,
    base,
    sceneBytes,
    selected,
    runtime,
    scene,
    media,
    project,
    out,
    format,
    oa,
    plan,
    panorama,
    pw,
    scale,
    fps,
    duration,
    renderer,
    W,
    H,
  } = await createRenderer(o);
  let cleanupWork = "";
  let releaseLock = () => {};
  /** @type {FramePool|undefined} */ let pool;
  try {
    const anim = runtime;
    if (!o.shard && !o.available)
      releaseLock = outputLock(resolve(base, String(oa.path)));
    const encoderVersion = encoderPreflight(oa);
    const destinations = out.children
      .filter((n) => n.name === "destination")
      .map((n) => destinationPlan(n));
    const cacheWork = resolve(o.work ?? join(base, "_tmp", "render"));
    mkdirSync(cacheWork, { recursive: true });
    const work = mkdtempSync(join(cacheWork, "run-"));
    cleanupWork = work;
    const threads = o.threads ?? (o.shard ? 1 : defaultThreads());
    const rangeFrom =
      Math.ceil(Math.max(0, o.from ?? Number(oa.start ?? 0)) * fps) / fps;
    const rangeTo = Math.min(
      duration,
      Math.ceil((o.to ?? Number(oa.end ?? duration)) * fps) / fps,
    );
    if (rangeTo <= rangeFrom)
      throw new Error(
        "no segments overlap the requested interval (empty output range)",
      );
    const encodedDuration = Math.round((rangeTo - rangeFrom) * fps) / fps;
    if (encodedDuration <= 0)
      throw new Error("output range contains no complete frame");
    const finalCodecArgs = videoArguments(oa, fps, encodedDuration, W, H);
    checkEncoding(oa, fps, encodedDuration, W, H, work);
    const sceneHash = createHash("sha256")
      .update(String(encoderVersion).split("\n")[0] ?? "")
      .update(JSON.stringify(renderer.nativeInfo))
      .update(sceneBytes)
      .update(
        JSON.stringify(scene, (_, v) =>
          typeof v === "bigint" ? String(v) : v,
        ),
      )
      .update(
        JSON.stringify(
          {
            parameters: runtime.params,
            anchorMode: o.anchorMode ?? "pivot",
            variant: o.variant ?? selected?.attributes.variant,
            data: o.data,
            row: o.row,
          },
          (_, v) => (typeof v === "bigint" ? String(v) : v),
        ),
      )
      .digest("hex");
    const floatFrames = plan.codec === "exr-sequence";
    const segmentExtension = floatFrames ? "nut" : "mkv";
    const codecArgs = floatFrames
      ? ["-c:v", "rawvideo", "-pix_fmt", "gbrapf32le", "-f", "nut"]
      : [
          "-c:v",
          "ffv1",
          "-level",
          "3",
          "-threads",
          "1",
          "-pix_fmt",
          "gbrap16le",
          "-fflags",
          "+bitexact",
          "-map_metadata",
          "-1",
        ];

    // Segment boundaries: every top-level group start/end, so a segment never straddles shots.
    const composition = /** @type {SceneNode} */ (
      scene.children.find((c) => c.name === "composition")
    );
    const cuts = new Set([0, duration]);
    if (rangeFrom > 0 && rangeFrom < duration) cuts.add(rangeFrom);
    if (rangeTo > 0 && rangeTo < duration) cuts.add(rangeTo);
    for (const g of composition.children) {
      for (const k of ["start", "end"]) {
        const span = runtime.timeline.spans.get(g);
        const v = k === "start" ? span?.start : span?.end;
        if (typeof v === "number" && v > 0 && v < duration) cuts.add(v);
      }
    }
    const times = [...cuts].sort((a, b) => a - b);
    const frames = Math.round(duration * fps);
    /** @type {Array<{ f0: number, f1: number }>} */
    const spans = [];
    for (let i = 0; i < times.length - 1; i++) {
      const f0 = Math.round(/** @type {number} */ (times[i]) * fps);
      const f1 = Math.min(
        frames,
        Math.round(/** @type {number} */ (times[i + 1]) * fps),
      );
      if (f1 > f0) spans.push({ f0, f1 });
    }
    // Each segment's key covers only the image files its shots draw, so regenerating one
    // shot's plates re-renders only that shot.
    const visualFonts = (
      scene.children.find((c) => c.name === "assets")?.children ?? []
    )
      .filter((a) => a.name === "font")
      .map((a) => String(a.attributes.src));
    const imageSrc = new Map(
      (scene.children.find((c) => c.name === "assets")?.children ?? [])
        .filter((a) => a.name === "image")
        .map((a) => [String(a.attributes.id), String(a.attributes.src)]),
    );
    /** @param {SceneNode} n @returns {boolean} */
    const dynamicDependencies = (n) =>
      n.name === "object3D" ||
      n.name === "physics" ||
      n.name === "pattern" ||
      n.name === "transition" ||
      n.name === "effect" ||
      n.attributes.motionBlur === "on" ||
      n.attributes.motionBlur === true ||
      n.children.some(
        (c) =>
          (["animate", "expression", "link"].includes(c.name) &&
            c.attributes.property === "asset") ||
          (c.name === "expression" &&
            String(c.value).includes("audioAmplitude")) ||
          (c.name === "link" &&
            String(c.attributes.source).startsWith("audio:")) ||
          dynamicDependencies(c),
      ) ||
      (n.attributes.timeOffset !== undefined &&
        Number(n.attributes.timeOffset) !== 0) ||
      (n.attributes.timeScale !== undefined &&
        Number(n.attributes.timeScale) !== 1);
    const dynamicFiles = dynamicDependencies(scene)
      ? fileDependencies(scene)
          .filter((d) => d.role === "src" && !d.pattern)
          .map((d) => d.uri)
      : [];
    /** @type {Map<string, string>} */
    const fileHash = new Map();
    /** @param {number} t0 @param {number} t1 @returns {{ hash: string, missing: string[] }} */
    const segmentAssets = (t0, t1) => {
      const h = createHash("sha256");
      for (const [src, bytes] of renderer.effectFiles)
        h.update(src).update(bytes);
      for (const [id, files] of media.dependencies) {
        const kind = renderer.assets.get(id)?.name;
        if (kind === "image" || kind === "font") continue;
        for (const file of files) h.update(file.src).update(file.sha256);
      }
      for (const src of visualFonts) {
        if (!fileHash.has(src))
          fileHash.set(
            src,
            createHash("sha256")
              .update(readFileSync(join(base, src)))
              .digest("hex"),
          );
        h.update(src).update(/** @type {string} */ (fileHash.get(src)));
      }
      /** @type {string[]} */
      const absent = [];
      for (const src of dynamicFiles) {
        const file = join(base, src);
        if (!existsSync(file)) {
          absent.push(src);
          continue;
        }
        if (!fileHash.has(src))
          fileHash.set(
            src,
            createHash("sha256").update(readFileSync(file)).digest("hex"),
          );
        h.update(src).update(/** @type {string} */ (fileHash.get(src)));
      }
      /** @param {SceneNode} n */
      const walk = (n) => {
        if (n.name === "layer") {
          const src = imageSrc.get(String(n.attributes.asset));
          if (src) {
            const file = join(base, src);
            if (!existsSync(file)) absent.push(src);
            else {
              if (!fileHash.has(src))
                fileHash.set(
                  src,
                  createHash("sha256").update(readFileSync(file)).digest("hex"),
                );
              h.update(src).update(/** @type {string} */ (fileHash.get(src)));
            }
          }
        }
        for (const c of n.children) walk(c);
      };
      for (const g of composition.children) {
        const gs = runtime.timeline.spans.get(g)?.start ?? 0;
        const ge = runtime.timeline.spans.get(g)?.end ?? duration;
        if (gs < t1 && ge > t0) walk(g);
      }
      return { hash: h.digest("hex"), missing: absent };
    };
    let skipped = 0;

    let rendered = 0;
    let cached = 0;
    /** @type {string[]} */
    const segments = [];
    /** @type {Map<string,number>} */ const segmentDurations = new Map();
    let exportStart = duration;
    let exportEnd = 0;
    for (const [index, { f0, f1 }] of spans.entries()) {
      const seg = segmentAssets(f0 / fps, f1 / fps);
      const key = createHash("sha256")
        .update(
          JSON.stringify({
            RENDERER_VERSION,
            sceneHash,
            assetHash: seg.hash,
            f0,
            f1,
            W,
            H,
            fps,
            codecArgs,
          }),
        )
        .digest("hex")
        .slice(0, 24);
      const path = join(
        cacheWork,
        "segments",
        `${String(f0).padStart(6, "0")}-${key}.${segmentExtension}`,
      );
      const inRange =
        f1 / fps > rangeFrom &&
        f0 / fps < rangeTo &&
        (!o.shard || index % o.shard[1] === o.shard[0]);
      if (!inRange) continue;
      segments.push(path);
      segmentDurations.set(path, (f1 - f0) / fps);
      exportStart = Math.min(exportStart, f0 / fps);
      exportEnd = Math.max(exportEnd, f1 / fps);
      if (seg.missing.length) {
        skipped += 1;
        log(`segment ${f0}-${f1} skipped: missing ${seg.missing.join(", ")}`);
        continue;
      }
      if (
        existsSync(path) &&
        existsSync(path + ".sha256") &&
        (await fileDigest(path, o.signal)) ===
          readFileSync(path + ".sha256", "utf8")
      ) {
        cached += 1;
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      const tmp = join(work, `segment-${index}.${segmentExtension}`);
      const framesToEncode = function* () {
        for (let f = f0; f < f1; f++) {
          o.signal?.throwIfAborted();
          const frame = renderer.render(f / fps);
          yield floatFrames
            ? renderer.color.encodeFloat(frame, oa.alpha === true)
            : renderer.color.encode16(frame, oa.alpha === true);
        }
      };
      if (threads > 1 && f1 - f0 > 1 && !pool)
        pool = await new FramePool(o, threads).start();
      const frames = pool
        ? pool.frames(f0, f1, fps, renderer)
        : framesToEncode();
      await processRun(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-f",
          "rawvideo",
          "-pix_fmt",
          floatFrames ? "gbrapf32le" : "rgba64le",
          "-s",
          `${renderer.width}x${renderer.height}`,
          "-r",
          String(oa.fps ?? project.attributes.fps),
          "-i",
          "-",
          ...codecArgs,
          tmp,
        ],
        { frames, signal: o.signal },
      );
      if (renderer.unsupported.size) {
        rmSync(tmp, { force: true });
        throw new Error(
          `unsupported features: ${[...renderer.unsupported].join(", ")}`,
        );
      }
      renameSync(tmp, path);
      writeAtomic(path + ".sha256", await fileDigest(path, o.signal));
      renderer.cache.clear();
      pool?.clear();
      rendered += 1;
      for (const warning of renderer.warnings) log(`warning: ${warning}`);
      log(`segment ${f0}-${f1} rendered`);
    }
    if (renderer.unsupported.size)
      throw new Error(
        `unsupported features: ${[...renderer.unsupported].join(", ")}`,
      );
    if (o.shard || o.available) {
      log(
        `${rendered} segments rendered, ${cached} reused, ${skipped} skipped for missing images`,
      );
      return { video: "", captions: [], posters: [], rendered, cached };
    }

    const partial = o.from !== undefined || o.to !== undefined;
    const target = resolve(base, String(oa.path));
    const extension = plan.container === "image2" ? "frames" : plan.container;
    const video = partial
      ? plan.sequence
        ? join(
            cacheWork,
            "partial",
            String(oa.path).split("/").at(-1) ?? "%06d.png",
          )
        : join(cacheWork, `partial.${extension}`)
      : target;
    const temporary = plan.sequence
      ? join(work, "frames", String(oa.path).split("/").at(-1) ?? "%06d.png")
      : join(work, "export." + extension);
    mkdirSync(dirname(temporary), { recursive: true });
    const list = join(work, "segments.txt");
    if (!segments.length)
      throw new Error("no segments overlap the requested interval");
    const used = segments;
    writeAtomic(
      list,
      used
        .map(
          (p) =>
            `file '${p.replaceAll("'", "'\\''")}'\nduration ${segmentDurations.get(p)}`,
        )
        .join("\n") + "\n",
    );
    const silent = join(work, "video." + segmentExtension);
    await processRun(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-c",
        "copy",
        silent,
      ],
      { signal: o.signal },
    );

    // Audio: mix, then two-pass loudness normalisation when the master asks for it.
    const master = scene.children
      .find((n) => n.name === "audioMix")
      ?.children.find((n) => n.name === "master");
    const requestFile = join(work, "audio-request.json");
    writeFileSync(
      requestFile,
      JSON.stringify(
        {
          scene,
          base,
          work,
          duration,
          parameters: runtime.params,
          tracks: renderer.captionTracks,
          output: oa,
          start: exportStart,
          end: exportEnd,
        },
        (_k, v) => (typeof v === "bigint" ? { $bigint: String(v) } : v),
      ),
    );
    await processRun(
      process.execPath,
      [
        fileURLToPath(new URL("../../bin/audio-worker.js", import.meta.url)),
        requestFile,
      ],
      { signal: o.signal },
    );
    const { finished: finishedAudio, accessibility } = JSON.parse(
      readFileSync(join(work, "audio-result.json"), "utf8"),
    );
    const finalAudio = finishedAudio.path;
    mkdirSync(dirname(video), { recursive: true });
    const muxArgs = ["-v", "error", "-y", "-i", silent];
    if (plan.audio)
      muxArgs.push(
        "-ss",
        String(exportStart),
        ...(format.layout.startsWith("ambisonic")
          ? ["-channel_layout", format.layout.replace("-", " ")]
          : []),
        "-i",
        finalAudio,
      );
    const embeddedCaptions = renderer.captionTracks.filter(
      (t) =>
        Array.isArray(oa.captions) &&
        oa.captions.includes(String(t.attributes.id)),
    );
    for (const [i, track] of embeddedCaptions.entries()) {
      const path = join(work, `caption-${i}.vtt`);
      writeAtomic(path, toVtt(clipCaptions(track, exportStart, exportEnd)));
      muxArgs.push("-i", path);
    }
    if (oa.embedMetadata !== false) {
      const meta = metadataFile(
        scene,
        exportStart,
        exportEnd,
        join(work, "metadata.txt"),
      );
      muxArgs.push(
        "-f",
        "ffmetadata",
        "-i",
        meta,
        "-map_metadata",
        String(1 + (plan.audio ? 1 : 0) + embeddedCaptions.length),
        "-map_chapters",
        String(1 + (plan.audio ? 1 : 0) + embeddedCaptions.length),
      );
    } else muxArgs.push("-map_metadata", "-1", "-map_chapters", "-1");
    muxArgs.push(...audioArguments(oa));
    if (!plan.audioOnly) muxArgs.push("-map", "0:v:0");
    if (plan.audio) muxArgs.push("-map", "1:a:0");
    for (const [i, track] of embeddedCaptions.entries())
      muxArgs.push(
        "-map",
        `${i + (plan.audio ? 2 : 1)}:s:0`,
        `-metadata:s:s:${i}`,
        `language=${captionLanguage(String(track.attributes.language))}`,
        `-metadata:s:s:${i}`,
        `title=${String(track.attributes.label ?? track.attributes.id)}`,
        `-metadata:s:s:${i}`,
        `handler_name=${String(track.attributes.label ?? track.attributes.id)} [${String(track.attributes.language)}]`,
      );
    if (embeddedCaptions.length)
      muxArgs.push(
        "-c:s",
        ["mp4", "mov"].includes(plan.container)
          ? "mov_text"
          : plan.container === "webm"
            ? "webvtt"
            : "srt",
      );
    if (accessibility?.description)
      muxArgs.push("-metadata", `description=${accessibility.description}`);
    if (
      project.attributes.timecodeStart &&
      ["mp4", "mov", "mxf"].includes(plan.container)
    )
      muxArgs.push(
        "-timecode",
        offsetTimecode(
          String(project.attributes.timecodeStart),
          exportStart,
          fps,
        ),
      );
    const muxer =
      plan.container === "mkv"
        ? "matroska"
        : plan.container === "m4a"
          ? "ipod"
          : plan.container;
    let filters = `scale=${W}:${H}:flags=lanczos:out_color_matrix=${oa.colorSpace === "rec2020" ? "bt2020" : "bt709"}:out_range=${oa.colorRange === "full" ? "full" : "limited"},setsar=${project.attributes.pixelAspect ?? 1}`;
    if (plan.codec === "gif")
      filters +=
        ",split[v][g];[g]palettegen=reserve_transparent=1:stats_mode=single[p];[v][p]paletteuse=new=1:alpha_threshold=128";
    const muxCommand = [
      ...muxArgs,
      "-t",
      String(exportEnd - exportStart),
      ...finalCodecArgs,
      ...(!plan.audioOnly
        ? ["-frames:v", String(Math.round((exportEnd - exportStart) * fps))]
        : []),
      ...(!plan.audioOnly ? ["-vf", filters, ...colorArguments(oa)] : []),
      ...(["mp4", "mov", "m4a"].includes(plan.container)
        ? [
            "-movflags",
            (oa.faststart !== false ? "+faststart" : "") +
              (oa.embedMetadata !== false ? "+use_metadata_tags" : "") || "0",
          ]
        : []),
      "-f",
      muxer,
      temporary,
    ];
    if (oa.twoPass === true) {
      await processRun(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          silent,
          "-vf",
          filters,
          ...finalCodecArgs,
          ...passArguments(plan.codec, 1, work, finalCodecArgs),
          "-an",
          "-f",
          "null",
          "/dev/null",
        ],
        { signal: o.signal },
      );
      muxCommand.splice(
        muxCommand.length - 1,
        0,
        ...passArguments(plan.codec, 2, work, finalCodecArgs),
      );
    }
    await processRun("ffmpeg", muxCommand, { signal: o.signal });
    let encodedAudio = !plan.audio ? undefined : measureAudio(temporary);
    const ceiling = Number(master?.attributes.truePeak ?? -1);
    if (
      master?.attributes.limiter === true ||
      ["integrated", "dynamic"].includes(String(master?.attributes.normalize))
    ) {
      let gain = 0;
      for (
        let attempt = 0;
        attempt < 3 &&
        encodedAudio?.truePeak !== null &&
        encodedAudio?.truePeak !== undefined &&
        encodedAudio.truePeak > ceiling + 0.05;
        attempt++
      ) {
        gain += ceiling - encodedAudio.truePeak - 0.1;
        const corrected = muxCommand.slice(),
          af = corrected.indexOf("-af");
        if (af >= 0) corrected[af + 1] += `,volume=${gain}dB`;
        else
          corrected.splice(corrected.length - 1, 0, "-af", `volume=${gain}dB`);
        await processRun("ffmpeg", corrected, { signal: o.signal });
        encodedAudio = measureAudio(temporary);
      }
      if (
        encodedAudio?.truePeak !== null &&
        encodedAudio?.truePeak !== undefined &&
        encodedAudio.truePeak > ceiling + 0.05
      )
        throw new Error("encoded audio exceeds truePeak ceiling");
    }
    if (
      panorama &&
      oa.sphericalMetadata !== false &&
      ["mp4", "mov"].includes(plan.container)
    ) {
      const file = temporary;
      writeFileSync(file, sphericalMetadata(readFileSync(file), panorama));
      writeAtomic(
        `${video}.projection.json`,
        JSON.stringify(
          {
            ...panorama,
            width: W,
            height: H,
            coordinateSystem: "x-right-y-down-z-away",
            cubeFaces: ["right", "left", "up", "down", "front", "back"],
          },
          null,
          2,
        ) + "\n",
      );
    }
    if (accessibility && !plan.sequence && !plan.audioOnly) {
      const report = accessibilityReport(
        temporary,
        renderer,
        accessibility,
        exportStart,
        exportEnd,
        fps,
      );
      writeAtomic(
        `${video}.accessibility.json`,
        JSON.stringify(report, null, 2) + "\n",
      );
      for (const finding of report.findings)
        log(`accessibility ${finding.severity}: ${finding.message}`);
      if (!report.passed) {
        rmSync(temporary, { force: true });
        throw new Error(
          "accessibility checks failed; see output accessibility report",
        );
      }
    }
    if (oa.maxFileSize && statSync(temporary).size > Number(oa.maxFileSize))
      throw new Error(
        "encoded file exceeds maxFileSize; final output was not replaced",
      );
    const sequenceFiles = plan.sequence
      ? readdirSync(dirname(temporary)).sort()
      : undefined;
    if (plan.sequence) {
      const prior = existsSync(video + ".assets.json")
        ? JSON.parse(readFileSync(video + ".assets.json", "utf8"))
        : undefined;
      await processRun(
        "ffmpeg",
        [
          "-v",
          "error",
          "-xerror",
          "-framerate",
          String(fps),
          "-i",
          temporary,
          "-f",
          "null",
          "-",
        ],
        { signal: o.signal },
      );
      mkdirSync(dirname(video), { recursive: true });
      for (const file of sequenceFiles ?? [])
        publishFile(join(dirname(temporary), file), join(dirname(video), file));
      if (prior?.output?.sequence && Array.isArray(prior.output.files))
        for (const file of prior.output.files) {
          if (
            typeof file === "string" &&
            basename(file) === file &&
            !sequenceFiles?.includes(file)
          )
            rmSync(join(dirname(video), file), { force: true });
        }
    } else {
      if (plan.codec === "webp") {
        const info = await sharp(temporary, { animated: true }).metadata();
        if (
          Number(info.pages ?? 1) !==
          Math.round((exportEnd - exportStart) * fps)
        )
          throw new Error("WebP frame count mismatch");
        for (let page = 0; page < Number(info.pages ?? 1); page++)
          await sharp(temporary, { page, pages: 1 }).raw().toBuffer();
      } else {
        const progress = await processRun(
          "ffmpeg",
          [
            "-v",
            "error",
            "-xerror",
            "-i",
            temporary,
            "-fps_mode",
            "passthrough",
            "-progress",
            "pipe:1",
            "-f",
            "null",
            "-",
          ],
          { signal: o.signal },
        );
        const count = [...progress.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1];
        if (
          !plan.audioOnly &&
          Number(count) !== Math.round((exportEnd - exportStart) * fps)
        )
          throw new Error(`Decoded frame count mismatch: ${count}`);
      }
      publishFile(temporary, video);
    }
    log(`wrote ${video}`);

    /** @type {string[]} */
    const captions = [];
    const ids = Array.isArray(oa.captions) ? oa.captions.map(String) : [];
    for (const track of renderer.captionTracks) {
      if (ids.length && !ids.includes(String(track.attributes.id))) continue;
      if (track.attributes.mode === "burn") continue;
      const p = video.replace(
        /\.[^.]+$/,
        `.${String(track.attributes.id)}.${String(track.attributes.language ?? "und")}.vtt`,
      );
      writeAtomic(p, toVtt(clipCaptions(track, exportStart, exportEnd)));
      captions.push(p);
    }
    /** @type {string[]} */
    const posters = [];
    for (const still of out.children.filter(
      (c) => c.name === "poster" || c.name === "thumbnail",
    )) {
      const sa = still.attributes;
      const width = Number(sa.width ?? pw * scale);
      const r = new FrameRenderer(
        scene,
        anim.tracks,
        {
          anchorMode: o.anchorMode,
          path: (p) => assetPath(base, p),
          read: media.read,
          media: media.render,
          dimensions: media.dimensions,
          meshes: media.meshes,
          meshDependencies: media.dependencies,
        },
        width / pw,
        runtime,
      );
      r.color.output = { ...oa, colorSpace: "srgb", transfer: "srgb" };
      r.captionOutput = oa;
      r.fps = fps;
      const p = resolve(base, String(sa.path));
      const surface = r.render(
        Number(sa.time ?? 0) +
          (sa.marker === undefined ? 0 : runtime.timeline.marker(sa.marker)),
      );
      writeAtomic(
        p,
        await stillBytes(
          r.color.encode16(surface),
          r.width,
          r.height,
          String(sa.format),
          Number(sa.quality ?? 0.9),
        ),
      );
      posters.push(p);
    }
    writeAtomic(
      `${video}.assets.json`,
      JSON.stringify(
        {
          renderer: RENDERER_VERSION,
          compatibility: { anchorMode: o.anchorMode ?? "pivot" },
          encoder: encoderVersion,
          output: {
            ...plan,
            requested: out.attributes,
            files: sequenceFiles,
            width: W,
            height: H,
            start: exportStart,
            end: exportEnd,
            fps,
            arguments: finalCodecArgs,
          },
          metrics: {
            elapsedSeconds: (performance.now() - started) / 1000,
            frames: Math.round((exportEnd - exportStart) * fps),
            rendered,
            cached,
          },
          native: renderer.nativeInfo,
          assets: media.manifest(),
          audio: { ...finishedAudio.report, encoded: encodedAudio },
          effectResources: [...renderer.effectFiles].map(([src, bytes]) => ({
            src,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          })),
        },
        null,
        2,
      ) + "\n",
    );
    let deliveryFile = video;
    if (plan.sequence && destinations.length) {
      deliveryFile = join(work, "sequence.zip");
      await processRun(
        "python3",
        [
          "-c",
          `import zipfile,sys,pathlib,shutil
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as z:
 for p in sorted(pathlib.Path(sys.argv[1]).iterdir()):
  info=zipfile.ZipInfo(p.name,(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
  with p.open('rb') as src,z.open(info,'w') as dst: shutil.copyfileobj(src,dst,1024*1024)
`,
          dirname(temporary),
          deliveryFile,
        ],
        { signal: o.signal },
      );
    }
    for (const destination of destinations)
      await deliver(destination, deliveryFile, base, o.signal);
    return { video, captions, posters, rendered, cached };
  } finally {
    pool?.close();
    releaseLock();
    media.close();
    if (cleanupWork) rmSync(cleanupWork, { recursive: true, force: true });
  }
}
