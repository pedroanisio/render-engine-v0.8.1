/**
 * Stage 3: reference rules the schema documents but XSD cannot express.
 *
 *  - paintType "url(#id)" must name an element under /scene/paints
 *    (schema: "url(#id) of a paints/* gradient, pattern or noise");
 *  - colorType "var(--name)" must name a styles/token
 *    (schema: "a style token reference var(--name) resolved from styles/token"),
 *    and token names must be unique so that resolution is unambiguous.
 */
import { Codes, diagnostic } from '../diagnostics.js';

const PAINT_REF = /^url\(#(.+)\)$/;
const TOKEN_REF = /^var\(--(.+)\)$/;

/** @typedef {import('../xsd/validate.js').ValidNode} ValidNode */
/** @typedef {import('../diagnostics.js').Diagnostic} Diagnostic */
/** @typedef {import('../xsd/typed-value.js').TypedValue} TypedValue */

/**
 * @param {import('../xsd/model.js').SchemaModel} model
 * @param {{ reaches(type: string, target: string): boolean }} simple
 */
export function createSemanticChecker(model, simple) {
  for (const t of ['paintRefType', 'colorType']) {
    if (!(t in model.simpleTypes)) throw new Error(`schema no longer defines ${t}; update src/scene/semantic.js`);
  }
  /** @type {Map<string, { paint: boolean, color: boolean }>} */
  const flags = new Map();
  /** @param {string} type */
  const flagsOf = (type) => {
    let f = flags.get(type);
    if (!f) {
      f = { paint: simple.reaches(type, 'paintRefType'), color: simple.reaches(type, 'colorType') };
      flags.set(type, f);
    }
    return f;
  };

  /** @param {ValidNode} scene @returns {Diagnostic[]} */
  return function check(scene) {
    /** @type {Diagnostic[]} */
    const out = [];
    /** @type {Set<string>} */
    const paints = new Set();
    /** @type {Set<string>} */
    const tokens = new Set();
    for (const section of scene.children) {
      if (section.name === 'paints') {
        for (const p of section.children) paints.add(/** @type {string} */ (p.attributes.id));
      } else if (section.name === 'styles') {
        for (const t of section.children) {
          if (t.name !== 'token') continue;
          const name = /** @type {string} */ (t.attributes.name);
          if (tokens.has(name)) {
            out.push(diagnostic(Codes.TOKEN_DUPLICATE, 'semantic', `token "${name}" is declared more than once`, t.loc, t.path));
          }
          tokens.add(name);
        }
      }
    }

    /** @param {ValidNode} node @param {string} attr @param {TypedValue} value @param {{ paint: boolean, color: boolean }} f */
    const visitValue = (node, attr, value, f) => {
      // No list type in the schema reaches paintRefType or colorType, so
      // flagged attributes always decode to a single string.
      if (typeof value !== 'string') return;
      const p = f.paint ? PAINT_REF.exec(value) : null;
      if (p && !paints.has(/** @type {string} */ (p[1]))) {
        out.push(diagnostic(Codes.PAINT_REF, 'semantic', `@${attr} references "${p[1]}", which is not a paint under /scene/paints`, node.loc, node.path));
      }
      const t = f.color ? TOKEN_REF.exec(value) : null;
      if (t && !tokens.has(/** @type {string} */ (t[1]))) {
        out.push(diagnostic(Codes.TOKEN_REF, 'semantic', `@${attr} references undeclared token "${t[1]}"`, node.loc, node.path));
      }
    };

    /** @param {ValidNode} node */
    const walk = (node) => {
      const def = model.complexTypes[node.type];
      if (def) {
        for (const [attr, value] of Object.entries(node.attributes)) {
          const ad = def.attributes[attr];
          if (ad) visitValue(node, attr, value, flagsOf(ad.type));
        }
      }
      for (const c of node.children) walk(c);
    };
    walk(scene);
    return out;
  };
}
