/** Deterministic accessibility diagnostics for the exported interval. */
import { spawn } from "node:child_process";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {number} v */
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** Incremental general/red flash checks on decoded output, in sliding one-second
 * windows; memory is bounded by one frame of per-pixel state plus a one-second history.
 * The reference display uses a 10-degree viewport of one third of the picture width/height.
 * @param {number} width @param {number} height @param {number} fps */
export function flashAnalyzer(width, height, fps) {
  const pixels = width * height,
    previous = new Float32Array(pixels),
    redPrevious = new Float32Array(pixels),
    direction = new Int8Array(pixels),
    redDirection = new Int8Array(pixels),
    count = new Uint8Array(pixels),
    /** @type {Uint8Array[]} */ history = [];
  /** @type {Array<{time:number,area:number}>} */ const findings = [];
  let frame = 0;
  /** @param {Uint8Array} rgb one rgb24 frame */
  const push = (rgb) => {
    const flashes = new Uint8Array(pixels);
    for (let p = 0; p < pixels; p++) {
      const at = p * 3,
        r = linear(Number(rgb[at]) / 255),
        g = linear(Number(rgb[at + 1]) / 255),
        b = linear(Number(rgb[at + 2]) / 255),
        y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
        d = y - Number(previous[p]);
      const red =
          r / (r + g + b || 1) >= 0.8 ? Math.max(0, r - g - b) * 320 : 0,
        rd = red - Number(redPrevious[p]);
      const s =
          Math.abs(d) >= 0.1 && Math.min(y, Number(previous[p])) < 0.8
            ? Math.sign(d)
            : 0,
        rs = Math.abs(rd) > 20 ? Math.sign(rd) : 0;
      if (
        frame &&
        ((s && direction[p] === -s) || (rs && redDirection[p] === -rs))
      ) {
        flashes[p] = 1;
        direction[p] = 0;
        redDirection[p] = 0;
      } else {
        if (s) direction[p] = s;
        if (rs) redDirection[p] = rs;
      }
      previous[p] = y;
      redPrevious[p] = red;
      count[p] = Number(count[p]) + Number(flashes[p]);
    }
    history.push(flashes);
    if (history.length > Math.ceil(fps)) {
      const old = history.shift();
      for (let p = 0; p < pixels; p++)
        count[p] = Number(count[p]) - Number(old?.[p]);
    }
    const integral = new Uint32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y + 1) * (width + 1) + x + 1;
        integral[i] =
          (Number(count[y * width + x]) > 3 ? 1 : 0) +
          Number(integral[i - 1]) +
          Number(integral[i - width - 1]) -
          Number(integral[i - width - 2]);
      }
    const ww = Math.max(1, Math.round(width / 3)),
      hh = Math.max(1, Math.round(height / 3));
    let maximum = 0;
    for (let y = 0; y <= height - hh; y++)
      for (let x = 0; x <= width - ww; x++) {
        const a = y * (width + 1) + x,
          b = a + ww,
          c = (y + hh) * (width + 1) + x,
          d = c + ww;
        maximum = Math.max(
          maximum,
          (Number(integral[d]) -
            Number(integral[b]) -
            Number(integral[c]) +
            Number(integral[a])) /
            (ww * hh),
        );
      }
    if (
      maximum > 0.25 &&
      (!findings.length || frame / fps - Number(findings.at(-1)?.time) >= 1)
    )
      findings.push({ time: frame / fps, area: maximum });
    frame++;
  };
  return {
    push,
    result: () => ({
      frames: frame,
      fps,
      referenceViewport:
        "one-third width × one-third height; 25% area threshold",
      findings,
    }),
  };
}
/** Flash checks over an in-memory rgb24 frame sequence.
 * @param {Uint8Array} rgb @param {number} width @param {number} height @param {number} fps */
