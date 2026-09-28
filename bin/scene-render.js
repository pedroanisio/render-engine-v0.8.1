#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { main, parseRenderArgs } from "../src/cli.js";

const argv = process.argv.slice(2);
if (argv[0] === "render") {
  const parsed = parseRenderArgs(argv.slice(1));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.exitCode = 2;
  } else {
    const { renderEpisode } = await import("../src/render/pipeline.js");
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("Render cancelled"));
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    try {
      const r = await renderEpisode({
        ...parsed.options,
        signal: controller.signal,
        log: (l) => process.stdout.write(`${l}\n`),
      });
      process.stdout.write(
        `${r.video}: ${r.rendered} segments rendered, ${r.cached} reused\n`,
      );
    } catch (e) {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    } finally {
      process.off("SIGINT", cancel);
      process.off("SIGTERM", cancel);
    }
  }
} else {
  process.exitCode = main(argv, {
    readFile: (p) => readFileSync(p, "utf8"),
    readBytes: (p) => readFileSync(p),
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}
