/** Causal 1024-sample RMS of the placed source, before effects and bus gain. */
import { execFileSync } from "node:child_process";
import { clocks } from "../eval/clock.js";
import { join } from "node:path";
/** @param {import('../xsd/validate.js').ValidNode} scene @param {string} base */
export function createAudioAnalysis(scene, base) {
  const timeline = clocks(scene);
  const assets = new Map(
    (scene.children.find((n) => n.name === "assets")?.children ?? []).map(
      (n) => [String(n.attributes.id), n],
    ),
  );
  const tracks = new Map(
    (scene.children.find((n) => n.name === "audioMix")?.children ?? [])
      .filter((n) => n.name === "audioTrack")
      .map((n) => [String(n.attributes.id), n]),
  );
  /** @type {Map<string,Float64Array>} */ const cache = new Map();
  /** @param {string} id @param {number} time @param {string} band */
  return (id, time, band) => {
    if (!["all", "low", "mid", "high"].includes(band))
      throw new Error(`unknown audio band ${band}`);
    const track = tracks.get(id),
      asset = assets.get(String(track?.attributes.asset ?? id));
    if (!asset || !["audio", "video"].includes(asset.name))
      throw new Error(`unknown audio source ${id}`);
    const key = `${String(asset.attributes.id)}:${band}`;
    let prefix = cache.get(key);
    if (!prefix) {
      const filters =
        band === "low"
          ? ["lowpass=f=250"]
          : band === "mid"
            ? ["highpass=f=250", "lowpass=f=4000"]
            : band === "high"
              ? ["highpass=f=4000"]
              : [];
      const pcm = execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          join(base, String(asset.attributes.src)),
          "-map",
          `0:a:${Number(asset.attributes.audioStream ?? 0)}`,
          ...(filters.length ? ["-af", filters.join(",")] : []),
          "-ac",
          "1",
          "-ar",
          "48000",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { maxBuffer: 1 << 29 },
      );
      prefix = new Float64Array(pcm.length / 4 + 1);
      for (let i = 0; i < pcm.length / 4; i++) {
        const sample = pcm.readFloatLE(i * 4);
        prefix[i + 1] = Number(prefix[i]) + sample * sample;
      }
      cache.set(key, prefix);
    }
    const a = track?.attributes,
      start = track ? (timeline.spans.get(track)?.start ?? 0) : 0,
      clipIn = Number(a?.clipIn ?? 0),
      sourceTime = time - start + clipIn;
    if (
      time < start ||
      sourceTime >= (prefix.length - 1) / 48000 ||
      sourceTime >= Number(a?.clipOut ?? Infinity)
    )
      return 0;
    const end = Math.min(
        prefix.length - 1,
        Math.max(0, Math.floor(sourceTime * 48000)),
      ),
      first = Math.max(0, end - 1024);
    if (end === first) return 0;
    return Math.sqrt(
      (Number(prefix[end]) - Number(prefix[first])) / (end - first),
    );
  };
}
