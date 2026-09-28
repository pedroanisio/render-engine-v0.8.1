/**
 * XSD 1.0 builtin simple types used by the scene schema.
 */

/** @typedef {import('./typed-value.js').TypedValue} TypedValue */

/**
 * @typedef {object} Parsed
 * @property {TypedValue} value
 * @property {number | bigint | null} cmp   comparable value for range facets
 * @property {number | null} length          length for length facets
 * @property {string} key                    value-space identity for enumerations
 * @property {boolean} unsafe                integer outside the IEEE-754 safe range
 */

/**
 * @typedef {object} Builtin
 * @property {'preserve' | 'collapse'} ws
 * @property {(lexical: string) => Parsed | null} parse  receives whitespace-normalised input
 * @property {'ID' | 'IDREF' | null} id
 */

const START = 'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF'
  + '\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD'
  + '\\u{10000}-\\u{EFFFF}';
const REST = `${START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NCNAME = new RegExp(`^[${START}][${REST}]*$`, 'u');
const NMTOKEN = new RegExp(`^[${REST}:]+$`, 'u');
const DOUBLE = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/;
const INTEGER = /^[+-]?[0-9]+$/;
const DATETIME = /^(-?)([1-9][0-9]{4,}|[0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** @param {string} s */
export function collapse(s) {
  return s.replace(/[\t\n\r ]+/g, ' ').replace(/^ | $/g, '');
}

/** @param {string} s @returns {Parsed} */
function str(s) {
  return { value: s, cmp: null, length: [...s].length, key: s, unsafe: false };
}

/** @param {RegExp} re @returns {(s: string) => Parsed | null} */
const matching = (re) => (s) => (re.test(s) ? str(s) : null);

/**
 * @param {bigint | null} min
 * @param {bigint | null} max
 * @param {boolean} alwaysBig
 * @returns {(s: string) => Parsed | null}
 */
function integer(min, max, alwaysBig) {
  return (s) => {
    if (!INTEGER.test(s)) return null;
    const b = BigInt(s);
    if ((min !== null && b < min) || (max !== null && b > max)) return null;
    const unsafe = !alwaysBig && (b > MAX_SAFE || b < -MAX_SAFE);
    const value = alwaysBig || unsafe ? b : Number(b);
    return { value, cmp: b, length: null, key: b.toString(), unsafe };
  };
}

/** @param {string} s @returns {Parsed | null} */
function double(s) {
  let v;
  if (s === 'INF') v = Infinity;
  else if (s === '-INF') v = -Infinity;
  else if (s === 'NaN') v = NaN;
  else if (DOUBLE.test(s)) v = Number(s);
  else return null;
  return { value: v, cmp: v, length: null, key: String(v), unsafe: false };
}

/** @param {string} s @returns {Parsed | null} */
function boolean(s) {
  if (s === 'true' || s === '1') return { value: true, cmp: null, length: null, key: 'true', unsafe: false };
  if (s === 'false' || s === '0') return { value: false, cmp: null, length: null, key: 'false', unsafe: false };
  return null;
}

/** @param {number} y @param {number} m */
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** @param {string} s @returns {Parsed | null} */
function dateTime(s) {
  const m = DATETIME.exec(s);
  if (!m) return null;
  const [, , ys, mo, d, h, mi, se, frac, tz] = m;
  const year = Number(ys);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(se);
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  if (minute > 59 || second > 59) return null;
  if (hour > 24 || (hour === 24 && (minute !== 0 || second !== 0 || /[1-9]/.test(frac ?? '')))) return null;
  if (tz && tz !== 'Z') {
    const th = Number(tz.slice(1, 3));
    const tm = Number(tz.slice(4, 6));
    if (tm > 59 || th > 14 || (th === 14 && tm !== 0)) return null;
  }
  return str(s);
}

/** @type {Record<string, Builtin>} */
export const BUILTINS = {
  'xs:string': { ws: 'preserve', parse: str, id: null },
  'xs:anyURI': { ws: 'collapse', parse: str, id: null },
  'xs:NCName': { ws: 'collapse', parse: matching(NCNAME), id: null },
  'xs:ID': { ws: 'collapse', parse: matching(NCNAME), id: 'ID' },
  'xs:IDREF': { ws: 'collapse', parse: matching(NCNAME), id: 'IDREF' },
  'xs:NMTOKEN': { ws: 'collapse', parse: matching(NMTOKEN), id: null },
  'xs:boolean': { ws: 'collapse', parse: boolean, id: null },
  'xs:double': { ws: 'collapse', parse: double, id: null },
  'xs:dateTime': { ws: 'collapse', parse: dateTime, id: null },
  'xs:integer': { ws: 'collapse', parse: integer(null, null, false), id: null },
  'xs:int': { ws: 'collapse', parse: integer(-(2n ** 31n), 2n ** 31n - 1n, false), id: null },
  'xs:nonNegativeInteger': { ws: 'collapse', parse: integer(0n, null, false), id: null },
  'xs:positiveInteger': { ws: 'collapse', parse: integer(1n, null, false), id: null },
  'xs:unsignedLong': { ws: 'collapse', parse: integer(0n, 2n ** 64n - 1n, true), id: null },
};

/** Builtin list types, expressed as lists of a builtin item with at least one item. */
export const BUILTIN_LISTS = /** @type {Record<string, string>} */ ({
  'xs:IDREFS': 'xs:IDREF',
  'xs:NMTOKENS': 'xs:NMTOKEN',
});
