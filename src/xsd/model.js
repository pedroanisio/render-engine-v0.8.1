/**
 * Compiled schema model: the contract between the code generator
 * (scripts/codegen.js) and the runtime validator. Type references are
 * strings: builtins as "xs:<name>", everything else by model name.
 */

/**
 * @typedef {object} Facets
 * @property {string[]} [enumeration]
 * @property {string[]} [patterns]      alternatives from one derivation step
 * @property {string} [minInclusive]
 * @property {string} [maxInclusive]
 * @property {string} [minExclusive]
 * @property {string} [maxExclusive]
 * @property {number} [length]
 * @property {number} [minLength]
 * @property {number} [maxLength]
 */

/**
 * @typedef {{ kind: 'restriction', base: string, facets: Facets }
 *   | { kind: 'list', itemType: string }
 *   | { kind: 'union', memberTypes: string[] }} SimpleTypeDef
 */

/**
 * @typedef {{ kind: 'element', name: string, min: number, max: number | null }
 *   | { kind: 'sequence' | 'choice', items: Particle[], min: number, max: number | null }} Particle
 * max null means unbounded.
 */

/**
 * @typedef {object} AttributeDef
 * @property {string} type
 * @property {boolean} required
 * @property {string | null} default
 */

/**
 * @typedef {{ kind: 'empty' }
 *   | { kind: 'simple', type: string }
 *   | { kind: 'elements', particle: Particle, elementTypes: Record<string, string> }} ContentDef
 */

/**
 * @typedef {object} ComplexTypeDef
 * @property {Record<string, AttributeDef>} attributes
 * @property {ContentDef} content
 */

/**
 * @typedef {object} SchemaModel
 * @property {string} version
 * @property {{ name: string, type: string }} root
 * @property {Record<string, SimpleTypeDef>} simpleTypes
 * @property {Record<string, ComplexTypeDef>} complexTypes
 */

export {};
