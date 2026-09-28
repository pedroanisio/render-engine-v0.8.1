/**
 * Emits the generated artefacts from a compiled schema model: the runtime
 * model module and TypeScript declarations for every attribute set.
 */

/** @typedef {import('./model.js').SchemaModel} SchemaModel */

const NUMBER = new Set(['xs:double', 'xs:integer', 'xs:int', 'xs:nonNegativeInteger', 'xs:positiveInteger']);

/** @param {string} s */
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** @param {string} name */
export function identifier(name) {
  const id = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map((p) => p[0]?.toUpperCase() + p.slice(1)).join('');
  return /^[0-9]/.test(id) ? `_${id}` : id;
}

/**
 * @param {SchemaModel} model
 * @param {string} sourcePath
 */
export function emitModelModule(model, sourcePath) {
  return `// Generated from ${sourcePath} by scripts/codegen.js. Do not edit.\n`
    + `/** @type {import('../xsd/model.js').SchemaModel} */\n`
    + `export const MODEL = ${JSON.stringify(model, null, 1)};\n`;
}

/** @param {SchemaModel} model */
export function emitTypes(model) {
  /** @param {string} name @returns {string[]} */
  const tsParts = (name) => {
    if (NUMBER.has(name)) return ['number'];
    if (name === 'xs:unsignedLong') return ['bigint'];
    if (name === 'xs:boolean') return ['boolean'];
    if (name === 'xs:IDREFS' || name === 'xs:NMTOKENS') return ['Array<string>'];
    const def = model.simpleTypes[name];
    if (!def) return ['string'];
    if (def.kind === 'list') return [`Array<${tsParts(def.itemType).join(' | ')}>`];
    if (def.kind === 'union') return [...new Set(def.memberTypes.flatMap(tsParts))];
    const base = tsParts(def.base);
    return def.facets.enumeration && base[0] === 'string' ? def.facets.enumeration.map(quote) : base;
  };

  /** @type {Map<string, string>} */
  const seen = new Map();
  let out = '// Generated from the scene-render schema by scripts/codegen.js. Do not edit.\n'
    + '// Attribute sets after decoding: defaulted attributes are always present.\n\n';
  let index = 'export interface AttributesByType {\n';
  for (const [name, def] of Object.entries(model.complexTypes)) {
    const id = `${identifier(name)}Attributes`;
    const prior = seen.get(id);
    if (prior !== undefined) throw new Error(`types ${prior} and ${name} collide as ${id}`);
    seen.set(id, name);
    const props = Object.entries(def.attributes).map(([a, d]) => {
      const opt = d.required || d.default !== null ? '' : '?';
      return `  ${quote(a)}${opt}: ${tsParts(d.type).join(' | ')};\n`;
    });
    out += props.length ? `export interface ${id} {\n${props.join('')}}\n\n` : `export interface ${id} {}\n\n`;
    index += `  ${quote(name)}: ${id};\n`;
  }
  return `${out}${index}}\n`;
}
