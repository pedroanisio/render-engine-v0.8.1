/** Binary and ASCII FBX tracks, sampled with the same importer as mesh animation. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
/** @param {Uint8Array} bytes @param {number} fps @returns {import('./tracking.js').Key[]} */
export function fbxTracking(bytes, fps) {
  const dir = mkdtempSync(join(tmpdir(), "scene-track-"));
  try {
    const input = join(dir, "track.fbx"),
      output = join(dir, "track.json");
    writeFileSync(input, bytes);
    const script = fileURLToPath(
      new URL("../three/tracking_fbx.py", import.meta.url),
    );
    execFileSync(
      process.env.SCENE_RENDER_BLENDER_PYTHON ??
        resolve(dirname(script), "../../../.venv-3d/bin/python"),
      [script, input, output, String(fps)],
      { timeout: 120000, maxBuffer: 2 << 20 },
    );
    return JSON.parse(readFileSync(output, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
