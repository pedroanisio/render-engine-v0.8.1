/**
 * Translates an XSD 1.0 regular expression into JavaScript source (u flag).
 *
 * Only the subset whose semantics are identical in both dialects is
 * accepted; everything else throws so a schema change can never be
 * silently mistranslated.
 */

const SINGLE_ESCAPES = new Set(['.', '\\', '?', '*', '+', '(', ')', '{', '}', '[', ']', '|', '^', '-', '$', '/']);
const CONTROL_ESCAPES = /** @type {Record<string, string>} */ ({ n: '\\n', r: '\\r', t: '\\t' });

/**
 * @param {string} pattern XSD pattern facet value
 * @returns {string} anchored JavaScript regex source
 */
export function translatePattern(pattern) {
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = /** @type {string} */ (pattern[i]);
    if (c === '\\') {
      const n = pattern[i + 1];
      i++;
      if (n !== undefined && n in CONTROL_ESCAPES) out += CONTROL_ESCAPES[n];
      else if (n !== undefined && SINGLE_ESCAPES.has(n)) {
        // In u-mode JS rejects "\-" outside a class and "\/" nowhere matters.
        out += n === '-' && !inClass ? '-' : `\\${n}`;
      } else {
        throw new Error(`unsupported XSD escape \\${n ?? ''} in pattern ${pattern}`);
      }
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      else if (c === '-' && pattern[i + 1] === '[') {
        throw new Error(`unsupported XSD class subtraction in pattern ${pattern}`);
      }
      out += c;
      continue;
    }
    if (c === '[') {
      inClass = true;
      out += c;
      if (pattern[i + 1] === '^') {
        out += '^';
        i++;
      }
    } else if (c === '^' || c === '$') out += `\\${c}`;
    else if (c === '.') out += '[^\\n\\r]';
    else out += c;
  }
  return `^(?:${out})$`;
}
