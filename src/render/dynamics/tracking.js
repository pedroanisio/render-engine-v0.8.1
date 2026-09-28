/** Imported motion tracks use seconds internally; frame-based formats use project FPS. */
import { fbxTracking } from "./fbx.js";
import { createHash } from "node:crypto";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @typedef {{time:number,[key:string]:any}} Key */
/** @param {string} text @param {string} format @param {number} fps @returns {Key[]} */
export function parseTracking(text, format, fps) {
  /** @type {Key[]} */ let keys = [];
  if (format === "json") {
    const data = JSON.parse(text);
    keys = Array.isArray(data) ? data : (data.frames ?? data.keys);
    if (!Array.isArray(keys)) throw new Error("tracking JSON requires frames");
    keys = keys.map((k) => ({ ...k, time: k.time ?? Number(k.frame) / fps }));
  } else if (format === "csv") {
    const lines = text.trim().split(/\r?\n/),
      header = String(lines.shift())
        .split(",")
        .map((s) => s.trim());
    if (!header.includes("time") && !header.includes("frame"))
      throw new Error("tracking CSV needs time or frame");
    keys = lines.filter(Boolean).map((line) => {
      const values = line.split(",").map(Number);
      if (values.length !== header.length)
        throw new Error("tracking CSV column count");
      const k = Object.fromEntries(
        header.map((h, i) => [h, Number(values[i])]),
      );
      return { ...k, time: k.time ?? Number(k.frame) / fps };
    });
  } else if (format === "nuke") {
    // Nuke .chan: frame tx ty tz rx ry rz [verticalFov].
    keys = text
      .split(/\r?\n/)
      .filter((s) => s.trim() && !s.trim().startsWith("#"))
      .map((line) => {
        const v = line.trim().split(/\s+/).map(Number);
        if (v.length !== 8 && v.length !== 7)
          throw new Error("Nuke .chan requires 7 or 8 columns");
        return {
          time: Number(v[0]) / fps,
          x: v[1],
          y: v[2],
          z: v[3],
          pitch: v[4],
          yaw: v[5],
          roll: v[6],
          ...(v.length === 8 ? { fov: v[7] } : {}),
        };
      });
  } else if (format === "after-effects" || format === "mocha") {
    /** @type {Map<number,Key>} */ const frames = new Map();
    let channel = "Position";
    let rate = fps;
    for (const line of text.split(/\r?\n/)) {
      const rateMatch = /Units Per Second\s+([\d.]+)/i.exec(line);
      if (rateMatch) {
        rate = Number(rateMatch[1]);
        continue;
      }
      if (
        /Position|Scale|Rotation|Upper Left|Upper Right|Lower Right|Lower Left/i.test(
          line,
        ) &&
        !/^\s*\d/.test(line)
      ) {
        channel = line.trim();
        continue;
      }
      if (!/^\s*-?\d+(?:\.\d+)?\s/.test(line)) continue;
      const v = line
          .trim()
          .split(/[\s,]+/)
          .map(Number),
        frame = Number(v.shift());
      if (v.some((x) => !Number.isFinite(x)))
        throw new Error("invalid tracking key");
      const key = frames.get(frame) ?? { time: frame / rate };
      if (/Scale/i.test(channel)) {
        key.scaleX = Number(v[0]) / 100;
        key.scaleY = Number(v[1]) / 100;
      } else if (/Rotation/i.test(channel)) key.rotation = Number(v.at(-1));
      else if (/Upper|Lower/.test(channel)) {
        const index = /Upper Left/.test(channel)
          ? 0
          : /Upper Right/.test(channel)
            ? 1
            : /Lower Right/.test(channel)
              ? 2
              : 3;
        key.points ??= {};
        key.points[String(index)] = { x: v[0], y: v[1] };
      } else if (v.length === 8) {
        key.points = Object.fromEntries(
          [0, 1, 2, 3].map((i) => [
            String(i),
            { x: v[i * 2], y: v[i * 2 + 1] },
          ]),
        );
        key.x = v[0];
        key.y = v[1];
      } else {
        key.x = v[0];
        key.y = v[1];
        if (v.length > 2) key.z = v[2];
      }
      frames.set(frame, key);
    }
    keys = [...frames.values()];
  } else throw new Error(`tracking format ${format} is not implemented`);
  const finite = (/** @type {any} */ v) =>
    typeof v === "number"
      ? Number.isFinite(v)
      : v && typeof v === "object"
        ? Object.values(v).every(finite)
        : typeof v === "string";
  if (!keys.length || keys.some((k) => !Number.isFinite(k.time) || !finite(k)))
    throw new Error("invalid or empty tracking data");
  keys.sort((a, b) => a.time - b.time);
  if (keys.some((k, i) => i > 0 && k.time === keys[i - 1]?.time))
    throw new Error("duplicate tracking timestamp");
  return keys;
}
/** @param {any} a @param {any} b @param {number} q @returns {any} */
function interpolate(a, b, q) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * q;
  if (Array.isArray(a) && Array.isArray(b))
    return a.map((v, i) => interpolate(v, b[i], q));
  if (a && b && typeof a === "object" && typeof b === "object")
    return Object.fromEntries(
      [...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [
        k,
        interpolate(a[k] ?? b[k], b[k] ?? a[k], q),
      ]),
    );
  return q < 1 ? a : b;
}
/** @param {Key[]} keys @param {number} time @param {string} [name] */
export function sampleTracking(keys, time, name) {
  let lo = 0,
    hi = keys.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (Number(keys[m]?.time) <= time) lo = m;
    else hi = m - 1;
  }
  const a = /** @type {Key} */ (keys[lo]),
    b = keys[Math.min(lo + 1, keys.length - 1)] ?? a,
    q =
      b.time === a.time
        ? 0
        : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))),
    value = interpolate(a, b, q);
  if (name) {
    const p = value.points?.[name];
    if (!p) throw new Error(`tracking point ${name} is absent`);
    return p;
  }
  return value;
}
export class Tracking {
  /** @param {Node} scene @param {(src:string)=>Uint8Array} read @param {number} fps */
  constructor(scene, read, fps) {
    /** @type {Map<string,{node:Node,keys:Key[]}>} */ this.tracks = new Map();
    for (const n of scene.children.find((n) => n.name === "tracking")
      ?.children ?? []) {
      const a = n.attributes,
        bytes = read(String(a.src));
      if (
        a.sha256 &&
        createHash("sha256").update(bytes).digest("hex") !== a.sha256
      )
        throw new Error("tracking SHA-256 mismatch");
      this.tracks.set(String(a.id), {
        node: n,
        keys: parseTracking(
          a.format === "fbx"
            ? JSON.stringify(fbxTracking(bytes, fps))
            : Buffer.from(bytes).toString("utf8"),
          a.format === "fbx" ? "json" : String(a.format ?? "json"),
          fps,
        ),
      });
    }
  }
  /** @param {string} id @param {number} time @param {string} [point] @returns {Record<string,any>} */
  sample(id, time, point) {
    const track = this.tracks.get(id);
    if (!track) throw new Error("unknown tracking reference");
    return sampleTracking(
      track.keys,
      time + Number(track.node.attributes.timeOffset ?? 0),
      point,
    );
  }
  /** @param {string} footage @param {number} time @param {number} smoothing @returns {Record<string,number>} */
  stabilize(footage, time, smoothing) {
    const track = [...this.tracks.values()].find(
      (t) => t.node.attributes.footage === footage,
    );
    if (!track)
      throw new Error("stabilize requires tracking data for the footage");
    const t = time + Number(track.node.attributes.timeOffset ?? 0),
      raw = sampleTracking(track.keys, t);
    /** @type {Record<string,number>} */ const result = {};
    for (const key of ["x", "y", "rotation", "scaleX", "scaleY"]) {
      let sum = 0;
      for (let i = -8; i <= 8; i++)
        sum += Number(
          sampleTracking(track.keys, t + (i / 8) * smoothing)[key] ??
            (key.startsWith("scale") ? 1 : 0),
        );
      const average = sum / 17,
        value = Number(raw[key] ?? (key.startsWith("scale") ? 1 : 0));
      result[key] = key.startsWith("scale")
        ? average / (value || 1)
        : average - value;
    }
    return result;
  }
}
