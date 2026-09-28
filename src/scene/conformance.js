import { capabilityManifest } from "./preflight.js";
/** @typedef {{item:string,polarity:'positive'|'negative',kind:'behavior'|'schema',test:string,passed:boolean}} Evidence */
/** Audit evidence without promoting schema acceptance or a family-level test to certification.
 * Keys identify a concrete type/attribute, optionally followed by =ENUM_VALUE.
 * @param {Evidence[]} evidence */
export function conformanceReport(evidence = []) {
  const manifest = capabilityManifest();
  /** @type {Map<string,{key:string,contexts:string[]}>} */ const inventory =
    new Map();
  for (const context of manifest.contexts)
    for (const attribute of context.attributes) {
      for (const key of [
        attribute.key,
        ...attribute.values.map((v) => `${attribute.key}=${String(v)}`),
      ]) {
        if (!inventory.has(key)) inventory.set(key, { key, contexts: [] });
        inventory
          .get(key)
          ?.contexts.push(`${context.parent}/${context.element}`);
      }
    }
  const unknown = evidence
    .filter((e) => !inventory.has(e.item))
    .map((e) => e.item);
  if (unknown.length)
    throw new Error(
      `Unknown conformance items: ${[...new Set(unknown)].join(", ")}`,
    );
  const items = [...inventory.values()].map((item) => {
    const claims = evidence.filter(
      (e) => e.item === item.key && e.kind === "behavior" && e.passed,
    );
    const positive = [
      ...new Set(
        claims.filter((e) => e.polarity === "positive").map((e) => e.test),
      ),
    ];
    const negative = [
      ...new Set(
        claims.filter((e) => e.polarity === "negative").map((e) => e.test),
      ),
    ];
    return {
      ...item,
      positive,
      negative,
      certified: positive.length > 0 && negative.length > 0,
    };
  });
  const missing = items
    .filter((item) => !item.certified)
    .map((item) => item.key);
  return {
    schemaVersion: manifest.schemaVersion,
    complete: missing.length === 0,
    total: items.length,
    certified: items.length - missing.length,
    missing,
    items,
  };
}