export function flashAnalysis(rgb, width, height, fps) {
  const analyzer = flashAnalyzer(width, height, fps),
    size = width * height * 3;
  for (let at = 0; at + size <= rgb.length; at += size)
    analyzer.push(rgb.subarray(at, at + size));
  return analyzer.result();
}
/** Decodes `video` frame by frame from an FFmpeg pipe (bounded memory, any duration).
 * @param {string} video @param {number} width @param {number} height @param {number} fps */
export async function flashAnalysisStream(video, width, height, fps) {
  const analyzer = flashAnalyzer(width, height, fps),
    size = width * height * 3,
    child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        video,
        "-vf",
        `scale=${width}:${height}:flags=area`,
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  /** @type {Buffer[]} */ const errors = [];
  child.stderr.on("data", (c) => errors.push(c));
  const exited = new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (code) => ok(code));
  });
  const pending = Buffer.alloc(size);
  let filled = 0;
  for await (const chunk of child.stdout) {
    let at = 0;
    while (at < chunk.length) {
      const n = Math.min(size - filled, chunk.length - at);
      chunk.copy(pending, filled, at, at + n);
      filled += n;
      at += n;
      if (filled === size) {
        analyzer.push(pending);
        filled = 0;
      }
    }
  }
  const code = await exited;
  if (code !== 0)
    throw new Error(
      `flash analysis decode failed: ${Buffer.concat(errors).toString().trim()}`,
    );
  return analyzer.result();
}
/** @param {Node} scene @param {Node[]} captions @param {ReturnType<import('./audio.js').mixAudio>} mix @param {Record<string,any>} output @param {number} start @param {number} end */
export function accessibilityRequirements(
  scene,
  captions,
  mix,
  output,
  start,
  end,
) {
  const a = scene.children
    .find((n) => n.name === "metadata")
    ?.children.find((n) => n.name === "accessibility")?.attributes;
  if (!a) return undefined;
  const ids = Array.isArray(output.captions) ? output.captions.map(String) : [];
  // Mirrors the export: burned (burnCaptions, else every non-sidecar track),
  // embedded (output@captions) and written sidecars (non-burn, filtered by ids).
  const selected = captions.filter((t) => {
    const id = String(t.attributes.id),
      mode = t.attributes.mode;
    return (
      (output.burnCaptions
        ? output.burnCaptions === t.attributes.id
        : mode !== "sidecar") ||
      ids.includes(id) ||
      (mode !== "burn" && !ids.length)
    );
  });
  const cues = selected
    .flatMap((t) => t.children)
    .filter(
      (c) =>
        Number(c.attributes.start) < end &&
        Number(c.attributes.end) > start &&
        String(c.attributes.text ?? "").trim(),
    );
  if (a.requireCaptions === true && !cues.length)
    throw new Error(
      "accessibility: requireCaptions has no captions in the exported interval",
    );
  if (a.audioDescription) {
    const tracks =
      scene.children
        .find((n) => n.name === "audioMix")
        ?.children.filter(
          (n) =>
            n.name === "audioTrack" &&
            (n.attributes.id === a.audioDescription ||
              n.attributes.asset === a.audioDescription),
        ) ?? [];
    const audible = tracks.some((n) => {
      const pcm = mix.stems.get(String(n.attributes.id));
      const audible = (/** @type {Float32Array|undefined} */ p) =>
        p
          ?.subarray(
            Math.floor(start * mix.rate) * mix.channels,
            Math.ceil(end * mix.rate) * mix.channels,
          )
          .some((v) => Math.abs(v) > 1e-5);
      let bus = String(n.attributes.bus ?? "");
      const seen = new Set();
      while (bus && !seen.has(bus)) {
        seen.add(bus);
        if (!audible(mix.stems.get(bus))) return false;
        bus = String(
          scene.children
            .find((n) => n.name === "audioMix")
            ?.children.find((n) => n.attributes.id === bus)?.attributes
            .output ?? "",
        );
      }
      return audible(pcm) && audible(mix.pcm);
    });
    if (output.audio === false || !audible)
      throw new Error(
        "accessibility: audioDescription is not audible in this output",
      );
  }
  return {
    description: String(a.description ?? ""),
    audioDescription: a.audioDescription ?? null,
    requireCaptions: a.requireCaptions === true,
    flashCheck: String(a.flashCheck ?? "warn"),
    contrastCheck: String(a.contrastCheck ?? "off"),
    minContrast: Number(a.minContrast ?? 4.5),
  };
}
/**
 * Renders the frame at `time` and measures every text layer drawn in it: the
 * lowest contrast ratio between its core pixels (alpha within 5% of its peak)
 * and the same pixels of the frame rendered without text.
 * @param {import('./frame.js').FrameRenderer} renderer @param {number} time
 * @returns {{picture: import('./surface.js').Surface, contrast: Array<[string, number]>}}
 */
