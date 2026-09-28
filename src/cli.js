import { capabilityManifest } from "./scene/preflight.js";
/**
 * Command-line front end (Node only). Exit codes: 0 success, 1 invalid
 * scene or unmet dependencies, 2 usage or I/O error.
 */
import { createAudioAnalysis } from "./render/audio-analysis.js";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { fileDependencies, inspect } from "./assets.js";
import { loadScene, prepareScene } from "./index.js";

const USAGE =
  "       scene-render capabilities [--json]\n" +
  "       scene-render preflight [--json] <scene.xml>\n" +
  "usage: scene-render validate [--json] <scene.xml>\n" +
  "       scene-render assets [--json] <scene.xml>\n" +
  "       scene-render render <scene.xml> [--output ID] [--anchor-mode pivot|position] [--scale N] [--from S] [--to S] [--work DIR] [--jobs N] [--threads N] [--available yes]\n";

/**
 * Parses `render` arguments; returns an error message for invalid input.
 * @param {string[]} args arguments after "render"
 * @returns {{ ok: true, options: import('./render/pipeline.js').RenderOptions } | { ok: false, error: string }}
 */
export function parseRenderArgs(args) {
  /** @type {Record<string, string>} */
  const flags = {};
  /** @type {Record<string,string>} */ const parameters = {};
  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = /** @type {string} */ (args[i]);
    if (a.startsWith("--")) {
      const v = args[i + 1];
      if (
        ![
          "--output",
          "--anchor-mode",
          "--scale",
          "--representation",
          "--from",
          "--to",
          "--work",
          "--jobs",
          "--threads",
          "--shard",
          "--available",
          "--param",
          "--variant",
          "--data",
          "--row",
        ].includes(a) ||
        v === undefined
      )
        return { ok: false, error: `bad option ${a}` };
      if (a === "--param") {
        const eq = v.indexOf("=");
        if (eq < 1) return { ok: false, error: "--param requires id=value" };
        parameters[v.slice(0, eq)] = v.slice(eq + 1);
      } else flags[a.slice(2)] = v;
      i += 1;
    } else files.push(a);
  }
  if (files.length !== 1)
    return { ok: false, error: "expected exactly one scene file" };
  /** @type {import('./render/pipeline.js').RenderOptions} */
  const options = { sceneFile: /** @type {string} */ (files[0]) };
  for (const k of ["scale", "from", "to"]) {
    if (flags[k] !== undefined) {
      const n = Number(flags[k]);
      if (!Number.isFinite(n) || (k === "scale" && n <= 0))
        return {
          ok: false,
          error: `--${k} must be a ${k === "scale" ? "positive " : ""}number`,
        };
      /** @type {Record<string, number>} */ (/** @type {unknown} */ (options))[
        k
      ] = n;
    }
  }
  if (flags.jobs !== undefined) {
    const j = Number(flags.jobs);
    if (!Number.isInteger(j) || j < 1)
      return { ok: false, error: "--jobs must be a positive integer" };
    options.jobs = j;
  }
  if (flags.threads !== undefined) {
    const n = Number(flags.threads);
    if (!Number.isInteger(n) || n < 1 || n > 32)
      return { ok: false, error: "--threads must be an integer from 1 to 32" };
    options.threads = n;
  }
  if (flags.shard !== undefined) {
    const m = /^(\d+)\/(\d+)$/.exec(flags.shard);
    if (!m || Number(m[1]) >= Number(m[2]))
      return { ok: false, error: "--shard must be K/N with K < N" };
    options.shard = [Number(m[1]), Number(m[2])];
  }
  if (flags.available !== undefined) {
    if (flags.available !== "yes")
      return { ok: false, error: '--available takes "yes"' };
    options.available = true;
  }
  if (flags.representation !== undefined)
    options.representation = flags.representation;
  if (flags["anchor-mode"] !== undefined) {
    if (!["pivot", "position"].includes(flags["anchor-mode"]))
      return { ok: false, error: "--anchor-mode must be pivot or position" };
    options.anchorMode = /** @type {'pivot'|'position'} */ (
      flags["anchor-mode"]
    );
  }
  if (flags.output !== undefined) options.outputId = flags.output;
  if (Object.keys(parameters).length) options.parameters = parameters;
  if (flags.variant !== undefined) options.variant = flags.variant;
  if (flags.data !== undefined) options.data = flags.data;
  if (flags.row !== undefined) {
    const n = Number(flags.row);
    if (!Number.isInteger(n) || n < 0)
      return { ok: false, error: "--row must be a non-negative integer" };
    options.row = n;
  }
  if (flags.work !== undefined) options.work = flags.work;
  return { ok: true, options };
}

/**
 * @typedef {object} Io
 * @property {(path: string) => string} readFile
 * @property {(path: string) => Uint8Array} readBytes
 * @property {(s: string) => void} stdout
 * @property {(s: string) => void} stderr
 */

/** @typedef {import('./diagnostics.js').Diagnostic} Diagnostic */
/** @typedef {'ok' | 'missing' | 'invalid' | 'outside' | 'unchecked'} Status */

/** @param {unknown} e */
const message = (e) => (e instanceof Error ? e.message : String(e));

/**
 * @param {string[]} argv arguments after the program name
 * @param {Io} io
 * @returns {0 | 1 | 2}
 */
