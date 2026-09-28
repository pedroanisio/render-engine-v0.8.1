/** Disk-backed stems keep large, many-track mixes within a fixed cache budget. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
export class AudioStems {
  /** @param {string} directory @param {number} [budget] */
  constructor(directory, budget = 128 * 1024 * 1024) {
    this.directory = directory;
    this.budget = budget;
    this.bytes = 0;
    this.files = new Map();
    /** @type {Map<string,Float32Array>} */ this.cache = new Map();
    mkdirSync(directory, { recursive: true });
  }
  /** @param {string} id @param {Float32Array} pcm */
  set(id, pcm) {
    const file = join(
      this.directory,
      createHash("sha256").update(id).digest("hex") + ".f32",
    );
    writeFileSync(
      file,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    );
    this.files.set(id, file);
    this.remember(id, pcm);
    return this;
  }
  /** @param {string} id @param {Float32Array} pcm */
  remember(id, pcm) {
    if (this.cache.has(id)) {
      this.bytes -= Number(this.cache.get(id)?.byteLength);
      this.cache.delete(id);
    }
    while (this.bytes + pcm.byteLength > this.budget && this.cache.size) {
      const first = String(this.cache.keys().next().value);
      this.bytes -= Number(this.cache.get(first)?.byteLength);
      this.cache.delete(first);
    }
    if (pcm.byteLength <= this.budget) {
      this.cache.set(id, pcm);
      this.bytes += pcm.byteLength;
    }
  }
  /** @param {string} id */
  get(id) {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const file = this.files.get(id);
    if (!file) return undefined;
    const bytes = readFileSync(file),
      pcm = new Float32Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength / 4,
      );
    this.remember(id, pcm);
    return pcm;
  }
}
