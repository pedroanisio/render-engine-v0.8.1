/** LRU pixel cache with a byte budget; eviction changes work, never pixels. */
/** @extends {Map<string,import('./surface.js').Surface>} */
export class SurfaceCache extends Map {
  /** @param {number} [budget] */
  constructor(budget = 128 * 1024 * 1024) {
    super();
    this.budget = budget;
    this.bytes = 0;
  }
  /** @override @param {string} key */
  get(key) {
    const value = super.get(key);
    if (value) {
      super.delete(key);
      super.set(key, value);
    }
    return value;
  }
  /** @override @param {string} key @param {import('./surface.js').Surface} value */
  set(key, value) {
    this.delete(key);
    const size = value.data.byteLength;
    if (size > this.budget) return this;
    while (this.bytes + size > this.budget && this.size)
      this.delete(/** @type {string} */ (this.keys().next().value));
    super.set(key, value);
    this.bytes += size;
    return this;
  }
  /** @override @param {string} key */
  delete(key) {
    const old = super.get(key);
    if (old) this.bytes -= old.data.byteLength;
    return super.delete(key);
  }
  /** @override */
  clear() {
    super.clear();
    this.bytes = 0;
  }
}
