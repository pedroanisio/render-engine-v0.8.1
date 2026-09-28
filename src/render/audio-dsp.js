/** Stateful offline DSP. All scalar controls are evaluated on the sample clock. */
import { execFileSync } from "node:child_process";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {(node:Node, key:string, time:number, fallback?:number)=>number} Control */
export const audioEffectTypes = new Set(
  "eq highpass lowpass compressor limiter gate de-esser reverb delay chorus pitch-shift noise-reduction stereo-width gain distortion telephone".split(
    " ",
  ),
);
/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** @param {number} x */
export const db = (x) => 10 ** (x / 20);
/** @param {Float32Array} pcm */
export function pcmBytes(pcm) {
  const out = Buffer.alloc(pcm.length * 4);
  for (let i = 0; i < pcm.length; i++) out.writeFloatLE(Number(pcm[i]), i * 4);
  return out;
}
/** @param {Buffer} raw */
export function fromBytes(raw) {
  return Float32Array.from({ length: raw.length / 4 }, (_, i) =>
    raw.readFloatLE(i * 4),
  );
}
/** @param {Float32Array} pcm @param {number} rate @param {number} channels @param {string} filter */
export function filterPcm(pcm, rate, channels, filter) {
  return fromBytes(
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "f32le",
        "-ar",
        String(rate),
        "-ac",
        String(channels),
        "-i",
        "pipe:0",
        "-af",
        filter,
        "-ar",
        String(rate),
        "-ac",
        String(channels),
        "-f",
        "f32le",
        "pipe:1",
      ],
      { input: pcmBytes(pcm), maxBuffer: 1 << 30 },
    ),
  );
}
/** RBJ biquad coefficients. @param {string} kind @param {number} f @param {number} gain @param {number} q @param {number} rate */
export function biquad(kind, f, gain, q, rate) {
  const w = (2 * Math.PI * clamp(f, 1, rate * 0.499)) / rate,
    c = Math.cos(w),
    s = Math.sin(w),
    alpha = s / (2 * Math.max(0.001, q)),
    A = db(gain / 2),
    r = 2 * Math.sqrt(A) * alpha;
  let b0, b1, b2, a0, a1, a2;
  if (kind === "lowpass")
    [b0, b1, b2, a0, a1, a2] = [
      (1 - c) / 2,
      1 - c,
      (1 - c) / 2,
      1 + alpha,
      -2 * c,
      1 - alpha,
    ];
  else if (kind === "highpass")
    [b0, b1, b2, a0, a1, a2] = [
      (1 + c) / 2,
      -1 - c,
      (1 + c) / 2,
      1 + alpha,
      -2 * c,
      1 - alpha,
    ];
  else if (kind === "notch")
    [b0, b1, b2, a0, a1, a2] = [1, -2 * c, 1, 1 + alpha, -2 * c, 1 - alpha];
  else if (kind === "low-shelf")
    [b0, b1, b2, a0, a1, a2] = [
      A * (A + 1 - (A - 1) * c + r),
      2 * A * (A - 1 - (A + 1) * c),
      A * (A + 1 - (A - 1) * c - r),
      A + 1 + (A - 1) * c + r,
      -2 * (A - 1 + (A + 1) * c),
      A + 1 + (A - 1) * c - r,
    ];
  else if (kind === "high-shelf")
    [b0, b1, b2, a0, a1, a2] = [
      A * (A + 1 + (A - 1) * c + r),
      -2 * A * (A - 1 + (A + 1) * c),
      A * (A + 1 + (A - 1) * c - r),
      A + 1 - (A - 1) * c + r,
      2 * (A - 1 - (A + 1) * c),
      A + 1 - (A - 1) * c - r,
    ];
  else
    [b0, b1, b2, a0, a1, a2] = [
      1 + alpha * A,
      -2 * c,
      1 - alpha * A,
      1 + alpha / A,
      -2 * c,
      1 - alpha / A,
    ];
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** @param {Float32Array} input @param {Node} node @param {number} rate @param {number} channels @param {Control} control @param {Float32Array} [sidechain] */
export function effect(input, node, rate, channels, control, sidechain) {
  const type = String(node.attributes.type);
  const accepted = /** @type {Record<string,string>} */ ({
    eq: "",
    highpass: "frequency",
    lowpass: "frequency",
    compressor: "threshold ratio attack release knee gain",
    limiter: "threshold attack release knee gain",
    gate: "threshold ratio attack release knee gain",
    "de-esser": "frequency threshold ratio attack release knee amount",
    reverb: "roomSize",
    delay: "time feedback",
    chorus: "time feedback frequency amount",
    "pitch-shift": "semitones",
    "noise-reduction": "threshold amount",
    "stereo-width": "width",
    gain: "gain",
    distortion: "amount gain",
    telephone: "",
  });
  for (const param of node.children.filter((n) => n.name === "param"))
    if (
      !("enabled mix " + String(accepted[type] ?? ""))
        .split(" ")
        .includes(String(param.attributes.name))
    )
      throw new Error(
        `unsupported ${type} parameter ${String(param.attributes.name)}`,
      );

  if (!audioEffectTypes.has(type))
    throw new Error(`unknown audio effect ${type}`);
  if (
    node.attributes.enabled === false &&
    !node.children.some(
      (n) =>
        ["animate", "expression", "link"].includes(n.name) &&
        n.attributes.property === "enabled",
    )
  )
    return input.slice();
  const at = (
    /** @type {string} */ k,
    /** @type {number} */ t,
    /** @type {number} */ v,
  ) => {
    const result = control(node, k, t, v);
    if (!Number.isFinite(result)) throw new Error("non-finite DSP control");
    return result;
  };
  const frames = input.length / channels,
    wet = new Float32Array(input.length);
  if (type === "pitch-shift" || type === "noise-reduction") {
    // Spectral processors use FFmpeg's maintained implementations. Command resolution is 128 samples.
    const pitch = type === "pitch-shift",
      name = pitch ? "rubberband" : "afftdn",
      commands = [];
    let last = "";
    for (let i = 0; i < frames; i += 128) {
      const t = i / rate,
        values = pitch
          ? `pitch ${2 ** (at("semitones", t, 0) / 12)}`
          : `nr ${Math.max(0.01, at("amount", t, 0.5) * 48)}, afftdn nf ${clamp(at("threshold", t, -50), -80, -20)}`;
      if (values !== last) {
        commands.push(`${t.toFixed(9)} ${name} ${values}`);
        last = values;
      }
    }
    const f = pitch
      ? "rubberband=pitch=1:channels=together"
      : `afftdn=nf=${clamp(at("threshold", 0, -50), -80, -20)}`;
    const processed = filterPcm(
      input,
      rate,
      channels,
      `asetnsamples=n=128:p=0,asendcmd=c='${commands.join(";")}',${f}`,
    );
    wet.set(processed.subarray(0, wet.length));
  } else {
    const bands =
      type === "eq"
        ? node.children
            .filter((n) => n.name === "band")
            .map((n) => n.attributes)
        : type === "telephone"
          ? [
              { kind: "highpass", frequency: 300 },
              { kind: "lowpass", frequency: 3400 },
            ]
          : [
              {
                kind: type === "de-esser" ? "highpass" : type,
                frequency: type === "de-esser" ? 6000 : 1000,
              },
            ];
    const state = bands.map(() => new Float64Array(channels * 2));
    /** @type {Array<{key:string,value:number[]}>} */ const coefficientCache =
      [];
    const taps = type === "reverb" ? [0.0297, 0.0371, 0.0411, 0.0437] : [1];
    const dynamicDelay = node.children.some(
      (n) =>
        ["animate", "expression", "link"].includes(n.name) &&
        n.attributes.property === "time",
    );
    const maxDelay =
      type === "reverb"
        ? 0.105
        : at("time", 0, type === "chorus" ? 0.025 : 0.25) +
          (type === "chorus" ? 0.008 : 0);
    const delaySize = Math.max(
      3,
      Math.min(
        frames + 2,
        Math.ceil((dynamicDelay ? frames / rate : maxDelay) * rate) + 2,
      ),
    );
    const delays = ["delay", "reverb", "chorus"].includes(type)
      ? taps.map(() => new Float32Array(delaySize * channels))
      : [];
    let envelope = 0,
      reduction = type === "gate" ? 0 : 1;
    for (let i = 0; i < frames; i++) {
      const t = i / rate,
        offset = i * channels,
        attack = at("attack", t, 0.01),
        release = at("release", t, 0.1),
        threshold = at("threshold", t, -18),
        ratio = Math.max(1, at("ratio", t, 4)),
        knee = Math.max(0, at("knee", t, 3));
      const isFilter = [
        "eq",
        "highpass",
        "lowpass",
        "telephone",
        "de-esser",
      ].includes(type);
      const coeff = isFilter
        ? bands.map((b, j) => {
            const kind = String(b.kind ?? "peak"),
              f = Number(
                type === "eq" || type === "telephone"
                  ? b.frequency
                  : at("frequency", t, Number(b.frequency)),
              ),
              g = Number(b.gain ?? at("gain", t, 0)),
              q = Number(b.q ?? 0.707),
              key = `${kind}:${f}:${g}:${q}`;
            if (coefficientCache[j]?.key !== key)
              coefficientCache[j] = { key, value: biquad(kind, f, g, q, rate) };
            return /** @type {{value:number[]}} */ (coefficientCache[j]).value;
          })
        : [];
      let peak = 0;
      for (let c = 0; c < channels; c++) {
        let x = Number(input[offset + c]);
        for (let j = 0; j < coeff.length; j++) {
          const b = /** @type {number[]} */ (coeff[j]),
            z = /** @type {Float64Array} */ (state[j]);
          const y = Number(b[0]) * x + Number(z[c * 2]);
          z[c * 2] = Number(b[1]) * x - Number(b[3]) * y + Number(z[c * 2 + 1]);
          z[c * 2 + 1] = Number(b[2]) * x - Number(b[4]) * y;
          x = y;
        }
        wet[offset + c] = x;
        peak = Math.max(
          peak,
          Math.abs(
            Number(
              sidechain?.[offset + c] ??
                (type === "de-esser" ? x : input[offset + c]),
            ),
          ),
        );
      }
      const smoothing = (/** @type {number} */ seconds) =>
        seconds <= 0 ? 0 : Math.exp(-1 / (seconds * rate));
      const detector = smoothing(peak > envelope ? attack : release);
      envelope = detector * envelope + (1 - detector) * peak;
      const over = 20 * Math.log10(Math.max(1e-12, envelope)) - threshold;
      let target = 1;
      if (type === "gate")
        target = db(
          knee > 0 && Math.abs(over) < knee / 2
            ? (-(ratio - 1) * (over - knee / 2) ** 2) / (2 * knee)
            : Math.min(0, over) * (ratio - 1),
        );
      else if (["compressor", "limiter", "de-esser"].includes(type)) {
        const slope = type === "limiter" ? -1 : 1 / ratio - 1;
        target = db(
          knee > 0 && Math.abs(over) < knee / 2
            ? (slope * (over + knee / 2) ** 2) / (2 * knee)
            : slope * Math.max(0, over),
        );
      }
      // Compressors attack as gain falls; a gate attacks as it opens (gain rises).
      const smooth = smoothing(
        (type === "gate" ? target > reduction : target < reduction)
          ? attack
          : release,
      );
      reduction = smooth * reduction + (1 - smooth) * target;
      for (let c = 0; c < channels; c++) {
        const x = Number(input[offset + c]);
        let y = Number(wet[offset + c]);
        if (type === "gain") y = x * db(at("gain", t, 0));
        else if (["compressor", "gate", "limiter"].includes(type))
          y = x * reduction * db(at("gain", t, 0));
        else if (type === "de-esser")
          y = x - y * (1 - reduction) * at("amount", t, 0.5);
        else if (type === "distortion") {
          const amount = at("amount", t, 0.5),
            drive = 1 + amount * 40;
          y =
            (x * (1 - amount) +
              (Math.tanh(x * drive) / Math.tanh(drive)) * amount) *
            db(at("gain", t, 0));
        } else if (type === "stereo-width" && channels >= 2 && c < 2) {
          const l = Number(input[offset]),
            r = Number(input[offset + 1]);
          y =
            (l + r) / 2 +
            (((c === 0 ? 1 : -1) * (l - r)) / 2) * at("width", t, 1);
        } else if (delays.length) {
          y = 0;
          for (let j = 0; j < delays.length; j++) {
            const room = at("roomSize", t, 0.5),
              time =
                type === "reverb"
                  ? Number(taps[j]) * (0.4 + room * 2)
                  : at("time", t, type === "chorus" ? 0.025 : 0.25);
            const modulation =
              type === "chorus"
                ? Math.sin(
                    2 * Math.PI * at("frequency", t, 0.8) * t + c * Math.PI,
                  ) *
                  0.008 *
                  at("amount", t, 0.5)
                : 0;
            const delay = clamp((time + modulation) * rate, 1, delaySize - 2),
              pos = (i - delay + delaySize) % delaySize,
              k = Math.floor(pos),
              f = pos - k,
              buffer = /** @type {Float32Array} */ (delays[j]);
            const echo =
              Number(buffer[k * channels + c]) * (1 - f) +
              Number(buffer[((k + 1) % delaySize) * channels + c]) * f;
            buffer[(i % delaySize) * channels + c] =
              x +
              echo *
                clamp(
                  type === "reverb"
                    ? 0.3 + room * 0.65
                    : at("feedback", t, 0.3),
                  0,
                  1,
                );
            y += echo / delays.length;
          }
        }
        wet[offset + c] = y;
      }
    }
  }
  const out = new Float32Array(input.length);
  for (let i = 0; i < frames; i++) {
    const t = i / rate,
      mix = at("enabled", t, 1) ? clamp(at("mix", t, 1), 0, 1) : 0;
    for (let c = 0; c < channels; c++) {
      const k = i * channels + c;
      out[k] = Number(input[k]) * (1 - mix) + Number(wet[k]) * mix;
      if (!Number.isFinite(out[k]))
        throw new Error(`non-finite DSP output: ${type}`);
    }
  }
  return out;
}
