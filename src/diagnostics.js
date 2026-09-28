/**
 * Diagnostic model shared by every processing stage.
 *
 * A diagnostic is data: stages never throw for invalid input, they return
 * diagnostics. Exceptions are reserved for programming errors.
 */

/** @typedef {'parse' | 'policy' | 'schema' | 'semantic'} Stage */

/**
 * @typedef {object} Diagnostic
 * @property {DiagnosticCode} code
 * @property {Stage} stage
 * @property {string} message
 * @property {number} line   1-based; 0 when the location is unknown
 * @property {number} column 1-based; 0 when the location is unknown
 * @property {string} path   element path such as /scene/composition/layer[2]
 */

export const Codes = Object.freeze({
  XML_SYNTAX: 'E_XML_SYNTAX',
  DOCTYPE: 'E_DOCTYPE',
  LIMIT_SIZE: 'E_LIMIT_SIZE',
  LIMIT_DEPTH: 'E_LIMIT_DEPTH',
  LIMIT_ELEMENTS: 'E_LIMIT_ELEMENTS',
  XSI_UNSUPPORTED: 'E_XSI_UNSUPPORTED',
  ROOT: 'E_ROOT',
  NAMESPACE: 'E_NAMESPACE',
  ELEMENT_UNEXPECTED: 'E_ELEMENT_UNEXPECTED',
  CONTENT_INCOMPLETE: 'E_CONTENT_INCOMPLETE',
  TEXT_NOT_ALLOWED: 'E_TEXT_NOT_ALLOWED',
  TEXT_VALUE: 'E_TEXT_VALUE',
  ATTR_UNKNOWN: 'E_ATTR_UNKNOWN',
  ATTR_REQUIRED: 'E_ATTR_REQUIRED',
  ATTR_VALUE: 'E_ATTR_VALUE',
  ID_DUPLICATE: 'E_ID_DUPLICATE',
  IDREF_DANGLING: 'E_IDREF_DANGLING',
  INT_RANGE: 'E_INT_RANGE',
  PAINT_REF: 'E_PAINT_REF',
  TOKEN_REF: 'E_TOKEN_REF',
  TOKEN_DUPLICATE: 'E_TOKEN_DUPLICATE',
  RUNTIME_SEMANTIC: 'E_RUNTIME_SEMANTIC',
  RUNTIME_CAPABILITY: 'E_RUNTIME_CAPABILITY',
  ANIM_ORDER: 'E_ANIM_ORDER',
  ANIM_VALUE: 'E_ANIM_VALUE',
  ANIM_PROPERTY: 'E_ANIM_PROPERTY',
  ANIM_UNSUPPORTED: 'E_ANIM_UNSUPPORTED',
});

/** @typedef {typeof Codes[keyof typeof Codes]} DiagnosticCode */

/**
 * @param {DiagnosticCode} code
 * @param {Stage} stage
 * @param {string} message
 * @param {{ line: number, column: number } | null} loc
 * @param {string} path
 * @returns {Diagnostic}
 */
export function diagnostic(code, stage, message, loc, path) {
  return Object.freeze({
    code,
    stage,
    message,
    line: loc ? loc.line : 0,
    column: loc ? loc.column : 0,
    path,
  });
}
