/** Native libraries are optional until a LUT, OCIO config, or GLSL shader is used. */
import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { Surface } from "../surface.js";
/** @param {string} src @param {(src:string)=>Uint8Array} read @param {Map<string,Uint8Array>} [files] */
export function resources(src, read, files = new Map()) {
  src = posix.normalize(src);
  if (posix.isAbsolute(src) || src.startsWith("../") || /[:$\\]/.test(src))
    throw new Error("unsafe effect resource path");
  if (files.has(src)) return files;
  if (files.size >= 128)
    throw new Error("effect resource graph exceeds 128 files");
  const bytes = read(src);
  files.set(src, bytes);
  if (/\.ocio$/i.test(src)) {
    const metadata = JSON.parse(
      execFileSync(
        "python3",
        [new URL("./ocio-resources.py", import.meta.url).pathname],
        { input: bytes, encoding: "utf8", timeout: 30000 },
      ),
    );
    for (const file of metadata.files) {
      if (
        posix.isAbsolute(file) ||
        /[:$\\]/.test(file) ||
        metadata.searchPaths.some(
          (/** @type {string} */ s) => posix.isAbsolute(s) || /[:$\\]/.test(s),
        )
      )
        throw new Error("unsafe OCIO resource path");
      let found = false,
        last;
      for (const search of [...metadata.searchPaths, ""]) {
        const candidate = posix.join(
          posix.dirname(src),
          String(search),
          String(file),
        );
        try {
          resources(candidate, read, files);
          found = true;
          break;
        } catch (e) {
          last = e;
        }
      }
      if (!found) throw last;
    }
  } else if (/\.(clf|ctf)$/i.test(src)) {
    const text = Buffer.from(bytes).toString("utf8");
    if (/\bbasePath=["'][^."']/.test(text))
      throw new Error("CLF basePath must be local");
    for (const m of text.matchAll(
      /<Reference\b[^>]*\bpath=["']([^"']+)["']/g,
    )) {
      if (posix.isAbsolute(String(m[1])) || /[:$\\]/.test(String(m[1])))
        throw new Error("unsafe CLF reference");
      resources(posix.join(posix.dirname(src), String(m[1])), read, files);
    }
  }
  return files;
}
/** @param {Surface} s @param {Record<string,any>} header @param {Surface} [second] */
export function native(s, header, second) {
  const output = execFileSync(
    "python3",
    [new URL("./native.py", import.meta.url).pathname],
    {
      input: Buffer.concat([
        Buffer.from(
          JSON.stringify({ ...header, width: s.width, height: s.height }) +
            "\n",
        ),
        Buffer.from(s.data.buffer, s.data.byteOffset, s.data.byteLength),
        ...(second
          ? [
              Buffer.from(
                second.data.buffer,
                second.data.byteOffset,
                second.data.byteLength,
              ),
            ]
          : []),
      ]),
      maxBuffer: Math.max(1 << 20, s.data.byteLength * 2),
      timeout: 60000,
    },
  );
  if (output.length !== s.data.byteLength)
    throw new Error("native effect returned incorrect image size");
  const out = new Surface(s.width, s.height);
  out.data.set(
    new Float32Array(
      output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength,
      ),
    ),
  );
  return out;
}
/** @param {Map<string,Uint8Array>} files */
export const bundle = (files) =>
  Object.fromEntries(
    [...files].map(([name, bytes]) => [
      name,
      Buffer.from(bytes).toString("base64"),
    ]),
  );

/** @type {Map<boolean,Record<string,string>>} */
const versions = new Map();
/** Versions form part of the render cache key, including the actual EGL driver.
 * @param {boolean} gpu */
export function nativeInfo(gpu) {
  const cached = versions.get(gpu);
  if (cached) return cached;
  const info = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import json,numpy,PyOpenColorIO as o\nr={'numpy':numpy.__version__,'OpenColorIO':o.__version__}\n${gpu ? "import moderngl\nc=moderngl.create_standalone_context(backend='egl')\nr.update({'ModernGL':moderngl.__version__,'renderer':c.info['GL_RENDERER'],'version':c.info['GL_VERSION']})\nc.release()" : ""}\nprint(json.dumps(r))`,
      ],
      { encoding: "utf8", timeout: 30000 },
    ),
  );
  versions.set(gpu, info);
  return info;
}
/** @param {unknown} value */
export function uniformValue(value) {
  const text = String(value).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  const parts = text
    .replace(/^\[|\]$/g, "")
    .split(/[ ,]+/)
    .map(Number);
  if (parts.some((n) => !Number.isFinite(n)))
    throw new Error(`invalid numeric shader uniform ${text}`);
  return parts.length === 1 ? Number(parts[0]) : parts;
}
