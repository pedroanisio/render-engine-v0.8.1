/** Collect MaterialX includes and image dependencies before compiling shaders. */
import { SaxesParser } from "saxes";
import { posix } from "node:path";
/** @param {string} src @param {(src:string)=>Uint8Array} read @param {Map<string,Uint8Array>} files */
export function materialXResources(src, read, files) {
  src = posix.normalize(src);
  if (posix.isAbsolute(src) || src.startsWith("../") || /[:$\\]/.test(src))
    throw new Error("unsafe MaterialX resource path");
  if (files.has(src)) return;
  if (files.size >= 128)
    throw new Error("MaterialX resource graph exceeds 128 files");
  const bytes = read(src);
  files.set(src, bytes);
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    throw new Error("MaterialX DTD is forbidden");
  });
  parser.on("opentag", (n) => {
    const a = n.attributes;
    if (n.name === "implementation")
      throw new Error("MaterialX custom implementation code is not accepted");
    const value =
      a.type === "filename"
        ? a.value
        : n.name.endsWith("include")
          ? a.href
          : undefined;
    if (value) {
      const relative = String(value);
      if (posix.isAbsolute(relative) || /[:$\\]/.test(relative))
        throw new Error("unsafe MaterialX dependency");
      const path = posix.join(posix.dirname(src), relative);
      if (/\.mtlx$/i.test(path)) materialXResources(path, read, files);
      else {
        if (path.startsWith("../"))
          throw new Error("unsafe MaterialX dependency");
        files.set(path, read(path));
      }
    }
  });
  parser.write(Buffer.from(bytes).toString("utf8")).close();
}
