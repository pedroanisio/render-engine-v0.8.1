/**
 * File dependencies of a scene and content checks against what the scene
 * declares about them. Pure: callers supply bytes and their SHA-256.
 */

/** @typedef {import('./xsd/validate.js').ValidNode} SceneNode */

/**
 * @typedef {object} Declared
 * @property {string} [sha256]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [duration]
 * @property {number} [sampleRate]
 * @property {number} [channels]
 */

/**
 * @typedef {object} FileDependency
 * @property {string} element
 * @property {string | null} id
 * @property {string} path       element path in the scene
 * @property {'src' | 'proxy'} role
 * @property {string} uri
 * @property {boolean} pattern   printf-style sequence path; not a single file
 * @property {Declared} declared expectations that apply to this file
 */

/**
 * @typedef {{ format: 'png', family: 'image', width: number, height: number }
 *   | { format: 'wav', family: 'audio', channels: number, sampleRate: number, bitsPerSample: number, duration: number }
 *   | { format: 'wav', family: 'audio', malformed: true }
 *   | { format: 'jpeg', family: 'image' }
 *   | { format: 'truetype' | 'opentype', family: 'font' }
 *   | { format: 'unknown', family: 'unknown' }} Sniffed
 */

const FAMILY = /** @type {Record<string, string>} */ ({
  image: 'image',
  representation: 'image',
  imageSequence: 'image',
  audio: 'audio',
  font: 'font',
});
const DECLARED_KEYS = /** @type {const} */ ([
  'sha256',
  'width',
  'height',
  'duration',
  'sampleRate',
  'channels',
]);

/**
 * @param {SceneNode} scene
 * @returns {FileDependency[]}
 */
export function fileDependencies(scene) {
  /** @type {FileDependency[]} */
  const out = [];
  /** @param {SceneNode} n */
  const walk = (n) => {
    const a = n.attributes;
    const id = typeof a.id === 'string' ? a.id : null;
    if (typeof a.src === 'string') {
      /** @type {Declared} */
      const declared = {};
      for (const k of DECLARED_KEYS) {
        const v = a[k];
        if (v !== undefined)
          /** @type {Record<string, unknown>} */ (declared)[k] = v;
      }
      out.push({
        element: n.name,
        id,
        path: n.path,
        role: 'src',
        uri: a.src,
        pattern:
          a.src.includes('%') ||
          (n.name === 'imageSequence' && a.src.includes('#')),
        declared,
      });
    }
    if (typeof a.proxy === 'string') {
      out.push({
        element: n.name,
        id,
        path: n.path,
        role: 'proxy',
        uri: a.proxy,
        pattern: a.proxy.includes('%'),
        declared: {},
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(scene);
  return out;
}

/** @param {Uint8Array} b @param {number} at @param {string} s */
const ascii = (b, at, s) =>
  [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/**
 * Identifies file content by its leading bytes.
 * @param {Uint8Array} b
 * @returns {Sniffed}
 */
export function sniff(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (
    b.length >= 24 &&
    ascii(b, 1, 'PNG') &&
    b[0] === 0x89 &&
    ascii(b, 12, 'IHDR')
  ) {
    return {
      format: 'png',
      family: 'image',
      width: v.getUint32(16),
      height: v.getUint32(20),
    };
  }
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) {
    /** @type {{ channels: number, sampleRate: number, bitsPerSample: number, blockAlign: number } | null} */
    let fmt = null;
    for (let at = 12; at + 8 <= b.length;) {
      const size = v.getUint32(at + 4, true);
      if (ascii(b, at, 'fmt ')) {
        // A PCM fmt chunk carries at least 16 bytes; anything shorter is corrupt.
        if (size < 16 || at + 24 > b.length) break;
        fmt = {
          channels: v.getUint16(at + 10, true),
          sampleRate: v.getUint32(at + 12, true),
          blockAlign: v.getUint16(at + 20, true),
          bitsPerSample: v.getUint16(at + 22, true),
        };
      } else if (
        ascii(b, at, 'data') &&
        fmt &&
        fmt.blockAlign &&
        fmt.sampleRate
      ) {
        const { channels, sampleRate, bitsPerSample, blockAlign } = fmt;
        // Streaming writers leave the size 0 or 0xFFFFFFFF, and truncated
        // files declare more than they hold: measure what is actually there.
        const available = b.length - (at + 8);
        const bytes = size === 0 || size === 0xffffffff || size > available ? available : size;
        return {
          format: 'wav',
          family: 'audio',
          channels,
          sampleRate,
          bitsPerSample,
          duration: Math.floor(bytes / blockAlign) / sampleRate,
        };
      }
      at += 8 + size + (size & 1);
    }
    return { format: 'wav', family: 'audio', malformed: true };
  }
  if (
    b.length >= 4 &&
    ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) ||
      ascii(b, 0, 'true') ||
      ascii(b, 0, 'ttcf'))
  ) {
    return { format: 'truetype', family: 'font' };
  }
  if (b.length >= 4 && ascii(b, 0, 'OTTO'))
    return { format: 'opentype', family: 'font' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { format: 'jpeg', family: 'image' };
  return { format: 'unknown', family: 'unknown' };
}

/** @param {number} x */
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * @param {FileDependency} dep
 * @param {Uint8Array} bytes
 * @param {string} sha256 lowercase hex digest of bytes
 * @returns {{ problems: string[], sniffed: Sniffed }}
 */
export function inspect(dep, bytes, sha256) {
  /** @type {string[]} */
  const problems = [];
  const d = dep.declared;
  if (d.sha256 !== undefined && d.sha256 !== sha256)
    problems.push(`sha256 is ${sha256}, declared ${d.sha256}`);
  const s = sniff(bytes);
  const expected = dep.role === 'src' ? FAMILY[dep.element] : undefined;
  if (expected && s.family !== 'unknown' && s.family !== expected) {
    problems.push(`expected ${expected} data, found ${s.format}`);
    return { problems, sniffed: s };
  }
  if (s.format === 'png') {
    if (d.width !== undefined && s.width !== d.width)
      problems.push(`width is ${s.width}, declared ${d.width}`);
    if (d.height !== undefined && s.height !== d.height)
      problems.push(`height is ${s.height}, declared ${d.height}`);
  } else if (s.format === 'wav') {
    if ('malformed' in s) problems.push('malformed wav data');
    else {
      if (d.channels !== undefined && s.channels !== d.channels)
        problems.push(`channels is ${s.channels}, declared ${d.channels}`);
      if (d.sampleRate !== undefined && s.sampleRate !== d.sampleRate)
        problems.push(
          `sampleRate is ${s.sampleRate}, declared ${d.sampleRate}`,
        );
      // One sample of tolerance: declared durations are decimal approximations of sample counts.
      if (
        d.duration !== undefined &&
        Math.abs(s.duration - d.duration) > 1 / s.sampleRate + 1e-9
      ) {
        problems.push(
          `duration is ${round6(s.duration)}s, declared ${d.duration}s`,
        );
      }
    }
  }
  return { problems, sniffed: s };
}
