/**
 * Stage 1: XML text -> namespace-resolved element tree.
 *
 * Uses saxes in strict, namespace-aware mode. DOCTYPE declarations are
 * rejected outright, so no entity or external resource is ever expanded.
 */
import { SaxesParser } from 'saxes';
import { Codes, diagnostic } from '../diagnostics.js';

const XMLNS_URI = 'http://www.w3.org/2000/xmlns/';

/** @typedef {{ line: number, column: number }} Loc */
/**
 * @typedef {object} XmlAttr
 * @property {string} name   qualified name as written
 * @property {string} local
 * @property {string} ns     namespace URI, '' when unqualified
 * @property {string} value  normalised attribute value
 */
/** @typedef {{ kind: 'text', text: string, loc: Loc }} XmlText */
/**
 * @typedef {object} XmlElement
 * @property {'element'} kind
 * @property {string} name   local name
 * @property {string} ns     namespace URI, '' when none
 * @property {XmlAttr[]} attributes
 * @property {XmlNode[]} children
 * @property {Loc} loc
 */
/** @typedef {XmlElement | XmlText} XmlNode */

/**
 * @typedef {object} ParseLimits
 * @property {number} [maxBytes]    UTF-8 size of the input
 * @property {number} [maxDepth]    element nesting depth
 * @property {number} [maxElements] total element count
 */

export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxDepth: 256,
  maxElements: 2_000_000,
});

/**
 * @typedef {{ ok: true, root: XmlElement }
 *   | { ok: false, diagnostics: import('../diagnostics.js').Diagnostic[] }} ParseResult
 */

class Abort {
  /** @param {import('../diagnostics.js').Diagnostic} d */
  constructor(d) {
    this.diagnostic = d;
  }
}

/** @param {string} s */
function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * @param {string} source
 * @param {ParseLimits} [limits]
 * @returns {ParseResult}
 */
export function parseXml(source, limits = {}) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (utf8Length(source) > lim.maxBytes) {
    return fail(diagnostic(Codes.LIMIT_SIZE, 'policy',
      `document exceeds ${lim.maxBytes} bytes`, null, ''));
  }

  const parser = new SaxesParser({ xmlns: true, position: true });
  /** @type {XmlElement[]} */
  const stack = [];
  /** @type {XmlElement | null} */
  let root = null;
  let count = 0;
  /** @type {Loc} */
  let tagLoc = { line: 1, column: 1 };

  const here = () => ({ line: parser.line, column: parser.column + 1 });

  /** @param {string} text */
  const addText = (text) => {
    const top = stack[stack.length - 1];
    if (!top) return; // whitespace outside the root element
    const last = top.children[top.children.length - 1];
    if (last && last.kind === 'text') last.text += text;
    else top.children.push({ kind: 'text', text, loc: here() });
  };

  parser.on('error', (err) => {
    throw new Abort(diagnostic(Codes.XML_SYNTAX, 'parse',
      err.message.replace(/^[^:]*:\d+:\d+: /, ''), here(), ''));
  });
  parser.on('doctype', () => {
    throw new Abort(diagnostic(Codes.DOCTYPE, 'policy',
      'DOCTYPE declarations are not accepted', here(), ''));
  });
  parser.on('opentagstart', () => {
    tagLoc = here();
  });
  parser.on('opentag', (tag) => {
    count += 1;
    if (count > lim.maxElements) {
      throw new Abort(diagnostic(Codes.LIMIT_ELEMENTS, 'policy',
        `document exceeds ${lim.maxElements} elements`, tagLoc, ''));
    }
    if (stack.length + 1 > lim.maxDepth) {
      throw new Abort(diagnostic(Codes.LIMIT_DEPTH, 'policy',
        `element nesting exceeds depth ${lim.maxDepth}`, tagLoc, ''));
    }
    /** @type {XmlAttr[]} */
    const attributes = [];
    for (const a of Object.values(tag.attributes)) {
      if (a.uri === XMLNS_URI) continue;
      attributes.push({ name: a.name, local: a.local, ns: a.uri, value: a.value });
    }
    /** @type {XmlElement} */
    const el = {
      kind: 'element', name: tag.local, ns: tag.uri, attributes, children: [], loc: tagLoc,
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else root = el;
    stack.push(el);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('text', addText);
  parser.on('cdata', addText);

  try {
    parser.write(source).close();
  } catch (e) {
    if (e instanceof Abort) return fail(e.diagnostic);
    throw e;
  }
  if (!root) {
    return fail(diagnostic(Codes.XML_SYNTAX, 'parse', 'document has no root element', null, ''));
  }
  return { ok: true, root };
}

/** @param {import('../diagnostics.js').Diagnostic} d @returns {ParseResult} */
function fail(d) {
  return { ok: false, diagnostics: [d] };
}
