import { extname, dirname, posix, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
/** `check` throws when the verified source changed; it guards the USD importer,
 * which reads the file itself.
 * @param {string} src @param {Uint8Array} bytes @param {(src:string)=>Uint8Array} read @param {string} [absolute] @param {string} [format] @param {()=>void} [check] */
export async function importMesh(
  src,
  bytes,
  read,
  absolute,
  format,
  check = () => {},
) {
  const ext = format ? '.' + format : extname(src).toLowerCase();
  if (ext === '.splat') {
    if (bytes.byteLength % 32) throw new Error('truncated splat');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      points = [];
    for (let i = 0; i < bytes.length; i += 32)
      points.push({
        position: [0, 4, 8].map((n) => view.getFloat32(i + n, true)),
        scale: [12, 16, 20].map((n) => view.getFloat32(i + n, true)),
        color: Array.from(bytes.slice(i + 24, i + 28)),
        rotation: Array.from(bytes.slice(i + 28, i + 32)).map(
          (v) => (v - 128) / 128,
        ),
      });
    return { format: 'splat', points };
  }
  if (['.usd', '.usda', '.usdc', '.usdz'].includes(ext)) {
    if (!absolute)
      throw new Error('USD import requires a resolved source path');
    // The scene root is as many levels above the source as the normalized
    // relative src has segments ('./a.usda' and 'a//b.usda' included).
    const segments = posix.normalize(src).split('/').filter(Boolean),
      root = resolve(absolute, ...segments.map(() => '..')),
      started = Date.now();
    check();
    const imported = JSON.parse(
      execFileSync(
        process.env.SCENE_RENDER_PYTHON ?? 'python3',
        [new URL('./usd-import.py', import.meta.url).pathname, absolute, root],
        { encoding: 'utf8', maxBuffer: 256 << 20 },
      ),
    );
    check();
    // Dependencies are hashed after the import: any change since it started
    // (ctime moves on every write, rename or relink) fails the import.
    for (const dep of imported.dependencies) {
      read(dep);
      if (Math.floor(statSync(resolve(root, dep)).ctimeMs) > started)
        throw new Error(`USD dependency changed during import: ${dep}`);
    }
    return imported;
  }
  const factory = (await import('assimpjs')).default,
    assimp = await factory(),
    files = new assimp.FileList();
  files.AddFile(format ? src.replace(/\.[^.]+$/, '') + ext : src, bytes);
  const deps = new Set();
  if (ext === '.gltf') {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])])
      if (entry.uri && !entry.uri.startsWith('data:'))
        deps.add(posix.join(dirname(src), entry.uri));
  }
  if (ext === '.obj') {
    for (const line of new TextDecoder().decode(bytes).split(/\r?\n/))
      if (line.startsWith('mtllib '))
        deps.add(posix.join(dirname(src), line.slice(7).trim()));
  }
  for (const dep of deps) {
    const data = read(dep);
    files.AddFile(dep, data);
    if (dep.toLowerCase().endsWith('.mtl'))
      for (const line of new TextDecoder().decode(data).split(/\r?\n/)) {
        const match = /^\s*(?:map_\w+|bump|disp|decal)\s+(.*)/i.exec(line);
        if (match) {
          const texture = posix.join(
            dirname(dep),
            String(match[1]).trim().split(/\s+/).at(-1) ?? '',
          );
          files.AddFile(texture, read(texture));
        }
      }
  }
  const result = assimp.ConvertFileList(files, 'assjson');
  try {
    if (!result.IsSuccess() || !result.FileCount())
      throw new Error(`mesh import failed: ${result.GetErrorCode()}`);
    return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent()));
  } finally {
    result.delete?.();
    files.delete?.();
  }
}
