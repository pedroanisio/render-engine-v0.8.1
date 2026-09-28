/** One writer per final path. A killed renderer's lock is recoverable by PID;
 * an ownerless lock (crash before its owner was written) after a grace period. */
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
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
/** Lock files without a readable owner (a crash between create and write) are
 * treated as stale once they are this old. */
export const LOCK_GRACE_MS = 10000;
/** @param {unknown} e */
const code = (e) => /** @type {NodeJS.ErrnoException} */ (e).code;
/** @param {string} lock @returns {string|undefined} content, or undefined when absent */
function readLock(lock) {
  try {
    return readFileSync(lock, "utf8");
  } catch (e) {
    if (code(e) === "ENOENT") return undefined;
    throw e;
  }
}
/** Whether the lock at `lock` belongs to no live renderer.
 * @param {string} lock @param {number} [grace] */
function isStale(lock, grace = LOCK_GRACE_MS) {
  const content = readLock(lock);
  if (content === undefined) return false;
  /** @type {number} */ let pid = NaN;
  try {
    pid = Number(JSON.parse(content).pid);
  } catch {
    // unreadable owner: fall through to the age check
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    try {
      return Date.now() - statSync(lock).mtimeMs > grace;
    } catch (e) {
      if (code(e) === "ENOENT") return false;
      throw e;
    }
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (code(error) === "ESRCH") return true;
    if (code(error) === "EPERM") return false;
    throw error;
  }
}
/** @param {string} path */
function unlinkQuiet(path) {
  try {
    unlinkSync(path);
  } catch (e) {
    if (code(e) !== "ENOENT") throw e;
  }
}
/**
 * Removes a stale lock. Recovery is serialised by a sibling reaper lock and the
 * staleness is re-checked while holding it, so two recovering processes can
 * never remove a lock that a third has just created.
 * @param {string} lock @param {number} grace @returns {boolean} false when another process is recovering
 */
function reap(lock, grace) {
  const reaper = lock + ".reap";
  let fd;
  try {
    fd = openSync(reaper, "wx");
  } catch (e) {
    if (code(e) !== "EEXIST") throw e;
    // A reaper that crashed mid-recovery leaves an old file behind.
    try {
      if (Date.now() - statSync(reaper).mtimeMs > grace) unlinkQuiet(reaper);
    } catch (error) {
      if (code(error) !== "ENOENT") throw error;
    }
    return false;
  }
  try {
    if (isStale(lock, grace)) unlinkQuiet(lock);
    return true;
  } finally {
    closeSync(fd);
    unlinkQuiet(reaper);
  }
}
/** @param {string} path @param {{grace?:number}} [options] */
export function outputLock(path, options = {}) {
  const grace = options.grace ?? LOCK_GRACE_MS;
  const lock = path + ".render-lock";
  mkdirSync(dirname(lock), { recursive: true });
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    let fd;
    try {
      fd = openSync(lock, "wx");
    } catch (e) {
      if (code(e) !== "EEXIST") throw e;
      if (isStale(lock, grace) && reap(lock, grace)) continue;
      throw new Error("Output is already being rendered by another process");
    }
    try {
      writeFileSync(fd, owner);
    } finally {
      closeSync(fd);
    }
    if (readLock(lock) !== owner) continue;
    return () => {
      // Only remove the lock while it is still ours; a missing lock is fine.
      if (readLock(lock) === owner) unlinkQuiet(lock);
    };
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
