/**
 * Public API of the scene-render JavaScript processor (stages 1-3).
 */
import { compileRuntime } from './eval/runtime.js';
import { capabilities } from './scene/preflight.js';
import { Codes, diagnostic } from './diagnostics.js';
import { MODEL } from './generated/model.js';
import { parseXml } from './xml/parse.js';
import { createValidator } from './xsd/validate.js';
import { createSemanticChecker } from './scene/semantic.js';

export { Codes } from './diagnostics.js';
export { MODEL } from './generated/model.js';
export { compileAnimations } from './eval/track.js';
export { easing, cubicBezier } from './eval/curves.js';

/** @typedef {import('./xsd/validate.js').ValidNode} SceneNode */
/** @typedef {import('./diagnostics.js').Diagnostic} Diagnostic */
/** @typedef {import('./generated/types.js').AttributesByType} AttributesByType */

/**
 * @typedef {{ ok: true, scene: SceneNode, ids: ReadonlyMap<string, SceneNode> }
 *   | { ok: false, diagnostics: Diagnostic[] }} LoadResult
 */

/**
 * @typedef {object} LoadOptions
 * @property {import('./xml/parse.js').ParseLimits} [limits]
 * @property {number} [maxDiagnostics] default 100
 */

const validator = createValidator(MODEL);
const semantic = createSemanticChecker(MODEL, validator.simple);

/**
 * Parses, validates and checks a scene document. Never throws for invalid
 * input: every problem is returned as a diagnostic.
 *
 * @param {string} source
 * @param {LoadOptions} [options]
 * @returns {LoadResult}
 */
export function loadScene(source, options = {}) {
  const parsed = parseXml(source, options.limits);
  if (!parsed.ok) return parsed;
  const v = validator.validate(parsed.root, {
    maxDiagnostics: options.maxDiagnostics,
  });
  if (v.diagnostics.length) return { ok: false, diagnostics: v.diagnostics };
  const s = semantic(v.tree);
  if (s.length) return { ok: false, diagnostics: s };
  return { ok: true, scene: v.tree, ids: v.ids };
}

/**
 * Typed view of a node's attributes. Throws when the node is of another
 * type, which is a programming error in the caller.
 *
 * @template {keyof AttributesByType} K
 * @param {SceneNode} node
 * @param {K} type
 * @returns {Readonly<AttributesByType[K]>}
 */
export function attributesOf(node, type) {
  if (node.type !== type)
    throw new TypeError(`node ${node.path} is ${node.type}, not ${type}`);
  return /** @type {AttributesByType[K]} */ (
    /** @type {unknown} */ (node.attributes)
  );
}

export { compileRuntime } from './eval/runtime.js';
export { capabilities, semanticRules } from './scene/preflight.js';
export { fpsOf, timecode } from './eval/clock.js';

/** Operational validation, separate from the XSD validity verdict.
 * @param {string} source @param {import('./eval/runtime.js').RuntimeOptions} [options]
 */
export function prepareScene(source, options = {}) {
  const loaded = loadScene(source);
  if (!loaded.ok) return loaded;
  try {
    const runtime = compileRuntime(loaded.scene, {
        expand: true,
        load: loadScene,
        ...options,
      }),
      diagnostics = capabilities(runtime.scene);
    return diagnostics.length
      ? { ok: false, diagnostics }
      : { ok: true, runtime, diagnostics: [] };
  } catch (e) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          Codes.RUNTIME_SEMANTIC,
          'semantic',
          e instanceof Error ? e.message : String(e),
          loaded.scene.loc,
          loaded.scene.path,
        ),
      ],
    };
  }
}

export {
  resolveGenerated,
  selectRepresentations,
  assetPath,
} from './media/resolve.js';
export { prepareMedia } from './media/manager.js';
