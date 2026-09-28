import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Surface } from '../render/surface.js';
import { digest } from './resolve.js';
/** Decode-relevant identity of a source: the same file decoded with another
 * layer, alpha or colour space is a different cached surface.
 * @param {string} path @param {Record<string,any>} attributes */
function cacheKey(path, attributes) {
  const { id: _id, ...rest } = attributes,
    sorted = Object.fromEntries(
      Object.entries(rest).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
    );
  return (
    path +
    '\0' +
    JSON.stringify(sorted, (_k, v) => (typeof v === 'bigint' ? String(v) : v))
  );
}
/** Bounded decoded cache. All source frames are audited during preparation. */
export class SequenceCache {
  /** @param {Record<string,any>} attributes @param {number} [limit] */
  constructor(attributes, limit = 128 * 1024 * 1024) {
    this.attributes = attributes;
    this.limit = limit;
    this.bytes = 0;
    /** @type {Map<string,{path:string,hash:string,attributes:Record<string,any>,locate:()=>string}>} */ this.sources =
      new Map();
    /** @type {Map<string,Surface>} */ this.frames = new Map();
  }
  /** `locate` re-resolves the path (and re-checks its containment) when an
   * evicted frame is decoded again.
   * @param {string} path @param {string} hash @param {Surface} surface @param {Record<string,any>} [attributes] @param {()=>string} [locate] */
  add(path, hash, surface, attributes = this.attributes, locate = () => path) {
    // Frames of one sequence share its attributes, so the path alone is unique.
    const key =
      attributes === this.attributes ? path : cacheKey(path, attributes);
    this.sources.set(key, { path, hash, attributes, locate });
    this.put(key, surface);
    return key;
  }
  /** @param {string} key @param {Surface} surface */
  put(key, surface) {
    const replaced = this.frames.get(key);
    if (replaced) {
      this.bytes -= replaced.data.byteLength;
      this.frames.delete(key);
    }
    while (
      this.bytes + surface.data.byteLength > this.limit &&
      this.frames.size
    ) {
      const first = String(this.frames.keys().next().value),
        old = this.frames.get(first);
      this.bytes -= old?.data.byteLength ?? 0;
      this.frames.delete(first);
    }
    this.frames.set(key, surface);
    this.bytes += surface.data.byteLength;
  }
  /** @param {string} key */
  frame(key) {
    let surface = this.frames.get(key);
    if (surface) {
      this.frames.delete(key);
      this.frames.set(key, surface);
      return surface;
    }
    const source = this.sources.get(key);
    if (!source) throw new Error('unknown sequence frame');
    // Decode exactly the bytes that were verified: they reach the decoder on stdin.
    const bytes = readFileSync(source.locate());
    if (digest(bytes) !== source.hash)
      throw new Error('sequence frame changed after preparation');
    const a = source.attributes,
      raw = execFileSync(
        process.execPath,
        [
          new URL('./decode-frame.js', import.meta.url).pathname,
          source.path,
          JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? String(v) : v)),
        ],
        {
          input: bytes,
          maxBuffer: Number(a.width) * Number(a.height) * 16 + 1024,
        },
      );
    surface = new Surface(Number(a.width), Number(a.height));
    if (raw.length !== surface.data.byteLength)
      throw new Error('sequence decoder returned truncated pixels');
    for (let i = 0; i < surface.data.length; i++)
      surface.data[i] = raw.readFloatLE(i * 4);
    this.put(key, surface);
    return surface;
  }
}
