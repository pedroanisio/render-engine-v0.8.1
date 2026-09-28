import { decode } from '@woff2/woff2-rs';
import { inflateSync } from 'node:zlib';
/** Unwrap web-font containers before shaping variable fonts. @param {Uint8Array} bytes */
export function fontBytes(bytes) {
  const data = Buffer.from(bytes),
    signature = data.toString('ascii', 0, 4);
  if (signature === 'wOF2') return decode(data);
  if (signature !== 'wOFF') return data;
  const count = data.readUInt16BE(12);
  if (data.length < 44 + 20 * count)
    throw new Error('truncated WOFF directory');
  const tableBytes = [];
  let size = 12 + 16 * count;
  for (let i = 0; i < count; i++) {
    const at = 44 + 20 * i,
      offset = data.readUInt32BE(at + 4),
      compressed = data.readUInt32BE(at + 8),
      length = data.readUInt32BE(at + 12);
    if (offset + compressed > data.length)
      throw new Error('truncated WOFF table');
    const raw = data.subarray(offset, offset + compressed),
      decoded = compressed < length ? inflateSync(raw) : raw;
    if (decoded.length !== length) throw new Error('invalid WOFF table length');
    tableBytes.push(decoded);
    size += Math.ceil(length / 4) * 4;
  }
  const out = Buffer.alloc(size);
  data.copy(out, 0, 4, 8);
  out.writeUInt16BE(count, 4);
  const power = 2 ** Math.floor(Math.log2(count));
  out.writeUInt16BE(power * 16, 6);
  out.writeUInt16BE(Math.log2(power), 8);
  out.writeUInt16BE(count * 16 - power * 16, 10);
  let offset = 12 + 16 * count;
  for (let i = 0; i < count; i++) {
    const src = 44 + 20 * i,
      dst = 12 + 16 * i,
      table = /** @type {Buffer} */ (tableBytes[i]);
    data.copy(out, dst, src, src + 4);
    data.copy(out, dst + 4, src + 16, src + 20);
    out.writeUInt32BE(offset, dst + 8);
    out.writeUInt32BE(table.length, dst + 12);
    table.copy(out, offset);
    offset += Math.ceil(table.length / 4) * 4;
  }
  return out;
}
