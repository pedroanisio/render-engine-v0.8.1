/** ffprobe results are reused for an unchanged file and never shared by reference. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "../src/media/decode.js";

test("probe returns equal, independent results on repeated calls", () => {
  const path = new URL("../examples/batch7/poster.png", import.meta.url)
    .pathname;
  const first = probe(path);
  assert.ok(Array.isArray(first.streams) && first.streams.length > 0);
  first.streams.length = 0;
  const second = probe(path);
  assert.ok(second.streams.length > 0, "cached results are cloned");
  assert.deepEqual(probe(path), second);
});
