#!/usr/bin/env node
/** Operational oracle: structural and semantic verdicts are separate from real export. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadScene, prepareScene } from "../src/index.js";
import { parseRenderArgs } from "../src/cli.js";
import { renderEpisode } from "../src/render/pipeline.js";
const parsed = parseRenderArgs(process.argv.slice(2));
if (!parsed.ok) throw new Error(parsed.error);
const options = parsed.options,
  sceneFile = resolve(options.sceneFile),
  source = readFileSync(sceneFile, "utf8");
const loaded = loadScene(source);
/** @type {Record<string,unknown>} */
const report = {
  scene: sceneFile,
  schema: loaded.ok,
  semantic: false,
  render: false,
  diagnostics: loaded.ok ? [] : loaded.diagnostics,
};
if (loaded.ok) {
  const prepared = prepareScene(source, {
    ...options,
    read: (p) => readFileSync(resolve(dirname(sceneFile), p), "utf8"),
  });
  report.semantic = prepared.ok;
  report.diagnostics = prepared.diagnostics;
  if (prepared.ok)
    try {
      const result = await renderEpisode(options);
      report.render = true;
      report.result = result;
      report.evidence = (result.outputs ?? [result]).map((output) =>
        JSON.parse(readFileSync(output.video + ".assets.json", "utf8")),
      );
    } catch (e) {
      report.error = e instanceof Error ? e.message : String(e);
    }
}
writeFileSync(
  sceneFile + ".oracle.json",
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.render ? 0 : 1;
