/**
 * Stage 2: element tree -> typed tree, validated against the schema model.
 *
 * Covers everything XSD 1.0 checks for this schema (content models,
 * attributes, simple types, ID uniqueness, IDREF resolution) and reports
 * integers the runtime cannot represent exactly.
 */
import { Codes, diagnostic } from '../diagnostics.js';
import { compileParticle } from './content.js';
import { createSimpleTypes } from './simple.js';

const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const XSI_HINTS = new Set(['schemaLocation', 'noNamespaceSchemaLocation']);

/** @typedef {import('./typed-value.js').TypedValue} TypedValue */
/** @typedef {import('../xml/parse.js').XmlElement} XmlElement */
/** @typedef {import('../diagnostics.js').Diagnostic} Diagnostic */

/**
 * @typedef {object} ValidNode
 * @property {{width:number,height:number}} [logicalSize]
 * @property {string} [selectedRepresentation]
 * @property {{mode:string,width:number,height:number,focusX:number,focusY:number}} [reframe]
 * @property {Record<string,any>} [context] scoped repeat data
 * @property {{width:number,height:number,fit:string}} [sourceBox]
 * @property {ValidNode} [sourceRemap]
 * @property {{duration:number,clipIn:number,clipOut:number,speed:number,loop:number,reverse:boolean}} [sourceClock]
 * @property {string} name
 * @property {string} type                    schema model type name
 * @property {Readonly<Record<string, TypedValue>>} attributes  defaults applied
 * @property {readonly string[]} [specifiedAttributes] attributes present in the XML, before defaults
 * @property {readonly ValidNode[]} children
 * @property {TypedValue | null} value        simple content, when the type has it
 * @property {import('../xml/parse.js').Loc} loc
 * @property {string} path
 */

/**
 * @typedef {object} ValidationResult
 * @property {ValidNode} tree
 * @property {ReadonlyMap<string, ValidNode>} ids
 * @property {Diagnostic[]} diagnostics  at most `maxDiagnostics` entries
 * @property {boolean} valid  false when any problem was found, even if unreported
 */

/** @param {ValidNode} n */
function freeze(n) {
  Object.freeze(n.attributes);
  for (const c of n.children) freeze(c);
  Object.freeze(n.children);
  Object.freeze(n.loc);
  return Object.freeze(n);
}

