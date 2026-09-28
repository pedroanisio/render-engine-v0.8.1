import { test } from "node:test";
import assert from "node:assert/strict";
import { conformanceReport } from "../src/scene/conformance.js";

test("certification inventories the document root and every unique attribute/enum without treating parsing as behavior", () => {
  const r = conformanceReport();
  assert.ok(r.total > 1500);
  assert.equal(r.complete, false);
  assert.equal(r.certified, 0);
  assert.ok(r.missing.includes("/scene/@version"));
  assert.ok(r.missing.includes("outputType/@codec=h264"));
  assert.equal(new Set(r.items.map((i) => i.key)).size, r.total);
  const item = "outputType/@codec=h264";
  const evidence = [
    { item, kind: "schema", polarity: "positive", test: "parse", passed: true },
    {
      item,
      kind: "behavior",
      polarity: "negative",
      test: "incompatible container",
      passed: true,
    },
  ];
  assert.equal(conformanceReport(evidence).certified, 0);
  evidence.push({
    item,
    kind: "behavior",
    polarity: "positive",
    test: "decode h264 stream",
    passed: false,
  });
  assert.equal(conformanceReport(evidence).certified, 0);
  evidence.at(-1).passed = true;
  const covered = conformanceReport(evidence);
  assert.equal(covered.certified, 1);
  assert.equal(covered.complete, false);
  assert.deepEqual(covered.items.find((i) => i.key === item).positive, [
    "decode h264 stream",
  ]);
  assert.throws(
    () => conformanceReport([{ ...evidence[0], item: "made-up" }]),
    /Unknown conformance/,
  );
});
