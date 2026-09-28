/** Rectangle helpers behind the zero-region hints. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Surface,
  EMPTY_RECT,
  rectEmpty,
  fullRect,
  unionRect,
  intersectRect,
  expandRect,
  clampRect,
  regionOf,
} from "../src/render/surface.js";

test("union, intersection, expansion and clamping follow set semantics", () => {
  const a = { x0: 1, y0: 2, x1: 5, y1: 6 },
    b = { x0: 3, y0: 0, x1: 9, y1: 4 };
  assert.deepEqual(unionRect(a, b), { x0: 1, y0: 0, x1: 9, y1: 6 });
  assert.equal(unionRect(a, undefined), undefined);
  assert.equal(unionRect(undefined, b), undefined);
  assert.equal(unionRect(a, EMPTY_RECT), a);
  assert.equal(unionRect(EMPTY_RECT, b), b);
  assert.deepEqual(intersectRect(a, b), { x0: 3, y0: 2, x1: 5, y1: 4 });
  assert.equal(intersectRect(a, undefined), a);
  assert.equal(intersectRect(undefined, b), b);
  assert.equal(intersectRect(a, { x0: 7, y0: 7, x1: 9, y1: 9 }), EMPTY_RECT);
  assert.deepEqual(expandRect(a, 1), { x0: 0, y0: 1, x1: 6, y1: 7 });
  assert.deepEqual(expandRect(a, 1, 3), { x0: 0, y0: -1, x1: 6, y1: 9 });
  assert.equal(expandRect(EMPTY_RECT, 4), EMPTY_RECT);
  assert.deepEqual(clampRect({ x0: -2.5, y0: 0.2, x1: 4.1, y1: 30 }, 10, 8), {
    x0: 0,
    y0: 0,
    x1: 5,
    y1: 8,
  });
  assert.equal(clampRect({ x0: 12, y0: 0, x1: 14, y1: 3 }, 10, 8), EMPTY_RECT);
  assert.ok(rectEmpty(EMPTY_RECT));
  assert.ok(!rectEmpty(a));
  const s = new Surface(4, 3);
  assert.deepEqual(fullRect(s), { x0: 0, y0: 0, x1: 4, y1: 3 });
  assert.deepEqual(regionOf(s), { x0: 0, y0: 0, x1: 4, y1: 3 });
  s.bbox = { x0: 1.5, y0: -1, x1: 9, y1: 2 };
  assert.deepEqual(regionOf(s), { x0: 1, y0: 0, x1: 4, y1: 2 });
  assert.equal(s.finite, undefined);
});