export function contrastFrame(renderer, time) {
  const originalCompositor = renderer.useCompositor;
  renderer.useCompositor = true;
  try {
    renderer.contrastChecks = [];
    renderer.captureContrast = true;
    const picture = renderer.render(time),
      masks = renderer.contrastChecks;
    renderer.captureContrast = false;
    /** @type {Array<[string, number]>} */ const contrast = [];
    if (!masks.length) return { picture, contrast };
    renderer.suppressText = true;
    const background = renderer.render(time);
    renderer.suppressText = false;
    for (const c of masks) {
      let ratio = Infinity;
      for (const i of c.pixels) {
        const luminance = (/** @type {Float32Array} */ data) =>
          0.2126 * Number(data[i]) +
          0.7152 * Number(data[i + 1]) +
          0.0722 * Number(data[i + 2]);
        const x = luminance(picture.data),
          y = luminance(background.data);
        ratio = Math.min(
          ratio,
          (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
        );
      }
      contrast.push([c.id, ratio]);
    }
    return { picture, contrast };
  } finally {
    renderer.captureContrast = false;
    renderer.suppressText = false;
    renderer.useCompositor = originalCompositor;
  }
}
/** @param {string} video @param {import('./frame.js').FrameRenderer} renderer @param {NonNullable<ReturnType<typeof accessibilityRequirements>>} config @param {number} start @param {number} end @param {number} fps
 * @param {Map<number,Array<[string,number]>>} [contrast] per-frame text contrast measured while the frames were rendered (see contrastFrame); frames it lacks are measured here */
export async function accessibilityReport(
  video,
  renderer,
  config,
  start,
  end,
  fps,
  contrast,
) {
  /** @type {Array<{check:string,message:string,severity:string,time?:number}>} */ const findings =
    [];
  let flash;
  if (config.flashCheck !== "off") {
    const width = 192,
      height = Math.max(
        1,
        Math.round((renderer.height / renderer.width) * width),
      );
    flash = await flashAnalysisStream(video, width, height, fps);
    for (const f of flash.findings)
      findings.push({
        check: "flash",
        message: `More than three flashes/second across ${(f.area * 100).toFixed(1)}% of a reference viewport`,
        severity: config.flashCheck,
        time: f.time,
      });
  }
  if (config.contrastCheck !== "off") {
    const seen = new Set();
    for (let f = Math.round(start * fps); f < Math.round(end * fps); f++)
      for (const [id, ratio] of contrast?.get(f) ??
        contrastFrame(renderer, f / fps).contrast)
        if (ratio < config.minContrast && !seen.has(id)) {
          seen.add(id);
          findings.push({
            check: "contrast",
            message: `${id}: ${ratio.toFixed(2)}:1 < ${config.minContrast}:1`,
            severity: config.contrastCheck,
            time: f / fps - start,
          });
        }
  }
  return {
    configuration: config,
    interval: { start, end },
    flash,
    findings,
    passed: !findings.some((f) => f.severity === "error"),
  };
}
