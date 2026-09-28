/** Sample-accurate, seek-independent gain/pan envelopes for FFmpeg amultiply. */
import { openSync, closeSync, writeSync } from 'node:fs';
/** @param {string} path @param {number} duration @param {(time:number)=>[number,number]} sample */
export function writeEnvelope(path, duration, sample) {
  const count = Math.ceil(duration * 48000),
    size = count * 8;
  if (size > 0xffffffff - 36) throw new Error('automation exceeds RIFF size limit');
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(size + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(48000 * 8, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(size, 40);
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, header);
    for (let start = 0; start < count; start += 4096) {
      const n = Math.min(4096, count - start),
        buffer = Buffer.alloc(n * 8);
      for (let i = 0; i < n; i++) {
        const pair = sample((start + i) / 48000);
        if (!pair.every(Number.isFinite)) throw new Error('non-finite audio automation');
        buffer.writeFloatLE(pair[0], i * 8);
        buffer.writeFloatLE(pair[1], i * 8 + 4);
      }
      writeSync(fd, buffer);
    }
  } finally {
    closeSync(fd);
  }
  return path;
}
/** @param {ReturnType<import('../eval/runtime.js').compileRuntime>} runtime @param {string} directory */
export function audioAutomation(runtime, directory) {
  let serial = 0;
  /** @param {import('../xsd/validate.js').ValidNode} node @param {number} start @param {number} duration */
  return (node, start, duration) => {
    if (
      !node.children.some(
        (n) =>
          ['animate', 'expression', 'link'].includes(n.name) &&
          ['gain', 'volume', 'pan'].includes(String(n.attributes.property)),
      )
    )
      return undefined;
    return writeEnvelope(`${directory}/automation-${serial++}.wav`, duration, (t) => {
      const time = t + start,
        gain =
          10 ** (Number(runtime.value(node, 'gain', time) ?? 0) / 20) *
          Number(runtime.value(node, 'volume', time) ?? 1) *
          (node.attributes.mute === true ? 0 : 1),
        pan = Number(runtime.value(node, 'pan', time) ?? 0),
        theta = ((pan + 1) * Math.PI) / 4;
      return [gain * Math.cos(theta) * Math.SQRT2, gain * Math.sin(theta) * Math.SQRT2];
    });
  };
}
