/**
 * Simple-type validation and decoding against the compiled schema model.
 */
import { BUILTINS, BUILTIN_LISTS, collapse } from './builtins.js';
import { translatePattern } from './regex.js';

/** @typedef {import('./builtins.js').TypedValue} TypedValue */
/** @typedef {import('./builtins.js').Parsed} Parsed */
/** @typedef {{ ok: true, value: TypedValue, unsafe: boolean } | { ok: false, reason: string }} SimpleResult */
/** @typedef {({ ok: true } & Parsed) | { ok: false, reason: string }} Inner */
/** @typedef {(lexical: string) => Inner} Validator */

/**
 * @param {Record<string, import('./model.js').SimpleTypeDef>} defs
 */
export function createSimpleTypes(defs) {
  /** @type {Map<string, Validator>} */
  const compiled = new Map();
  /** @type {Set<string>} */
  const building = new Set();

  /** @param {string} name @returns {'preserve' | 'collapse'} */
  function whitespace(name) {
    const b = BUILTINS[name];
    if (b) return b.ws;
    const def = defs[name];
    if (def && def.kind === 'restriction') return whitespace(def.base);
    return def && def.kind === 'list' ? 'collapse' : 'preserve';
  }

  /** @param {string} name @returns {Validator} */
  function get(name) {
    const hit = compiled.get(name);
    if (hit) return hit;
    if (building.has(name)) throw new Error(`circular simple type ${name}`);
    building.add(name);
    const v = build(name);
    building.delete(name);
    compiled.set(name, v);
    return v;
  }

  /** @param {string} name @returns {Validator} */
  function build(name) {
    const b = BUILTINS[name];
    if (b) {
      return (lex) => {
        const p = b.parse(b.ws === 'collapse' ? collapse(lex) : lex);
        return p ? { ok: true, ...p } : { ok: false, reason: `not a valid ${name}` };
      };
    }
    const listItem = BUILTIN_LISTS[name];
    if (listItem) return list(get(listItem), 1);
    const def = defs[name];
    if (!def) throw new Error(`unknown simple type ${name}`);
    if (def.kind === 'list') return list(get(def.itemType), 0);
    if (def.kind === 'union') {
      const members = def.memberTypes.map(get);
      return (lex) => {
        for (const m of members) {
          const r = m(lex);
          if (r.ok) return r;
        }
        return { ok: false, reason: `matches no member of ${name}` };
      };
    }
    return restriction(name, def.base, def.facets);
  }

  /** @param {Validator} item @param {number} minItems @returns {Validator} */
  function list(item, minItems) {
    return (lex) => {
      const c = collapse(lex);
      const parts = c === '' ? [] : c.split(' ');
      if (parts.length < minItems) return { ok: false, reason: 'list must not be empty' };
      /** @type {TypedValue[]} */
      const value = [];
      let unsafe = false;
      for (const p of parts) {
        const r = item(p);
        if (!r.ok) return { ok: false, reason: `list item ${JSON.stringify(p)}: ${r.reason}` };
        value.push(r.value);
        unsafe ||= r.unsafe;
      }
      return { ok: true, value, cmp: null, length: parts.length, key: c, unsafe };
    };
  }

  /**
   * @param {string} name
   * @param {string} baseName
   * @param {import('./model.js').Facets} f
   * @returns {Validator}
   */
  function restriction(name, baseName, f) {
    const base = get(baseName);
    const ws = whitespace(baseName);
    /** @param {string} lit */
    const literal = (lit) => {
      const r = base(lit);
      if (!r.ok) throw new Error(`invalid facet value ${JSON.stringify(lit)} in ${name}`);
      return r;
    };
    const patterns = f.patterns?.map((p) => new RegExp(translatePattern(p), 'u'));
    const enumKeys = f.enumeration && new Set(f.enumeration.map((e) => {
      const r = base(e);
      if (!r.ok) throw new Error(`invalid enumeration ${JSON.stringify(e)} in ${name}`);
      return r.key;
    }));
    /** @type {Array<[(a: number | bigint, b: number | bigint) => boolean, number | bigint | null, string]>} */
    const bounds = [];
    /**
     * @param {string | undefined} lit
     * @param {(a: number | bigint, b: number | bigint) => boolean} test
     * @param {string} label
     */
    const bound = (lit, test, label) => {
      if (lit !== undefined) bounds.push([test, literal(lit).cmp, `${label} ${lit}`]);
    };
    bound(f.minInclusive, (a, b) => a >= b, '>=');
    bound(f.maxInclusive, (a, b) => a <= b, '<=');
    bound(f.minExclusive, (a, b) => a > b, '>');
    bound(f.maxExclusive, (a, b) => a < b, '<');

    return (lex) => {
      const r = base(lex);
      if (!r.ok) return r;
      if (patterns) {
        const norm = ws === 'collapse' ? collapse(lex) : lex;
        if (!patterns.some((p) => p.test(norm))) return { ok: false, reason: `does not match the pattern of ${name}` };
      }
      if (enumKeys && !enumKeys.has(r.key)) return { ok: false, reason: `not one of ${f.enumeration?.join(', ')}` };
      for (const [test, lim, label] of bounds) {
        if (r.cmp === null || lim === null || !test(r.cmp, lim)) return { ok: false, reason: `must be ${label}` };
      }
      if (f.length !== undefined || f.minLength !== undefined || f.maxLength !== undefined) {
        const n = r.length ?? -1;
        if ((f.length !== undefined && n !== f.length)
          || (f.minLength !== undefined && n < f.minLength)
          || (f.maxLength !== undefined && n > f.maxLength)) {
          return { ok: false, reason: `length ${n} violates the length facets of ${name}` };
        }
      }
      return r;
    };
  }

  /**
   * @param {string} name
   * @returns {'ID' | 'IDREF' | 'IDREFS' | null}
   */
  function idKind(name) {
    const b = BUILTINS[name];
    if (b) return b.id;
    if (name === 'xs:IDREFS') return 'IDREFS';
    const def = defs[name];
    if (!def || def.kind === 'union') return null;
    if (def.kind === 'list') return idKind(def.itemType) === 'IDREF' ? 'IDREFS' : null;
    return idKind(def.base);
  }

  /** @param {string} name @param {string} target @returns {boolean} */
  function reaches(name, target) {
    if (name === target) return true;
    const def = defs[name];
    if (!def) return false;
    if (def.kind === 'restriction') return reaches(def.base, target);
    if (def.kind === 'list') return reaches(def.itemType, target);
    return def.memberTypes.some((m) => reaches(m, target));
  }

  return {
    /** @param {string} name @param {string} lexical @returns {SimpleResult} */
    check(name, lexical) {
      const r = get(name)(lexical);
      return r.ok ? { ok: true, value: r.value, unsafe: r.unsafe } : r;
    },
    idKind,
    reaches,
  };
}
