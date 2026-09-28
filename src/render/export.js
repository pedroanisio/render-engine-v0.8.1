/** Output planning: explicit codec/container compatibility, no encoder fallback. */
import { execFileSync } from "node:child_process";
import { transferOf } from "./color-management.js";
/** @typedef {Record<string, import('../xsd/validate.js').ValidNode['attributes'][string]>} Attrs */
export const codecs =
  /** @type {Record<string,{encoder:string,containers:string[],pixel:string}>} */ ({
    h264: {
      encoder: "libx264",
      containers: ["mp4", "mov", "mkv"],
      pixel: "yuv420p",
    },
    h265: {
      encoder: "libx265",
      containers: ["mp4", "mov", "mkv"],
      pixel: "yuv420p10le",
    },
    ffv1: { encoder: "ffv1", containers: ["mkv"], pixel: "gbrp16le" },
    av1: {
      encoder: "libaom-av1",
      containers: ["mp4", "mkv", "webm"],
      pixel: "yuv420p",
    },
    vp9: {
      encoder: "libvpx-vp9",
      containers: ["webm", "mkv", "mp4"],
      pixel: "yuv420p",
    },
    prores: {
      encoder: "prores_ks",
      containers: ["mov", "mkv"],
      pixel: "yuv422p10le",
    },
    dnxhr: {
      encoder: "dnxhd",
      containers: ["mov", "mxf", "mkv"],
      pixel: "yuv422p",
    },
    gif: { encoder: "gif", containers: ["gif"], pixel: "pal8" },
    apng: { encoder: "apng", containers: ["apng"], pixel: "rgba" },
    webp: { encoder: "libwebp_anim", containers: ["webp"], pixel: "yuva420p" },
    "png-sequence": {
      encoder: "png",
      containers: ["image2"],
      pixel: "rgba64be",
    },
    "jpeg-sequence": {
      encoder: "mjpeg",
      containers: ["image2"],
      pixel: "yuvj444p",
    },
    "exr-sequence": {
      encoder: "exr",
      containers: ["image2"],
      pixel: "gbrapf32le",
    },
    "tiff-sequence": {
      encoder: "tiff",
      containers: ["image2"],
      pixel: "rgba64le",
    },
    "audio-only": {
      encoder: "",
      containers: ["wav", "m4a", "mp3", "mkv"],
      pixel: "",
    },
  });
