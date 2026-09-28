/**
 * Compiles an XSD 1.0 document into the schema model (src/xsd/model.js).
 *
 * Supports exactly the constructs the scene schema uses. Anything else
 * throws, so a schema revision that needs new machinery fails the build
 * instead of validating documents incorrectly.
 */
import { parseXml } from '../xml/parse.js';
import { BUILTINS, BUILTIN_LISTS } from './builtins.js';

const XSD = 'http://www.w3.org/2001/XMLSchema';
const FACET_STRINGS = ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'];
const FACET_NUMBERS = ['length', 'minLength', 'maxLength'];

/** @typedef {import('../xml/parse.js').XmlElement} XmlElement */
/** @typedef {import('./model.js').SchemaModel} SchemaModel */
/** @typedef {import('./model.js').Particle} Particle */
/** @typedef {import('./model.js').ComplexTypeDef} ComplexTypeDef */
/** @typedef {import('./model.js').AttributeDef} AttributeDef */

/** @param {XmlElement} el @param {string} name */
function attr(el, name) {
  return el.attributes.find((a) => a.ns === '' && a.local === name)?.value;
}

/** @param {XmlElement} el @returns {XmlElement[]} */
function kids(el) {
  /** @type {XmlElement[]} */
  const out = [];
  for (const c of el.children) {
    if (c.kind !== 'element') continue;
    if (c.ns !== XSD) throw new Error(`unsupported non-XSD element <${c.name}> in schema`);
    if (c.name !== 'annotation') out.push(c);
  }
  return out;
}

/** @param {XmlElement} el @param {string} what */
function required(el, what) {
  const v = attr(el, what);
  if (v === undefined) throw new Error(`<xs:${el.name}> lacks @${what}`);
  return v;
}

/**
 * @param {string} source XSD document text
 * @returns {SchemaModel}
 */
