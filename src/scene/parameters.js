import { createHash } from 'node:crypto';
import { propertyValue, simple } from '../eval/value.js';
import { timecode, fpsOf } from '../eval/clock.js';
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {import('../eval/value.js').Value} Value */
/** @typedef {{parameters?:Record<string,Value>,variant?:string,layout?:string,data?:string,row?:number,read?:(src:string)=>string}} ParameterOptions */
/** RFC4180 quoting, shared by CSV and TSV. @param {string} source @param {string} delimiter */
export function rows(source, delimiter) {
  /** @type {string[][]} */ const result = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === '\n')) {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (c === '\n') {
        result.push(row);
        row = [];
      }
    } else field += c;
  }
  if (quoted) throw new Error('unterminated quoted data field');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    result.push(row);
  }
  const header = result.shift() ?? [];
  if (new Set(header).size !== header.length) throw new Error('duplicate data column');
  return result.map((r) => {
    if (r.length !== header.length) throw new Error('inconsistent data row width');
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}
/** Resolve precedence: default < variant set < data row < caller parameters; binds < variant overrides. */
export function resolveParameters(
  /** @type {Node} */ scene,
  /** @type {ParameterOptions} */ options = {},
) {
  const section = scene.children.find((n) => n.name === 'parameters');
  const declared = new Map(
    (section?.children.filter((n) => n.name === 'param') ?? []).map((n) => [
      String(n.attributes.id),
      n,
    ]),
  );
  const variants = section?.children.filter((n) => n.name === 'variant') ?? [];
  const layout = options.layout
    ? scene.children
        .find((n) => n.name === 'layouts')
        ?.children.find((n) => n.attributes.id === options.layout)
    : undefined;
  if (options.layout && !layout) throw new Error(`unknown layout ${options.layout}`);
  const variant = options.variant
    ? variants.find((n) => n.attributes.id === options.variant)
    : undefined;
  if (options.variant && !variant) throw new Error(`unknown variant ${options.variant}`);
  /** @type {Record<string,Value>} */ const params = Object.create(null);
  for (const [id, n] of declared)
    if (n.attributes.default !== undefined) params[id] = n.attributes.default;
  for (const n of variant?.children ?? [])
    if (n.name === 'set') params[String(n.attributes.param)] = String(n.attributes.value);
  /** @type {Map<string,Record<string,Value>[]>} */ const data = new Map();
  for (const d of section?.children.filter((n) => n.name === 'data') ?? []) {
    const source =
      d.attributes.src === undefined
        ? String(d.value ?? '')
        : options.read?.(String(d.attributes.src));
    if (source === undefined) throw new Error(`data ${String(d.attributes.id)} needs a reader`);
    if (
      d.attributes.sha256 &&
      createHash('sha256').update(source).digest('hex') !== d.attributes.sha256
    )
      throw new Error('data sha256 mismatch');
    const parsed =
      d.attributes.format === 'json'
        ? JSON.parse(source)
        : rows(source, d.attributes.format === 'tsv' ? '\t' : ',');
    if (
      !Array.isArray(parsed) ||
      parsed.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
    )
      throw new Error('data must be an array of objects');
    data.set(String(d.attributes.id), parsed);
  }
  if (options.data) {
    const row = data.get(options.data)?.[options.row ?? 0];
    if (!row) throw new Error('data row does not exist');
    for (const [k, v] of Object.entries(row)) if (declared.has(k)) params[k] = v;
  }
  Object.assign(params, options.parameters);
  const fps = fpsOf(scene.children.find((n) => n.name === 'project')?.attributes.fps).value;
  for (const [id, raw] of Object.entries(params)) {
    const n = declared.get(id);
    if (!n) throw new Error(`unknown parameter ${id}`);
    const a = n.attributes,
      text = String(raw);
    let value = raw;
    if (a.type === 'number') value = Number(text);
    if (a.type === 'time') value = timecode(text, fps);
    if (a.type === 'boolean') {
      if (!['true', 'false', '1', '0'].includes(text)) throw new Error(`invalid boolean ${id}`);
      value = text === 'true' || text === '1';
    }
    if (a.type === 'list') {
      value = Array.isArray(raw) ? raw : JSON.parse(text);
      if (!Array.isArray(value)) throw new Error(`invalid list ${id}`);
    }
    if (a.type === 'color' && !simple.check('colorType', text).ok)
      throw new Error(`invalid color ${id}`);
    if (
      (a.type === 'number' || a.type === 'time') &&
      (typeof value !== 'number' || !Number.isFinite(value))
    )
      throw new Error(`invalid number ${id}`);
    if (
      typeof value === 'number' &&
      (value < Number(a.min ?? -Infinity) || value > Number(a.max ?? Infinity))
    )
      throw new Error(`parameter ${id} outside bounds`);
    if (a.maxLength !== undefined && text.length > Number(a.maxLength))
      throw new Error(`parameter ${id} too long`);
    if (a.pattern !== undefined && !new RegExp(String(a.pattern), 'u').test(text))
      throw new Error(`parameter ${id} does not match pattern`);
    if (
      a.options !== undefined &&
      !String(a.options)
        .split(/[|,;]/)
        .map((s) => s.trim())
        .includes(text)
    )
      throw new Error(`parameter ${id} not in options`);
    params[id] = value;
  }
  for (const [id, n] of declared)
    if (n.attributes.required === true && params[id] === undefined)
      throw new Error(`required parameter ${id} missing`);
  /** @type {Map<string,Node>} */ const ids = new Map();
  /** @param {Node} n @param {string[]} [variables] @returns {Node} */
  const clone = (n, variables = []) => {
    const scoped =
      n.name === 'repeat' ? [...variables, String(n.attributes.var ?? 'item')] : variables;
    const attributes = { ...n.attributes };
    for (const [k, v] of Object.entries(attributes))
      if (typeof v === 'string' && v.includes('{{'))
        attributes[k] = propertyValue(
          n,
          k,
          v.replace(/\{\{([\w.-]+)\}\}/g, (_, id) => {
            if (params[id] === undefined && scoped.includes(id.split('.')[0]))
              return '{{' + id + '}}';
            if (params[id] === undefined) throw new Error(`unknown parameter ${id}`);
            return String(params[id]);
          }),
        );
    const copy = {
      ...n,
      attributes,
      children: n.children.map((c) => clone(c, scoped)),
    };
    if (attributes.id !== undefined) ids.set(String(attributes.id), copy);
    return copy;
  };
  const resolved = clone(scene);
  if (layout) {
    const project = resolved.children.find((n) => n.name === 'project');
    if (project) {
      const a = layout.attributes;
      resolved.reframe =
        a.reframe === 'reflow'
          ? undefined
          : {
              mode: String(a.reframe),
              width: Number(project.attributes.width),
              height: Number(project.attributes.height),
              focusX: Number(a.focusX),
              focusY: Number(a.focusY),
            };
      Object.assign(
        project.attributes,
        { width: a.width, height: a.height },
        a.safeArea === undefined ? {} : { safeArea: a.safeArea },
      );
    }
  }

  /** @param {string} id @param {string} prop @param {Value} value */
  const assign = (id, prop, value) => {
    const n = ids.get(id);
    if (!n) throw new Error(`unknown override target ${id}`);
    /** @type {Record<string,Value>} */ (n.attributes)[prop] = propertyValue(
      n,
      prop,
      String(value),
    );
    n.specifiedAttributes = [
      ...new Set([...(n.specifiedAttributes ?? Object.keys(n.attributes)), prop]),
    ];
  };
  for (const b of section?.children.filter((n) => n.name === 'bind') ?? []) {
    let value = params[String(b.attributes.param)];
    if (value === undefined) throw new Error(`unbound parameter ${String(b.attributes.param)}`);
    if (b.attributes.map !== undefined) {
      const map = new Map(
        String(b.attributes.map)
          .split(';')
          .map((p) => {
            const at = p.indexOf('=');
            if (at < 0) throw new Error('invalid bind map');
            return [p.slice(0, at), p.slice(at + 1)];
          }),
      );
      value = map.get(String(value)) ?? value;
    }
    assign(String(b.attributes.target), String(b.attributes.property), value);
  }
  for (const o of [...(layout?.children ?? []), ...(variant?.children ?? [])])
    if (o.name === 'override')
      assign(
        String(o.attributes.target),
        String(o.attributes.property),
        String(o.attributes.value),
      );
  for (const [id, n] of declared)
    if (
      n.attributes.type === 'asset' &&
      params[id] !== undefined &&
      !resolved.children
        .find((n) => n.name === 'assets')
        ?.children.some((n) => n.attributes.id === params[id])
    )
      throw new Error(`parameter ${id} must reference an asset`);
  return { scene: resolved, params, data, ids };
}