/** @param {Attrs} a */
export function outputPlan(a) {
  const codec = String(a.codec),
    spec = codecs[codec];
  if (!spec) throw new Error(`Unknown output codec ${codec}`);
  const specified = new Set(
    Array.isArray(a.specifiedOutputAttributes)
      ? a.specifiedOutputAttributes
      : Object.keys(a),
  );
  const rateCodecs = ["h264", "h265", "vp9", "av1"];
  for (const [field, allowed] of Object.entries({
    preset: ["h264", "h265"],
    crf: rateCodecs,
    profile: [...rateCodecs, "dnxhr"],
    keyframeInterval: [...rateCodecs, "ffv1"],
  }))
    if (specified.has(field) && !allowed.includes(codec))
      throw new Error(`${field} is unavailable for ${codec}`);
  const container = String(a.container ?? spec.containers[0]);
  if (!spec.containers.includes(container))
    throw new Error(`${codec} cannot use container ${container}`);
  const sequence = codec.endsWith("-sequence"),
    animated = ["gif", "apng", "webp"].includes(codec),
    audioOnly = codec === "audio-only";
  const audio = !animated && !sequence && a.audio !== false;
  if ((animated || sequence) && specified.has("audio") && a.audio === true)
    throw new Error(`${codec} cannot carry audio`);
  if (
    specified.has("faststart") &&
    a.faststart === true &&
    !["mp4", "mov", "m4a"].includes(container)
  )
    throw new Error("faststart requires mp4/mov/m4a");
  if (audioOnly && !audio) throw new Error("audio-only requires audio=true");
  if (sequence && !/%(?:0\d+)?d/.test(String(a.path)))
    throw new Error("sequence path requires a printf frame number");
  let pixel = String(a.pixelFormat ?? spec.pixel);
  // The schema default is a video default; native formats need their own default.
  if (pixel === "yuv420p" && a.pixelFormatExplicit !== true) pixel = spec.pixel;
  if (a.alpha === true) {
    const alpha = /** @type {Record<string,string>} */ ({
      ffv1: "gbrap16le",
      prores: "yuva444p10le",
      vp9: "yuva420p",
      apng: "rgba",
      webp: "yuva420p",
      "png-sequence": "rgba64be",
      "tiff-sequence": "rgba64le",
      "exr-sequence": "gbrapf32le",
      gif: "pal8",
    });
    if (!alpha[codec]) throw new Error(`${codec} cannot preserve alpha`);
    if (a.pixelFormatExplicit !== true) pixel = alpha[codec];
    else if (
      !/^(?:yuva|gbrap|rgba|bgra|argb|abgr|ya|ayuv|vuya|pal8)/.test(pixel)
    )
      throw new Error("alpha requires an alpha-capable pixelFormat");
    if (
      codec === "prores" &&
      a.proresProfile &&
      !String(a.proresProfile).startsWith("4444")
    )
      throw new Error("ProRes alpha requires 4444 profile");
  }
  if (
    a.twoPass === true &&
    (!["h264", "h265", "vp9", "av1"].includes(codec) || !a.bitrate)
  )
    throw new Error("twoPass requires a bitrate and h264/h265/vp9/av1");
  if (
    (a.maxCLL !== undefined ||
      a.maxFALL !== undefined ||
      a.masteringDisplay !== undefined) &&
    codec !== "h265"
  )
    throw new Error("HDR static metadata requires h265");
  if (["pq", "hlg"].includes(String(a.transfer)) && !/10|12|16|f32/.test(pixel))
    throw new Error("HDR requires a high bit-depth pixel format");
  if (a.captions && (sequence || animated || audioOnly || container === "mxf"))
    throw new Error("Embedded captions are unavailable in this output");
  if (
    codec === "exr-sequence" &&
    !["auto", "linear"].includes(String(a.transfer ?? "auto"))
  )
    throw new Error("EXR export requires scene-linear transfer");
  if (a.proresProfile !== undefined && codec !== "prores")
    throw new Error("proresProfile requires prores");
  for (const key of ["maxBitrate", "bufferSize"])
    if (a[key] !== undefined && !["h264", "h265", "vp9", "av1"].includes(codec))
      throw new Error(`${key} requires a rate-controlled video codec`);
  if (a.level !== undefined && !["h264", "h265", "vp9", "av1"].includes(codec))
    throw new Error("level requires h264/h265/vp9/av1");
  if (a.loopCount !== undefined && Number(a.loopCount) !== 0 && !animated)
    throw new Error("loopCount requires an animated image");
  if (
    a.bitrate !== undefined &&
    !["h264", "h265", "vp9", "av1"].includes(codec)
  )
    throw new Error(
      "bitrate requires a rate-controlled video codec; use audioBitrate for audio",
    );
  if (a.bFrames !== undefined && !["h264", "h265"].includes(codec))
    throw new Error("bFrames requires h264 or h265");
  if (
    String(a.audioLayout ?? "").startsWith("ambisonic") &&
    audio &&
    !(String(a.audioCodec) === "libopus" && ["mkv", "webm"].includes(container))
  )
    throw new Error(
      "Ambisonic delivery requires libopus in mkv/webm (ACN/SN3D mapping family 2)",
    );
  if (
    a.masteringDisplay !== undefined &&
    !/^G\(\d+,\d+\)B\(\d+,\d+\)R\(\d+,\d+\)WP\(\d+,\d+\)L\(\d+,\d+\)$/.test(
      String(a.masteringDisplay),
    )
  )
    throw new Error(
      "Invalid masteringDisplay: expected x265 G()B()R()WP()L() notation",
    );
  return {
    codec,
    encoder: spec.encoder,
    container,
    sequence,
    animated,
    audioOnly,
    audio,
    pixel,
  };
}
/** @param {Attrs} a @param {number} fps @param {number} duration @param {number} width @param {number} height */
export function videoArguments(a, fps, duration, width, height) {
  const p = outputPlan(a);
  if (p.audioOnly) return [];
  if (/420/.test(p.pixel) && (width % 2 || height % 2))
    throw new Error(
      `${p.pixel} requires even width and height; dimensions are never cropped`,
    );
  if (/422/.test(p.pixel) && width % 2)
    throw new Error(`${p.pixel} requires even width`);
  if (p.codec === "dnxhr" && (width < 256 || height < 120))
    throw new Error("DNxHR requires at least 256x120");
  const args = [
    "-c:v",
    p.encoder,
    "-threads",
    "1",
    "-pix_fmt",
    p.pixel,
    "-r",
    String(fps),
    "-g",
    String(Math.max(1, Math.round(Number(a.keyframeInterval ?? 2) * fps))),
  ];
  const rateCodecs = ["h264", "h265", "vp9", "av1"];
  if (rateCodecs.includes(p.codec)) {
    const budget =
      a.maxFileSize === undefined
        ? undefined
        : Math.floor(
            (Number(a.maxFileSize) * 8 * 0.94) / duration -
              (p.audio ? Number(a.audioBitrate ?? 192000) : 0),
          );
    if (budget !== undefined && budget < 1000)
      throw new Error("maxFileSize cannot fit audio and container overhead");
    const bitrate =
      budget === undefined
        ? a.bitrate
        : Math.min(Number(a.bitrate ?? Infinity), budget);
    args.push(
      ...(bitrate ? ["-b:v", String(bitrate)] : ["-crf", String(a.crf ?? 18)]),
    );
    if (["h264", "h265"].includes(p.codec))
      args.push("-preset", String(a.preset ?? "medium"));
    if (p.codec === "av1") args.push("-cpu-used", "6");
    if (p.codec === "vp9") args.push("-auto-alt-ref", "0");
  } else if (a.maxFileSize)
    throw new Error("maxFileSize bitrate targeting requires h264/h265/vp9/av1");
  for (const [key, flag] of Object.entries({
    maxBitrate: "-maxrate",
    bufferSize: "-bufsize",
    bFrames: "-bf",
    level: "-level:v",
  }))
    if (a[key] !== undefined) args.push(flag, String(a[key]));
  if (p.codec === "prores")
    args.push(
      "-profile:v",
      String(
        ["proxy", "lt", "422", "hq", "4444", "4444xq"].indexOf(
          String(a.proresProfile ?? (a.alpha ? "4444" : "hq")),
        ),
      ),
    );
  else if (p.codec === "dnxhr")
    args.push("-profile:v", String(a.profile ?? "dnxhr_hq"));
  else if (a.profile !== undefined) args.push("-profile:v", String(a.profile));
  if (p.codec === "h265") {
    const params = ["pools=1", "frame-threads=1"];
    if (a.maxCLL !== undefined || a.maxFALL !== undefined)
      params.push(`max-cll=${a.maxCLL ?? 0},${a.maxFALL ?? 0}`);
    if (a.masteringDisplay !== undefined)
      params.push(`master-display=${a.masteringDisplay}`);
    args.push("-x265-params", params.join(":"));
  }
  if (p.codec === "apng") args.push("-plays", String(a.loopCount ?? 0));
  if (["gif", "webp"].includes(p.codec))
    args.push("-loop", String(a.loopCount ?? 0));
  return args;
}
/** @param {Attrs} a */
export function colorArguments(a) {
  const prim = /** @type {Record<string,string>} */ ({
    srgb: "bt709",
    "linear-srgb": "bt709",
    rec709: "bt709",
    rec2020: "bt2020",
    "display-p3": "smpte432",
    "dci-p3": "smpte431",
  });
  // Tag the transfer encode16 actually applies. Pure gamma 2.6 (DCI-P3; ST 428-1
  // adds a 48/52.37 scale), ACEScc/cct and camera logs have no H.273 value, so
  // they stay untagged rather than claiming sRGB.
  const trc = /** @type {Record<string,string>} */ ({
    srgb: "iec61966-2-1",
    linear: "linear",
    bt1886: "bt709",
    gamma22: "gamma22",
    pq: "smpte2084",
    hlg: "arib-std-b67",
  });
  const space = String(a.colorSpace ?? "srgb"),
    transfer = String(a.transfer ?? "auto");
  const args = ["-color_range", a.colorRange === "full" ? "pc" : "tv"];
  if (prim[space]) args.push("-color_primaries", prim[space]);
  const t = trc[transfer === "auto" ? transferOf(space) : transfer];
  if (t) args.push("-color_trc", t);
  args.push("-colorspace", space === "rec2020" ? "bt2020nc" : "bt709");
  return args;
}
/** Check installed backend before rendering. @param {Attrs} a */
export function encoderPreflight(a) {
  const p = outputPlan(a);
  const version = execFileSync("ffmpeg", ["-version"], {
    encoding: "utf8",
  }).trim();
  if (p.encoder) {
    const help = execFileSync(
      "ffmpeg",
      ["-hide_banner", "-h", `encoder=${p.encoder}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (!help.includes(`Encoder ${p.encoder} `))
      throw new Error(`Encoder ${p.encoder} is unavailable`);
    const formats = help
      .match(/Supported pixel formats: (.*)/)?.[1]
      ?.split(" ");
    if (formats && !formats.includes(p.pixel))
      throw new Error(`${p.encoder} does not support pixelFormat=${p.pixel}`);
  }
  return version;
}
/** @param {Attrs} a */
export function audioArguments(a) {
  const p = outputPlan(a);
  if (!p.audio) return [];
  let codec = String(a.audioCodec ?? "aac");
  if (codec === "aac")
    codec =
      p.container === "wav"
        ? `pcm_s${a.audioBitDepth ?? 24}le`
        : p.container === "mp3"
          ? "libmp3lame"
          : p.container === "webm"
            ? "libopus"
            : p.container === "mxf"
              ? "pcm_s24le"
              : "aac";
  return [
    "-c:a",
    codec,
    ...(a.audioSampleRate ? ["-ar", String(a.audioSampleRate)] : []),
    ...(a.audioChannels ? ["-ac", String(a.audioChannels)] : []),
    ...(String(a.audioLayout ?? "").startsWith("ambisonic")
      ? [
          "-channel_layout",
          String(a.audioLayout).replace("-", " "),
          "-mapping_family",
          "2",
          "-af",
          `aformat=sample_fmts=flt,channelmap=map=${Array.from({ length: Number(a.audioChannels ?? 4) }, (_, i) => i).join("|")}:channel_layout=${String(a.audioLayout).replace("-", " ")}`,
        ]
      : []),
    ...(codec.startsWith("pcm_")
      ? []
      : ["-b:a", String(a.audioBitrate ?? 192000)]),
  ];
}

/** Validate arbitrary encoder options against the installed backend, before scene frames.
 * @param {Attrs} a @param {number} fps @param {number} duration @param {number} width @param {number} height @param {string} work */
export function checkEncoding(a, fps, duration, width, height, work) {
  const p = outputPlan(a);
  const ext = p.sequence ? String(a.path).split(".").at(-1) : p.container;
  const file = `${work}/probe-${p.sequence ? "%06d." : ""}${ext}`;
  const args = [
    "-v",
    "error",
    "-y",
    ...(!p.audioOnly
      ? ["-f", "lavfi", "-i", `color=size=${width}x${height}:rate=${fps}`]
      : []),
    ...(p.audio
      ? [
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=${a.audioSampleRate ?? 48000}:cl=${a.audioLayout && a.audioLayout !== "auto" ? String(a.audioLayout).replace("-", " ") : a.audioChannels ? String(a.audioChannels) + "c" : "stereo"}`,
        ]
      : []),
    ...(!p.audioOnly
      ? ["-frames:v", "1", ...videoArguments(a, fps, duration, width, height)]
      : []),
    ...audioArguments(a),
    "-t",
    "0.05",
    "-f",
    p.container === "mkv"
      ? "matroska"
      : p.container === "m4a"
        ? "ipod"
        : p.container,
    file,
  ];
  try {
    execFileSync("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 1 << 20,
    });
  } catch (e) {
    throw new Error(
      `Output backend preflight failed: ${String(/** @type {{stderr?:unknown}} */ (e).stderr ?? e)}`,
    );
  }
}

/** x265 needs its native statistics controls: FFmpeg's generic pass log is empty.
 * @param {string} codec @param {number} pass @param {string} work @param {string[]} encoderArgs */
export function passArguments(codec, pass, work, encoderArgs) {
  if (codec === "h265") {
    const stats = (work + "/x265.stats").replace(/[\\:']/g, (c) => "\\" + c);
    const params = encoderArgs[encoderArgs.indexOf("-x265-params") + 1];
    return ["-x265-params", `${params}:pass=${pass}:stats=${stats}`];
  }
  return ["-pass", String(pass), "-passlogfile", work + "/pass"];
}
