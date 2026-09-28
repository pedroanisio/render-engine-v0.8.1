/**
 * Renderer construction shared by the pipeline and its frame workers: scene
 * loading, runtime compilation, media preparation and output geometry, with
 * no locks, scratch directories or encoder probes.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checkAnchorMode } from "./compatibility.js";
import { fileDependencies } from "../assets.js";
import { compileRuntime } from "../eval/runtime.js";
import { capabilities } from "../scene/preflight.js";
import { createAudioAnalysis } from "./audio-analysis.js";
import { loadScene } from "../index.js";
import { audioFormat } from "./audio.js";
import { FrameRenderer } from "./frame.js";
import { prepareMedia } from "../media/manager.js";
import { assetPath, selectRepresentations } from "../media/resolve.js";
import { outputPlan } from "./export.js";

/** @typedef {import('../xsd/validate.js').ValidNode} SceneNode */
/** @typedef {import('./pipeline.js').RenderOptions} RenderOptions */

/**
 * @typedef {object} SceneSnapshot exact inputs a renderer was built from, so frame
 * workers render the bytes the pipeline hashed rather than re-reading the disk.
 * @property {Uint8Array} sceneBytes
 * @property {Record<string, string>} reads text files (includes, data) read while compiling
 */

/** @param {RenderOptions} o @param {SceneSnapshot} [snapshot] */
export async function createRenderer(o, snapshot) {
  const sceneFile = resolve(o.sceneFile);
  const base = dirname(sceneFile);
  const sceneBytes = snapshot
    ? Buffer.from(snapshot.sceneBytes)
    : readFileSync(sceneFile);
  /** @type {Record<string, string>} */
  const reads = Object.create(null);
  const loaded = loadScene(sceneBytes.toString("utf8"));
  if (!loaded.ok)
    throw new Error(`scene is invalid: ${loaded.diagnostics[0]?.message}`);
  const selected = loaded.scene.children.find(
    (c) =>
      c.name === "output" && (!o.outputId || c.attributes.id === o.outputId),
  );
  let analyze = createAudioAnalysis(loaded.scene, base);
  const runtime = compileRuntime(
    selectRepresentations(
      loaded.scene,
      o.representation ??
        (selected?.attributes.representation === undefined
          ? undefined
          : String(selected.attributes.representation)),
    ),
    {
      expand: true,
      root: base,
      load: loadScene,
      parameters: o.parameters,
      variant:
        o.variant ??
        (selected?.attributes.variant === undefined
          ? undefined
          : String(selected.attributes.variant)),
      layout:
        selected?.attributes.layout === undefined
          ? undefined
          : String(selected.attributes.layout),
      data: o.data,
      row: o.row,
      read: (p) => {
        if (snapshot) {
          if (!Object.hasOwn(snapshot.reads, p))
            throw new Error(`scene input ${p} was not read by the pipeline`);
          return /** @type {string} */ (snapshot.reads[p]);
        }
        return (reads[p] ??= readFileSync(assetPath(base, p), "utf8"));
      },
      audioAmplitude: (id, t, band) => analyze(id, t, band),
    },
  );
  const scene = runtime.scene;
  checkAnchorMode(scene, o.anchorMode);
  analyze = createAudioAnalysis(scene, base);
  const unsupported = capabilities(scene);
  if (unsupported.length)
    throw new Error(
      `unsupported features: ${unsupported.map((d) => `${d.message} (${d.path})`).join("; ")}`,
    );
  const missing = fileDependencies(scene).filter(
    (d) =>
      d.role === "src" &&
      !d.pattern &&
      !existsSync(assetPath(base, d.uri, true)),
  );
  if (missing.length && !o.available)
    throw new Error(
      `${missing.length} asset files are missing, e.g. ${missing
        .slice(0, 3)
        .map((m) => m.uri)
        .join(", ")}`,
    );
  const media = await prepareMedia(scene, { base, available: o.available });
  try {
    const project = /** @type {SceneNode} */ (
      scene.children.find((c) => c.name === "project")
    );
    const outputs = scene.children.filter((c) => c.name === "output");
    const out = o.outputId
      ? outputs.find((c) => c.attributes.id === o.outputId)
      : outputs[0];
    if (!out)
      throw new Error(
        `no <output>${o.outputId ? ` with id ${o.outputId}` : ""}`,
      );
    const format = audioFormat(scene);
    const oa = /** @type {SceneNode["attributes"]} */ ({
      audioSampleRate: format.rate,
      audioChannels: format.channels,
      audioLayout: format.layout,
      audioBitDepth: format.bits,
      ...out.attributes,
      specifiedOutputAttributes: [
        ...(out.specifiedAttributes ?? Object.keys(out.attributes)),
      ],
      pixelFormatExplicit:
        out.specifiedAttributes?.includes("pixelFormat") ?? false,
    });
    const plan = outputPlan(oa);
    const panorama =
      project.attributes.mode === "viewport"
        ? undefined
        : (scene.children.find((n) => n.name === "scene360")?.attributes ??
          (project.attributes.mode === "equirectangular"
            ? { layout: "equirectangular", stereo: "mono" }
            : undefined));
    if (
      panorama &&
      oa.sphericalMetadata !== false &&
      !plan.audioOnly &&
      !["mp4", "mov"].includes(plan.container)
    )
      throw new Error(
        "Spherical metadata embedding requires mp4/mov; set sphericalMetadata=false for other containers",
      );
    const pw = Number(panorama?.width ?? project.attributes.width);
    const scale = o.scale ?? Number(oa.width ?? pw) / pw;
    const [fn, fd] = String(oa.fps ?? project.attributes.fps)
      .split("/")
      .map(Number);
    const fps = /** @type {number} */ (fn) / (fd ?? 1);
    const duration = /** @type {number} */ (project.attributes.duration);
    if (
      pw *
        scale *
        Number(panorama?.height ?? project.attributes.height) *
        scale >
      33554432
    )
      throw new Error("render surface exceeds 32-megapixel frame budget");
    const renderer = new FrameRenderer(
      scene,
      runtime.tracks,
      {
        anchorMode: o.anchorMode,
        path: (p) => assetPath(base, p),
        read: media.read,
        media: media.render,
        dimensions: media.dimensions,
        meshes: media.meshes,
        meshDependencies: media.dependencies,
      },
      scale,
      runtime,
    );
    renderer.color.output = oa;
    renderer.captionOutput = oa;
    renderer.fps = fps;
    const W = Math.round(
      o.scale ? renderer.width : Number(oa.width ?? renderer.width),
    );
    const H = Math.round(
      o.scale
        ? renderer.height
        : Number(oa.height ?? panorama?.height ?? project.attributes.height),
    );
    if (W * H > 33554432)
      throw new Error("output exceeds 32-megapixel frame budget");
    return {
      sceneFile,
      base,
      sceneBytes,
      reads,
      loaded,
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
    };
  } catch (error) {
    media.close();
    throw error;
  }
}
