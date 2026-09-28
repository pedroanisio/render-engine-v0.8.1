import { writeFileSync } from "node:fs";
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
    .filter((n) => n.name === "marker")
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

/** Non-drop-frame timecode rebased for an export range. @param {string} code @param {number} seconds @param {number} fps */
export function offsetTimecode(code, seconds, fps) {
  const [hh, mm, ss, ff] = code.split(":").map(Number),
    nominal = Math.round(fps);
  let frames =
    (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * nominal +
    Number(ff) +
    Math.round(seconds * fps);
  const f = frames % nominal;
  frames = Math.floor(frames / nominal);
  const s = frames % 60;
  frames = Math.floor(frames / 60);
  const m = frames % 60;
  const h = Math.floor(frames / 60);
  return [h, m, s, f].map((n) => String(n).padStart(2, "0")).join(":");
}