/** @param {import('./model.js').SchemaModel} model */
export function createValidator(model) {
  const simple = createSimpleTypes(model.simpleTypes);
  /** @type {Map<string, ReturnType<typeof compileParticle>>} */
  const matchers = new Map();

  /** @param {string} type @param {import('./model.js').Particle} p */
  const matcher = (type, p) => {
    let m = matchers.get(type);
    if (!m) {
      m = compileParticle(p);
      matchers.set(type, m);
    }
    return m;
  };

  /**
   * @param {XmlElement} root
   * @param {{ maxDiagnostics?: number }} [options]
   * @returns {ValidationResult}
   */
  function validate(root, options = {}) {
    const cap = options.maxDiagnostics ?? 100;
    // Validity is tracked apart from the reporting cap: a cap of 0 (or any
    // cap that truncates) must never turn an invalid document into a valid one.
    let errors = 0;
    /** @type {Diagnostic[]} */
    const diagnostics = [];
    /** @type {Map<string, ValidNode>} */
    const ids = new Map();
    /** @type {Array<{ id: string, attr: string, node: ValidNode }>} */
    const refs = [];

    /**
     * @param {import('../diagnostics.js').DiagnosticCode} code
     * @param {import('../diagnostics.js').Stage} stage
     * @param {string} message
     * @param {{ loc: import('../xml/parse.js').Loc }} at
     * @param {string} path
     */
    const report = (code, stage, message, at, path) => {
      errors++;
      if (diagnostics.length < cap)
        diagnostics.push(diagnostic(code, stage, message, at.loc, path));
    };

    /** @param {string} name @param {TypedValue} value @param {string} kind @param {ValidNode} node */
    const noteIdentity = (name, value, kind, node) => {
      if (kind === 'ID') {
        const id = /** @type {string} */ (value);
        if (ids.has(id))
          report(Codes.ID_DUPLICATE, 'schema', `duplicate ID "${id}" in @${name}`, node, node.path);
        else ids.set(id, node);
      } else if (kind === 'IDREF')
        refs.push({ id: /** @type {string} */ (value), attr: name, node });
      else for (const v of /** @type {string[]} */ (value)) refs.push({ id: v, attr: name, node });
    };

    /**
     * @param {XmlElement} el
     * @param {string} typeName
     * @param {string} path
     * @returns {ValidNode}
     */
    function element(el, typeName, path) {
      const def = /** @type {import('./model.js').ComplexTypeDef} */ (
        Object.hasOwn(model.complexTypes, typeName) ? model.complexTypes[typeName] : undefined
      );
      /** @type {Record<string, TypedValue>} */
      const attributes = {};
      /** @type {ValidNode[]} */
      const children = [];
      /** @type {ValidNode} */
      const node = {
        name: el.name,
        type: typeName,
        specifiedAttributes: Object.freeze(
          el.attributes.filter((a) => a.ns === '').map((a) => a.local),
        ),
        attributes,
        children,
        value: null,
        loc: el.loc,
        path,
      };

      for (const a of el.attributes) {
        if (a.ns === XSI) {
          if (a.local === 'type' || a.local === 'nil') {
            report(Codes.XSI_UNSUPPORTED, 'policy', `xsi:${a.local} is not supported`, el, path);
          } else if (!XSI_HINTS.has(a.local)) {
            report(Codes.ATTR_UNKNOWN, 'schema', `attribute ${a.name} is not declared`, el, path);
          }
          continue;
        }
        const ad =
          a.ns === '' && Object.hasOwn(def.attributes, a.local) ? def.attributes[a.local] : undefined;
        if (!ad) {
          report(
            Codes.ATTR_UNKNOWN,
            'schema',
            `attribute ${a.name} is not declared on <${el.name}>`,
            el,
            path,
          );
          continue;
        }
        const r = simple.check(ad.type, a.value);
        if (!r.ok) {
          report(Codes.ATTR_VALUE, 'schema', `@${a.local}="${a.value}": ${r.reason}`, el, path);
          continue;
        }
        if (r.unsafe) {
          report(
            Codes.INT_RANGE,
            'semantic',
            `@${a.local}="${a.value}" exceeds the exactly representable integer range`,
            el,
            path,
          );
        }
        attributes[a.local] = r.value;
        const kind = simple.idKind(ad.type);
        if (kind) noteIdentity(a.local, r.value, kind, node);
      }
      for (const [name, ad] of Object.entries(def.attributes)) {
        if (name in attributes || el.attributes.some((a) => a.ns === '' && a.local === name))
          continue;
        if (ad.required)
          report(Codes.ATTR_REQUIRED, 'schema', `required attribute @${name} is missing`, el, path);
        else if (ad.default !== null) {
          const r = simple.check(ad.type, ad.default);
          if (r.ok) attributes[name] = r.value;
        }
      }

      const content = def.content;
      /** @type {XmlElement[]} */
      const elems = [];
      let text = '';
      for (const c of el.children) {
        if (c.kind === 'element') elems.push(c);
        else {
          text += c.text;
          // cvc-complex-type.2.1: empty content admits no character children,
          // not even whitespace; element-only content admits whitespace.
          const forbidden =
            content.kind === 'empty' || (content.kind === 'elements' && /[^\t\n\r ]/.test(c.text));
          if (forbidden)
            report(
              Codes.TEXT_NOT_ALLOWED,
              'schema',
              `<${el.name}> does not allow text content`,
              c,
              path,
            );
        }
      }

      if (content.kind === 'simple') {
        if (elems[0])
          report(
            Codes.ELEMENT_UNEXPECTED,
            'schema',
            `<${elems[0].name}> is not allowed in text-only <${el.name}>`,
            elems[0],
            path,
          );
        const r = simple.check(content.type, text);
        if (r.ok) node.value = r.value;
        else report(Codes.TEXT_VALUE, 'schema', `text of <${el.name}>: ${r.reason}`, el, path);
        return node;
      }
      if (content.kind === 'empty') {
        if (elems[0])
          report(
            Codes.ELEMENT_UNEXPECTED,
            'schema',
            `<${elems[0].name}> is not allowed in empty <${el.name}>`,
            elems[0],
            path,
          );
        return node;
      }

      /** @type {Map<string, number>} */
      const counts = new Map();
      /** @type {string[]} */
      const names = [];
      for (const c of elems) {
        if (c.ns !== '') {
          report(
            Codes.NAMESPACE,
            'schema',
            `<${c.name}> is in namespace ${c.ns}; the scene schema has none`,
            c,
            path,
          );
          continue;
        }
        names.push(c.name);
        const k = (counts.get(c.name) ?? 0) + 1;
        counts.set(c.name, k);
        const childType = Object.hasOwn(content.elementTypes, c.name)
          ? content.elementTypes[c.name]
          : undefined;
        if (childType) children.push(element(c, childType, `${path}/${c.name}[${k}]`));
      }
      const m = matcher(typeName, content.particle).match(names);
      if (!m.ok) {
        const expected = m.expected.length
          ? `expected ${m.expected.map((n) => `<${n}>`).join(', ')}`
          : 'no further element is allowed';
        if (m.kind === 'unexpected') {
          const bad = /** @type {XmlElement} */ (elems.filter((c) => c.ns === '')[m.index]);
          report(
            Codes.ELEMENT_UNEXPECTED,
            'schema',
            `<${bad.name}> is not allowed here; ${expected}`,
            bad,
            path,
          );
        } else {
          report(
            Codes.CONTENT_INCOMPLETE,
            'schema',
            `<${el.name}> is incomplete; ${expected}`,
            el,
            path,
          );
        }
      }
      return node;
    }

    const rootPath = `/${root.name}`;
    /** @type {ValidNode} */
    let tree;
    if (root.ns !== '') {
      report(
        Codes.NAMESPACE,
        'schema',
        `root <${root.name}> is in namespace ${root.ns}; the scene schema has none`,
        root,
        rootPath,
      );
      tree = {
        name: root.name,
        type: '',
        attributes: {},
        children: [],
        value: null,
        loc: root.loc,
        path: rootPath,
      };
    } else if (root.name !== model.root.name) {
      report(
        Codes.ROOT,
        'schema',
        `root element must be <${model.root.name}>, found <${root.name}>`,
        root,
        rootPath,
      );
      tree = {
        name: root.name,
        type: '',
        attributes: {},
        children: [],
        value: null,
        loc: root.loc,
        path: rootPath,
      };
    } else {
      tree = element(root, model.root.type, rootPath);
    }
    const grid = tree.children
      .find((n) => n.name === 'markers')
      ?.children.find((n) => n.name === 'beatGrid');
    const projectDuration = Number(
      tree.children.find((n) => n.name === 'project')?.attributes.duration,
    );
    for (const r of refs) {
      const generated = /^(beat|bar)\.(\d+)$/.exec(r.id);
      const generatedTime =
        generated && grid
          ? Number(grid.attributes.offset) +
            (Number(generated[2]) *
              (generated[1] === 'bar' ? Number(grid.attributes.beatsPerBar) : 1) *
              60) /
              Number(grid.attributes.bpm)
          : Infinity;
      if (
        generated &&
        ['marker', 'startMarker', 'endMarker'].includes(r.attr) &&
        generatedTime <= projectDuration
      )
        continue;
      if (!ids.has(r.id))
        report(
          Codes.IDREF_DANGLING,
          'schema',
          `@${r.attr} references unknown ID "${r.id}"`,
          r.node,
          r.node.path,
        );
    }
    return { tree: freeze(tree), ids, diagnostics, valid: errors === 0 };
  }

  return { validate, simple };
}