export function compileSchema(source) {
  const parsed = parseXml(source);
  if (!parsed.ok) throw new Error(`XML error in schema: ${parsed.diagnostics[0]?.message}`);
  const schema = parsed.root;
  if (schema.ns !== XSD || schema.name !== 'schema') throw new Error('not an XSD schema document');

  /** @type {Map<string, XmlElement>} */ const simpleSrc = new Map();
  /** @type {Map<string, XmlElement>} */ const complexSrc = new Map();
  /** @type {Map<string, XmlElement>} */ const groupSrc = new Map();
  /** @type {Map<string, XmlElement>} */ const attrGroupSrc = new Map();
  /** @type {XmlElement[]} */ const elements = [];
  const tops = /** @type {Record<string, Map<string, XmlElement>>} */ ({
    simpleType: simpleSrc, complexType: complexSrc, group: groupSrc, attributeGroup: attrGroupSrc,
  });
  for (const k of kids(schema)) {
    if (k.name === 'element') elements.push(k);
    else if (tops[k.name]) tops[k.name]?.set(required(k, 'name'), k);
    else throw new Error(`unsupported top-level <xs:${k.name}>`);
  }

  /** @type {SchemaModel} */
  const model = { version: attr(schema, 'version') ?? '', root: { name: '', type: '' }, simpleTypes: {}, complexTypes: {} };
  /** @type {Map<string, number>} */
  const anonCount = new Map();
  /** @param {string} owner */
  const anonName = (owner) => {
    const n = (anonCount.get(owner) ?? 0) + 1;
    anonCount.set(owner, n);
    return `${owner}~${n}`;
  };

  /** @param {string} qname @returns {string} */
  function simpleRef(qname) {
    if (qname.startsWith('xs:')) {
      if (qname in BUILTINS || qname in BUILTIN_LISTS) return qname;
      throw new Error(`unsupported builtin type ${qname}`);
    }
    if (!(qname in model.simpleTypes)) {
      const src = simpleSrc.get(qname);
      if (!src) throw new Error(`unknown simple type ${qname}`);
      compileSimple(src, qname);
    }
    return qname;
  }

  /** @param {XmlElement} el @param {string} name */
  function compileSimple(el, name) {
    const [body] = kids(el);
    if (!body) throw new Error(`simple type ${name} has no derivation`);
    /** @param {XmlElement} holder @param {string | undefined} ref */
    const refOrInline = (holder, ref) => {
      if (ref !== undefined) return simpleRef(ref);
      const inline = kids(holder).find((k) => k.name === 'simpleType');
      if (!inline) throw new Error(`simple type ${name} lacks a base`);
      const anon = anonName(name);
      compileSimple(inline, anon);
      return anon;
    };
    if (body.name === 'list') {
      model.simpleTypes[name] = { kind: 'list', itemType: refOrInline(body, attr(body, 'itemType')) };
    } else if (body.name === 'union') {
      const members = (attr(body, 'memberTypes') ?? '').split(/\s+/).filter(Boolean).map(simpleRef);
      for (const inline of kids(body)) {
        const anon = anonName(name);
        compileSimple(inline, anon);
        members.push(anon);
      }
      model.simpleTypes[name] = { kind: 'union', memberTypes: members };
    } else if (body.name === 'restriction') {
      const base = refOrInline(body, attr(body, 'base'));
      /** @type {import('./model.js').Facets} */
      const facets = {};
      for (const f of kids(body)) {
        const value = required(f, 'value');
        if (f.name === 'enumeration') (facets.enumeration ??= []).push(value);
        else if (f.name === 'pattern') (facets.patterns ??= []).push(value);
        else if (FACET_STRINGS.includes(f.name)) /** @type {Record<string, string>} */ (facets)[f.name] = value;
        else if (FACET_NUMBERS.includes(f.name)) /** @type {Record<string, number>} */ (facets)[f.name] = Number(value);
        else if (f.name !== 'simpleType') throw new Error(`unsupported facet xs:${f.name} in ${name}`);
      }
      model.simpleTypes[name] = { kind: 'restriction', base, facets };
    } else {
      throw new Error(`unsupported simple type derivation xs:${body.name} in ${name}`);
    }
  }

  /** @type {Set<string>} */
  const inProgress = new Set();

  /** @param {string} qname @returns {ComplexTypeDef} */
  function complexRef(qname) {
    const done = model.complexTypes[qname];
    if (done) return done;
    const src = complexSrc.get(qname);
    if (!src) throw new Error(`unknown complex type ${qname}`);
    if (inProgress.has(qname)) throw new Error(`circular extension through ${qname}`);
    inProgress.add(qname);
    compileComplex(src, qname);
    inProgress.delete(qname);
    return /** @type {ComplexTypeDef} */ (model.complexTypes[qname]);
  }

  /**
   * @param {XmlElement[]} nodes
   * @param {string} owner
   * @param {Record<string, AttributeDef>} into
   */
  function collectAttributes(nodes, owner, into) {
    for (const n of nodes) {
      if (n.name === 'attributeGroup') {
        const ref = required(n, 'ref');
        const g = attrGroupSrc.get(ref);
        if (!g) throw new Error(`unknown attribute group ${ref}`);
        collectAttributes(kids(g), ref, into);
      } else if (n.name === 'attribute') {
        const name = required(n, 'name');
        if (name in into) throw new Error(`duplicate attribute ${name} in ${owner}`);
        if (attr(n, 'fixed') !== undefined) throw new Error(`unsupported fixed attribute ${owner}@${name}`);
        const use = attr(n, 'use') ?? 'optional';
        if (use === 'prohibited') throw new Error(`unsupported prohibited attribute ${owner}@${name}`);
        let type = attr(n, 'type');
        if (type !== undefined) type = simpleRef(type);
        else {
          const inline = kids(n).find((k) => k.name === 'simpleType');
          if (!inline) throw new Error(`untyped attribute ${owner}@${name}`);
          type = `${owner}@${name}`;
          compileSimple(inline, type);
        }
        into[name] = { type, required: use === 'required', default: attr(n, 'default') ?? null };
      }
    }
  }

  /** @param {XmlElement} el */
  function occurs(el) {
    const max = attr(el, 'maxOccurs') ?? '1';
    return { min: Number(attr(el, 'minOccurs') ?? '1'), max: max === 'unbounded' ? null : Number(max) };
  }

  /**
   * @param {XmlElement} el
   * @param {string} owner
   * @param {Record<string, string>} types element name -> type (Element Declarations Consistent)
   * @returns {Particle}
   */
  function particle(el, owner, types) {
    const { min, max } = occurs(el);
    if (el.name === 'element') {
      if (attr(el, 'ref') !== undefined) throw new Error(`unsupported element reference in ${owner}`);
      const name = required(el, 'name');
      let type = attr(el, 'type');
      if (type !== undefined) {
        if (type.startsWith('xs:') || simpleSrc.has(type)) throw new Error(`unsupported simple-typed element ${owner}/${name}`);
        // Existence only: element references may be recursive; every named type is compiled below.
        if (!complexSrc.has(type)) throw new Error(`unknown complex type ${type}`);
      } else {
        const inline = kids(el).find((k) => k.name === 'complexType');
        if (!inline) throw new Error(`unsupported untyped element ${owner}/${name}`);
        type = `${owner}/${name}`;
        compileComplex(inline, type);
      }
      if (types[name] !== undefined && types[name] !== type) {
        throw new Error(`element ${name} has inconsistent types in ${owner}`);
      }
      types[name] = type;
      return { kind: 'element', name, min, max };
    }
    if (el.name === 'sequence' || el.name === 'choice') {
      return { kind: el.name, items: kids(el).map((k) => particle(k, owner, types)), min, max };
    }
    if (el.name === 'group') {
      const ref = required(el, 'ref');
      const g = groupSrc.get(ref);
      if (!g) throw new Error(`unknown group ${ref}`);
      const inner = /** @type {XmlElement} */ (kids(g)[0]);
      const p = particle(inner, ref, types);
      return { ...p, min, max };
    }
    throw new Error(`unsupported particle xs:${el.name} in ${owner}`);
  }

  /** @param {Record<string, string>} into @param {Record<string, string>} from @param {string} owner */
  function mergeTypes(into, from, owner) {
    for (const [k, v] of Object.entries(from)) {
      if (into[k] !== undefined && into[k] !== v) throw new Error(`element ${k} has inconsistent types in ${owner}`);
      into[k] = v;
    }
  }

  /** @param {XmlElement} el @param {string} name */
  function compileComplex(el, name) {
    if (attr(el, 'mixed') === 'true') throw new Error(`unsupported mixed content in ${name}`);
    const children = kids(el);
    /** @type {Record<string, AttributeDef>} */
    const attributes = {};
    /** @type {import('./model.js').ContentDef} */
    let content = { kind: 'empty' };
    const head = children[0];

    /** @param {XmlElement[]} nodes @param {Record<string, string>} types */
    const ownParticle = (nodes, types) => {
      const p = nodes.find((k) => ['sequence', 'choice', 'group', 'all'].includes(k.name));
      return p ? particle(p, name, types) : null;
    };

    if (head && head.name === 'complexContent') {
      const ext = /** @type {XmlElement} */ (kids(head)[0]);
      if (ext.name !== 'extension') throw new Error(`unsupported complexContent ${ext.name} in ${name}`);
      const base = complexRef(required(ext, 'base'));
      if (base.content.kind === 'simple') throw new Error(`unsupported extension of simple content in ${name}`);
      Object.assign(attributes, base.attributes);
      /** @type {Record<string, string>} */
      const types = {};
      if (base.content.kind === 'elements') mergeTypes(types, base.content.elementTypes, name);
      const own = ownParticle(kids(ext), types);
      if (base.content.kind === 'elements' && own) {
        content = { kind: 'elements', particle: { kind: 'sequence', items: [base.content.particle, own], min: 1, max: 1 }, elementTypes: types };
      } else if (base.content.kind === 'elements') {
        content = base.content;
      } else if (own) {
        content = { kind: 'elements', particle: own, elementTypes: types };
      }
      collectAttributes(kids(ext), name, attributes);
    } else if (head && head.name === 'simpleContent') {
      const ext = /** @type {XmlElement} */ (kids(head)[0]);
      if (ext.name !== 'extension') throw new Error(`unsupported simpleContent ${ext.name} in ${name}`);
      const baseName = required(ext, 'base');
      if (complexSrc.has(baseName)) {
        const base = complexRef(baseName);
        if (base.content.kind !== 'simple') throw new Error(`simpleContent base ${baseName} is not simple in ${name}`);
        Object.assign(attributes, base.attributes);
        content = base.content;
      } else {
        content = { kind: 'simple', type: simpleRef(baseName) };
      }
      collectAttributes(kids(ext), name, attributes);
    } else {
      /** @type {Record<string, string>} */
      const types = {};
      const own = ownParticle(children, types);
      if (own) content = { kind: 'elements', particle: own, elementTypes: types };
      collectAttributes(children, name, attributes);
    }
    model.complexTypes[name] = { attributes, content };
  }

  for (const name of simpleSrc.keys()) {
    if (complexSrc.has(name)) throw new Error(`type name ${name} is both simple and complex`);
    simpleRef(name);
  }
  for (const name of complexSrc.keys()) complexRef(name);
  if (elements.length !== 1) throw new Error(`expected exactly one global element, found ${elements.length}`);
  const rootEl = /** @type {XmlElement} */ (elements[0]);
  const rootName = required(rootEl, 'name');
  const rootType = `/${rootName}`;
  const inline = kids(rootEl).find((k) => k.name === 'complexType');
  if (!inline) throw new Error('global element must declare an inline complex type');
  compileComplex(inline, rootType);
  model.root = { name: rootName, type: rootType };
  return model;
}
