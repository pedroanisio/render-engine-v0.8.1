/** One writer per final path. A killed renderer's lock is recoverable by PID. */
import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
/** @param {string} path */
export function outputLock(path) {
  const lock = path + ".render-lock";
  mkdirSync(dirname(lock), { recursive: true });
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, "wx");
      try {
        writeFileSync(fd, owner);
      } finally {
        closeSync(fd);
      }
      return () => {
        if (readFileSync(lock, "utf8") === owner) unlinkSync(lock);
      };
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code !== "EEXIST") throw e;
      const old = JSON.parse(readFileSync(lock, "utf8"));
      try {
        process.kill(Number(old.pid), 0);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ESRCH") {
          unlinkSync(lock);
          continue;
        }
        throw error;
      }
      throw new Error("Output is already being rendered by another process");
    }
  }
  throw new Error("Could not acquire output lock");
}
/** Copy to the destination filesystem before the atomic rename.
 * @param {string} source @param {string} target */
export function publishFile(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    copyFileSync(source, tmp);
    renameSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
}
