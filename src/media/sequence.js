import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Surface } from '../render/surface.js';
import { digest } from './resolve.js';
/** Bounded decoded cache. All source frames are audited during preparation. */
export class SequenceCache {
  /** @param {Record<string,any>} attributes @param {number} [limit] */
  constructor(attributes, limit = 128 * 1024 * 1024) {
    this.attributes = attributes;
    this.limit = limit;
    this.bytes = 0;
    /** @type {Map<string,{path:string,hash:string,attributes:Record<string,any>}>} */ this.sources =
      new Map();
    /** @type {Map<string,Surface>} */ this.frames = new Map();
  }
  /** @param {string} path @param {string} hash @param {Surface} surface @param {Record<string,any>} [attributes] */
  add(path, hash, surface, attributes = this.attributes) {
    this.sources.set(path, { path, hash, attributes });
    this.put(path, surface);
    return path;
  }
  /** @param {string} key @param {Surface} surface */
  put(key, surface) {
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
    if (digest(readFileSync(source.path)) !== source.hash)
      throw new Error('sequence frame changed after preparation');
    const a = source.attributes,
      raw = execFileSync(
        process.execPath,
        [
          new URL('./decode-frame.js', import.meta.url).pathname,
          source.path,
          JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? String(v) : v)),
        ],
        { maxBuffer: Number(a.width) * Number(a.height) * 16 + 1024 },
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
