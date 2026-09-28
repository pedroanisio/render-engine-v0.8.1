import { writeFileSync } from "node:fs";
import { timecode } from "../eval/clock.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {string} s */
const escape = (s) => s.replace(/[\\=;#\n]/g, (c) => "\\" + c);
/** @param {Node} scene @param {number} start @param {number} end @param {string} file */
export function metadataFile(scene, start, end, file) {
  const meta = scene.children.find((n) => n.name === "metadata");
  const lines = [";FFMETADATA1"];
  for (const [k, v] of Object.entries(meta?.attributes ?? {}))
    lines.push(`${escape(k)}=${escape(String(v))}`);
  for (const n of meta?.children ?? [])
    if (n.name === "meta")
      lines.push(
        `${escape(String(n.attributes.name))}=${escape(String(n.attributes.value))}`,
      );
  const credits = (
    scene.children.find((n) => n.name === "assets")?.children ?? []
  )
    .filter((n) => n.attributes.credit || n.attributes.license)
    .map(
      (n) =>
        `${n.attributes.id}: ${n.attributes.credit ?? ""} (${n.attributes.license ?? ""})`,
    );
  if (credits.length) lines.push(`credits=${escape(credits.join("; "))}`);
  const markers = (
    scene.children.find((n) => n.name === "markers")?.children ?? []
  )
    // Only chapter markers are chapters (schema default kind is "cue"); an open
    // chapter runs to the next chapter marker, not to the next cue/beat/comment.
    .filter((n) => n.name === "marker" && n.attributes.kind === "chapter")
    .sort((a, b) => Number(a.attributes.time) - Number(b.attributes.time));
  markers.forEach((n, i) => {
    const t = Number(n.attributes.time),
      stop =
        Number(n.attributes.duration) > 0
          ? t + Number(n.attributes.duration)
          : Number(markers[i + 1]?.attributes.time ?? end);
    if (stop <= start || t >= end) return;
    lines.push(
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${Math.round((Math.max(t, start) - start) * 1000)}`,
      `END=${Math.round((Math.min(stop, end) - start) * 1000)}`,
      `title=${escape(String(n.attributes.label ?? n.attributes.id))}`,
    );
  });
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

/** SMPTE timecode rebased for an export range. `HH:MM:SS:FF` is non-drop-frame;
 * `HH:MM:SS;FF` is drop-frame (29.97/59.94) and keeps its `;` separator.
 * @param {string} code @param {number} seconds @param {number} fps */
export function offsetTimecode(code, seconds, fps) {
  const m = /^\d+:[0-5]\d:[0-5]\d([:;])\d+$/.exec(code);
  if (!m) throw new Error(`invalid timecode ${code}`);
  const dropFrame = m[1] === ";",
    nominal = Math.round(fps),
    drop = nominal / 15;
  // timecode() validates frame labels and removes dropped labels for DF.
  let frames =
    Math.round(timecode(code, fps) * fps) + Math.round(seconds * fps);
  if (frames < 0) throw new Error(`timecode ${code} offset is negative`);
  if (dropFrame) {
    const perMinute = nominal * 60 - drop,
      perTen = perMinute * 10 + drop,
      tens = Math.floor(frames / perTen),
      rest = frames % perTen;
    frames +=
      drop * 9 * tens +
      (rest > drop ? drop * Math.floor((rest - drop) / perMinute) : 0);
  }
  const f = frames % nominal;
  frames = Math.floor(frames / nominal);
  const s = frames % 60;
  frames = Math.floor(frames / 60);
  const mm = frames % 60;
  const h = Math.floor(frames / 60);
  return (
    [h, mm, s].map((n) => String(n).padStart(2, "0")).join(":") +
    (dropFrame ? ";" : ":") +
    String(f).padStart(2, "0")
  );
}
