#!/usr/bin/env node
/** Run the real suite; schema acceptance alone can never satisfy the evidence gate. */
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { conformanceReport } from "../src/scene/conformance.js";
const directory = mkdtempSync(join(tmpdir(), "scene-certification-"));
const result = spawnSync("npm", ["run", "check"], {
  stdio: "inherit",
  env: { ...process.env, SCENE_RENDER_EVIDENCE_DIR: directory },
});
try {
  const evidence = readdirSync(directory).flatMap((f) =>
    JSON.parse(readFileSync(join(directory, f), "utf8")),
  );
  const report = conformanceReport(evidence);
  const hashes = /** @type {Record<string,string>} */ ({});
  for (const folder of ["src", "test"]) {
    for (const relative of readdirSync(folder, { recursive: true })) {
      const file = join(folder, String(relative));
      if (!file.endsWith(".js") && !file.endsWith(".json")) continue;
      hashes[file] = createHash("sha256")
        .update(readFileSync(file))
        .digest("hex");
    }
  }
  const target = resolve("docs/conformance-report.json");
  const passed = result.status === 0;
  writeFileSync(
    target,
    JSON.stringify(
      {
        ...report,
        complete: passed && report.complete,
        suitePassed: passed,
        sourceHashes: hashes,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    `Behavioral evidence: ${report.certified}/${report.total} items. Suite: ${passed ? "passed" : "failed"}. Report: ${target}\n`,
  );
  process.exitCode = !passed ? 1 : report.complete ? 0 : 2;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
