import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
/** Streaming digest: integrity checks never load an entire movie in memory.
 * @param {string} path @param {AbortSignal} [signal] */
export async function fileDigest(path, signal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal }))
    hash.update(chunk);
  return hash.digest("hex");
}