export function main(argv, io) {
  const [command, ...rest] = argv;
  if (command === "capabilities" && rest.every((a) => a === "--json")) {
    io.stdout(JSON.stringify(capabilityManifest(), null, 2) + "\n");
    return 0;
  }
  const json = rest.includes("--json");
  const files = rest.filter((a) => a !== "--json");
  if (
    (command !== "validate" &&
      command !== "assets" &&
      command !== "preflight") ||
    files.length !== 1 ||
    files[0]?.startsWith("--")
  ) {
    io.stderr(USAGE);
    return 2;
  }
  const file = /** @type {string} */ (files[0]);
  let source;
  try {
    source = io.readFile(file);
  } catch (e) {
    io.stderr(`cannot read ${file}: ${message(e)}\n`);
    return 2;
  }
  if (command === "preflight") {
    const loaded = loadScene(source);
    const r = prepareScene(source, {
      audioAmplitude: loaded.ok
        ? createAudioAnalysis(loaded.scene, posix.dirname(file))
        : undefined,
      read: (p) => io.readFile(posix.join(posix.dirname(file), p)),
    });
    if (json)
      io.stdout(
        `${JSON.stringify({ file, valid: r.ok, diagnostics: r.diagnostics })}\n`,
      );
    else if (r.ok) io.stdout(`${file}: renderable\n`);
    else printDiagnostics(io, file, r.diagnostics);
    return r.ok ? 0 : 1;
  }
  const r = loadScene(source);
  if (command === "validate" || !r.ok) {
    const diagnostics = r.ok ? [] : r.diagnostics;
    if (json)
      io.stdout(`${JSON.stringify({ file, valid: r.ok, diagnostics })}\n`);
    else if (r.ok) io.stdout(`${file}: valid\n`);
    else printDiagnostics(io, file, diagnostics);
    return r.ok ? 0 : 1;
  }
  return assets(io, file, r.scene, json);
}

/** @param {Io} io @param {string} file @param {Diagnostic[]} diagnostics */
function printDiagnostics(io, file, diagnostics) {
  for (const d of diagnostics) {
    io.stdout(
      `${file}:${d.line}:${d.column}: ${d.code} [${d.stage}] ${d.message}${d.path ? ` at ${d.path}` : ""}\n`,
    );
  }
}

/**
 * @param {Io} io
 * @param {string} sceneFile
 * @param {import('./index.js').SceneNode} scene
 * @param {boolean} json
 * @returns {0 | 1}
 */
function assets(io, sceneFile, scene, json) {
  const dir = posix.dirname(sceneFile);
  const results = fileDependencies(scene).map((dep) => {
    /** @type {{ status: Status, problems: string[], file: string | null, sha256?: string, sniffed?: unknown }} */
    const base = { status: "unchecked", problems: [], file: null };
    if (dep.pattern) return { ...dep, ...base, problems: ["sequence pattern"] };
    if (/^[a-z][a-z0-9+.-]*:/i.test(dep.uri) || dep.uri.startsWith("/")) {
      return { ...dep, ...base, problems: ["remote or absolute URI"] };
    }
    const resolved = posix.join(dir, dep.uri);
    if (posix.relative(dir, resolved).startsWith("..")) {
      return {
        ...dep,
        ...base,
        status: /** @type {Status} */ ("outside"),
        problems: ["resolves outside the scene directory; not read"],
      };
    }
    let bytes;
    try {
      bytes = io.readBytes(resolved);
    } catch (e) {
      const missing = /** @type {{ code?: string }} */ (e).code === "ENOENT";
      return {
        ...dep,
        ...base,
        file: resolved,
        status: /** @type {Status} */ (missing ? "missing" : "invalid"),
        problems: missing ? [] : [`cannot read: ${message(e)}`],
      };
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { problems, sniffed } = inspect(dep, bytes, sha256);
    return {
      ...dep,
      file: resolved,
      status: /** @type {Status} */ (problems.length ? "invalid" : "ok"),
      problems,
      sha256,
      sniffed,
    };
  });

  const summary = {
    total: results.length,
    ok: 0,
    missing: 0,
    invalid: 0,
    outside: 0,
    unchecked: 0,
  };
  /** @type {Record<string, number>} */
  const missingByElement = {};
  for (const r of results) {
    summary[r.status] += 1;
    if (r.status === "missing")
      missingByElement[r.element] = (missingByElement[r.element] ?? 0) + 1;
  }
  if (json) {
    io.stdout(
      `${JSON.stringify({ scene: sceneFile, summary, missingByElement, dependencies: results })}\n`,
    );
  } else {
    for (const r of results) {
      if (r.status === "ok") continue;
      const detail = r.problems.length ? `: ${r.problems.join("; ")}` : "";
      io.stdout(
        `${r.status.toUpperCase().padEnd(10)} ${r.element} ${r.uri}${r.id ? ` (${r.id})` : ""}${detail}\n`,
      );
    }
    io.stdout(
      `${summary.total} file dependencies: ${summary.ok} ok, ${summary.missing} missing, ` +
        `${summary.invalid} invalid, ${summary.outside} outside, ${summary.unchecked} unchecked\n`,
    );
    const kinds = Object.keys(missingByElement).sort();
    if (kinds.length)
      io.stdout(
        `missing by element: ${kinds.map((k) => `${k} ${missingByElement[k]}`).join(", ")}\n`,
      );
  }
  return summary.missing + summary.invalid + summary.outside ? 1 : 0;
}
