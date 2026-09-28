import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
/** Call only after the behavior-specific assertions have succeeded. */
export function evidence(test, items, polarity = "positive") {
  const directory = process.env.SCENE_RENDER_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, randomUUID() + ".json"),
    JSON.stringify(
      items.map((item) => ({
        item,
        polarity,
        kind: "behavior",
        test,
        passed: true,
      })),
    ),
  );
}
