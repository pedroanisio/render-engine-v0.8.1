/** Minimal PNG and WAV byte builders for asset-inspection tests. */

/** @param {number} w @param {number} h */
export function png(w, h) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

/**
 * @param {{ channels: number, rate: number, bits: number, frames: number, format?: number, list?: boolean }} o
 */
export function wav(o) {
  const block = o.channels * (o.bits / 8);
  const data = o.frames * block;
  const list = o.list ? 12 : 0;
  const b = new Uint8Array(44 + list + data);
  const v = new DataView(b.buffer);
  const ascii = (/** @type {number} */ at, /** @type {string} */ s) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + list + data, true); ascii(8, 'WAVE');
  let at = 12;
  if (o.list) { ascii(at, 'LIST'); v.setUint32(at + 4, 4, true); ascii(at + 8, 'INFO'); at += 12; }
  ascii(at, 'fmt '); v.setUint32(at + 4, 16, true);
  v.setUint16(at + 8, o.format ?? 1, true); v.setUint16(at + 10, o.channels, true);
  v.setUint32(at + 12, o.rate, true); v.setUint32(at + 16, o.rate * block, true);
  v.setUint16(at + 20, block, true); v.setUint16(at + 22, o.bits, true);
  ascii(at + 24, 'data'); v.setUint32(at + 28, data, true);
  return b;
}

