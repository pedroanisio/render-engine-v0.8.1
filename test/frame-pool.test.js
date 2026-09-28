/** Threaded rendering produces the same lossless segments as the serial path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderEpisode } from "../src/render/pipeline.js";
import { FramePool, defaultThreads } from "../src/render/frame-pool.js";

test("a two-thread render matches the serial segment digests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "frame-pool-"));
  try {
    const scene = join(dir, "scene.xml");
    copyFileSync(new URL("../examples/batch1/scene.xml", import.meta.url), scene);
    /** @param {number} threads */
    const digests = async (threads) => {
      const work = join(dir, `work-${threads}`);
      const result = await renderEpisode({
        sceneFile: scene,
        shard: [0, 1],
        threads,
        work,
      });
      assert.equal(result.rendered, 2);
      return readdirSync(join(work, "segments"))
        .filter((f) => f.endsWith(".sha256"))
        .sort()
        .map((f) => [f, readFileSync(join(work, "segments", f), "utf8")]);
    };
    const serial = await digests(1),
      threaded = await digests(2);
    assert.equal(serial.length, 2);
    assert.deepEqual(threaded, serial);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the default thread count is a small positive integer and pool start-up failures propagate", async () => {
  const n = defaultThreads();
  assert.ok(Number.isInteger(n) && n >= 1 && n <= 4);
  const pool = new FramePool(
    { sceneFile: join(tmpdir(), "does-not-exist.xml") },
    1,
  );
  await assert.rejects(pool.start(), /ENOENT|no such file/);
  pool.close();
});
