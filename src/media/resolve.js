import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  statSync,
} from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** Canonical containment, including symlinks. @param {string} base @param {string} uri @param {boolean} [missing] */
export function assetPath(base, uri, missing = false) {
  if (!uri || /^[a-z][a-z0-9+.-]*:/i.test(uri) || isAbsolute(uri))
    throw new Error(`asset must be relative: ${uri}`);
  const root = realpathSync(base),
    path = resolve(root, uri),
    rel = relative(root, path);
  if (
    rel === '..' ||
    rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
  )
    throw new Error(`asset escapes scene directory: ${uri}`);
  if (existsSync(path)) {
    const real = realpathSync(path),
      r = relative(root, real);
    if (r === '..' || r.startsWith('../') || isAbsolute(r))
      throw new Error(`asset symlink escapes scene directory: ${uri}`);
  } else {
    let parent = dirname(path);
    while (!existsSync(parent)) parent = dirname(parent);
    const r = relative(root, realpathSync(parent));
    if (r === '..' || r.startsWith('../') || isAbsolute(r))
      throw new Error(`asset symlink escapes scene directory: ${uri}`);
    if (!missing) throw new Error(`missing asset ${uri}`);
  }
  return path;
}
/** @param {Uint8Array} bytes */ export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
/** Identity of the file behind a path: any replacement, rename or write
 * changes the inode, size, mtime or ctime. @param {import('node:fs').Stats} st */
const identityOf = (st) =>
  `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
/** Hash a file through one descriptor, in bounded chunks, and capture its
 * identity. `keep` also returns the hashed bytes (for single-read decoders).
 * @param {string} path @param {boolean} [keep] */
export function fingerprint(path, keep = false) {
  const fd = openSync(path, 'r');
  try {
    const before = fstatSync(fd),
      hash = createHash('sha256'),
      /** @type {Buffer[]} */ chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(
          keep ? Math.max(1, before.size - total) : 1 << 20,
        ),
        n = readSync(fd, chunk, 0, chunk.length, null);
      if (!n) break;
      hash.update(chunk.subarray(0, n));
      if (keep) chunks.push(chunk.subarray(0, n));
      total += n;
    }
    const identity = identityOf(before);
    if (total !== before.size || identityOf(fstatSync(fd)) !== identity)
      throw new Error(`asset changed while hashing: ${path}`);
    return {
      sha256: hash.digest('hex'),
      identity,
      bytes: keep
        ? chunks.length === 1
          ? /** @type {Buffer} */ (chunks[0])
          : Buffer.concat(chunks, total)
        : undefined,
    };
  } finally {
    closeSync(fd);
  }
}
/** Re-check containment and identity of an asset at use time; returns its path.
 * @param {string} base @param {string} uri @param {string} identity */
export function verifiedPath(base, uri, identity) {
  const path = assetPath(base, uri);
  if (identityOf(statSync(path)) !== identity)
    throw new Error(`asset changed after verification: ${uri}`);
  return path;
}
/** @param {string} pattern @param {number} frame */
export function sequencePath(pattern, frame) {
  let count = 0;
  const result = pattern.replace(/%0?(\d*)d|#+/g, (m, w) => {
    count++;
    const width = m[0] === '#' ? m.length : Number(w || 0);
    return frame < 0
      ? '-' + String(-frame).padStart(Math.max(0, width - 1), '0')
      : String(frame).padStart(width, '0');
  });
  if (count !== 1)
    throw new Error('imageSequence requires exactly one %d/%0Nd or # run');
  return result;
}
/** @param {Record<string,any>} a */ export function sequenceFrames(a) {
  const first = Number(a.first),
    last = Number(a.last),
    step = Number(a.step ?? 1);
  if (
    last < first ||
    step <= 0 ||
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    (last - first) / step > 1000000
  )
    throw new Error('invalid or oversized image sequence');
  return Array.from({ length: Math.floor((last - first) / step) + 1 }, (_, i) =>
    sequencePath(String(a.src), first + i * step),
  );
}
/** Freeze generated provider results before rendering. Providers are caller-owned adapters.
 * @param {Node} scene @param {{base:string,providers:Record<string,(request:Record<string,any>)=>Promise<Uint8Array>>}} options */
export async function resolveGenerated(scene, { base, providers }) {
  const caches = new Set();
  const check = (/** @type {Node} */ n) => {
    if (n.name === 'generated') {
      const path = assetPath(base, String(n.attributes.cache), true);
      if (caches.has(path))
        throw new Error('generated assets must use distinct cache files');
      caches.add(path);
    }
    for (const child of n.children) check(child);
  };
  check(scene);
  /** @param {Node} node @returns {Promise<Node>} */ const walk = async (
    node,
  ) => {
    if (node.name !== 'generated')
      return { ...node, children: await Promise.all(node.children.map(walk)) };
    const a = node.attributes,
      path = assetPath(base, String(a.cache), true);
    if (existsSync(path) && digest(readFileSync(path)) === a.cacheSha256)
      return node;
    const provider = providers[String(a.provider)];
    if (!provider)
      throw new Error(`no provider adapter for ${String(a.provider)}`);
    const bytes = await provider({
      ...a,
      seed: a.seed === undefined ? undefined : String(a.seed),
    });
    if (!(bytes instanceof Uint8Array) || !bytes.length)
      throw new Error('provider returned no media');
    mkdirSync(dirname(path), { recursive: true });
    assetPath(base, String(a.cache), true);
    const tmp = path + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(tmp, bytes, { flag: 'wx' });
      renameSync(tmp, path);
    } finally {
      rmSync(tmp, { force: true });
    }
    return { ...node, attributes: { ...a, cacheSha256: digest(bytes) } };
  };
  return walk(scene);
}
/** Resolve source selection without mutating the validated input.
 * @param {Node} scene @param {string|undefined} preference */
export function selectRepresentations(scene, preference) {
  /** @param {Node} n @returns {Node} */ const walk = (n) => {
    let a = { ...n.attributes },
      name = n.name;
    const rep = n.children.find(
      (c) => c.name === 'representation' && c.attributes.name === preference,
    );
    if (rep) {
      a = { ...a, ...rep.attributes };
      delete a.name;
      delete a.sha256;
      if (rep.attributes.sha256 !== undefined) a.sha256 = rep.attributes.sha256;
    } else if (preference === 'proxy' && a.proxy) {
      a.src = a.proxy;
      delete a.sha256;
    }
    if (name === 'generated') {
      name = ['speech', 'music', 'sound-effect'].includes(String(a.kind))
        ? 'audio'
        : String(a.kind);
      a = { ...a, src: String(a.cache), sha256: String(a.cacheSha256) };
    }
    return {
      ...n,
      name,
      ...(rep || (preference === 'proxy' && n.attributes.proxy)
        ? {
            selectedRepresentation: preference,
            logicalSize: {
              width: Number(n.attributes.width),
              height: Number(n.attributes.height),
            },
          }
        : {}),
      attributes: a,
      children: n.children.filter((c) => c.name !== 'representation').map(walk),
    };
  };
  return walk(scene);
}
