/** Namespace and expand reusable visual structure before animation compilation. */
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { MODEL } from '../generated/model.js';
import { simple, propertyValue } from '../eval/value.js';
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {{read?:(src:string)=>string,load?:(xml:string)=>{ok:boolean,scene?:Node,diagnostics?:unknown},maxInstances?:number}} Options */
/** @param {Node} input @param {Record<string,any>} params @param {Map<string,Record<string,any>[]>} data @param {Options} options */
export function expandScene(input, params, data, options = {}) {
  let count = 0;
  const budget = options.maxInstances ?? 10000;
  const symbols = new Map(
    (input.children.find((n) => n.name === 'symbols')?.children ?? []).map((n) => [
      String(n.attributes.id),
      n,
    ]),
  );
  /** @type {Map<string,Node[]>} */ const merged = new Map();
  /** @param {Node[]} nodes @param {string} prefix @param {Node[]} overrides @param {Record<string,any>} [context] @returns {Node[]} */
  const scope = (nodes, prefix, overrides, context = {}) => {
    const names = new Map(),
      tokens = new Map();
    const index = (/** @type {Node} */ n) => {
      if (n.name === 'token')
        tokens.set(String(n.attributes.name), prefix + '__' + String(n.attributes.name));
      if (n.attributes.id !== undefined)
        names.set(String(n.attributes.id), prefix + '__' + String(n.attributes.id));
      for (const c of n.children) index(c);
    };
    for (const n of nodes) index(n);
    for (const o of overrides)
      if (!names.has(String(o.attributes.target)))
        throw new Error(`unknown scoped override ${String(o.attributes.target)}`);
    const rewrite = (/** @type {string} */ s) =>
      s
        .replace(/var\(--([^)]*)\)/g, (_, name) => `var(--${tokens.get(name) ?? name})`)
        .replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${names.get(id) ?? id})`)
        .replace(/\bprop\((['"])(.*?)\1\)/g, (_, q, ref) => {
          const dot = ref.lastIndexOf('.');
          return `prop(${q}${names.get(ref.slice(0, dot)) ?? ref.slice(0, dot)}${ref.slice(dot)}${q})`;
        })
        .replace(/\{\{([^}]+)\}\}/g, (original, key) => {
          let value = context;
          for (const part of key.split('.')) value = value?.[part];
          return value === undefined ? original : String(value);
        });
    /** @param {Node} n @returns {Node} */ const clone = (n) => {
      const a = { ...n.attributes };
      for (const [k, v] of Object.entries(a)) {
        const type = MODEL.complexTypes[n.type]?.attributes[k]?.type;
        if (k === 'name' && n.name === 'token') a[k] = tokens.get(String(v)) ?? v;
        else if (k === 'id') a[k] = names.get(String(v)) ?? v;
        else if (type && simple.idKind(type)?.startsWith('IDREF'))
          a[k] = Array.isArray(v)
            ? v.map((x) => names.get(String(x)) ?? x)
            : (names.get(String(v)) ?? v);
        else if (typeof v === 'string') {
          a[k] = rewrite(v);
          if (k === 'source' && n.name === 'link') {
            const dot = v.lastIndexOf('.');
            a[k] = (names.get(v.slice(0, dot)) ?? v.slice(0, dot)) + v.slice(dot);
          }
        }
      }
      for (const o of overrides)
        if (o.attributes.target === n.attributes.id)
          a[String(o.attributes.property)] = propertyValue(
            n,
            String(o.attributes.property),
            rewrite(String(o.attributes.value)),
          );
      return {
        ...n,
        attributes: a,
        value: typeof n.value === 'string' ? rewrite(n.value) : n.value,
        path: prefix + n.path,
        context: { ...n.context, ...context },
        children: n.children.map(clone),
      };
    };
    return nodes.map(clone);
  };
  /** @param {Node} n @param {string[]} stack @param {string[]} files @param {string} directory @returns {Node} */
  const walk = (n, stack, files, directory) => {
    if (++count > budget) throw new Error('scene expansion exceeds node budget');
    const a = n.attributes,
      id = String(a.id ?? n.path);
    if (n.name === 'instance') {
      const symbol = symbols.get(String(a.symbol));
      if (!symbol) throw new Error(`unknown symbol ${String(a.symbol)}`);
      if (stack.includes(String(a.symbol))) throw new Error('recursive symbol instantiation');
      const duration = Number(
          symbol.attributes.duration ??
            input.children.find((n) => n.name === 'project')?.attributes.duration,
        ),
        children = scope(
          symbol.children.slice(),
          id,
          n.children.filter((n) => n.name === 'override'),
          n.context,
        );
      return {
        ...n,
        name: 'group',
        type: 'groupType',
        attributes: {
          ...Object.fromEntries(
            Object.entries(a).filter(
              ([k]) => k in (MODEL.complexTypes.groupType?.attributes ?? {}),
            ),
          ),
          width:
            a.boxWidth ??
            symbol.attributes.width ??
            input.children.find((n) => n.name === 'project')?.attributes.width ??
            1,
          height:
            a.boxHeight ??
            symbol.attributes.height ??
            input.children.find((n) => n.name === 'project')?.attributes.height ??
            1,
          clip: a.fit === 'cover' || a.fit === 'contain-blur',
        },
        sourceBox: {
          width: Number(
            symbol.attributes.width ??
              input.children.find((n) => n.name === 'project')?.attributes.width,
          ),
          height: Number(
            symbol.attributes.height ??
              input.children.find((n) => n.name === 'project')?.attributes.height,
          ),
          fit: String(a.fit ?? 'none'),
        },

        children: [
          ...n.children.filter((c) => !['override', 'timeRemap'].includes(c.name)),
          {
            ...n,
            name: 'group',
            type: 'groupType',
            attributes: { id: id + '__source' },
            specifiedAttributes: [],
            sourceRemap: n.children.find((c) => c.name === 'timeRemap'),
            sourceClock: {
              duration,
              clipIn: Number(a.clipIn ?? 0),
              clipOut: Number(a.clipOut ?? duration),
              speed: Number(a.speed ?? 1),
              loop: Number(a.loop ?? 0),
              reverse: a.reverse === true,
            },
            children: children.map((c) =>
              walk(c, [...stack, String(a.symbol)], files, directory),
            ),
          },
        ],
      };
    }
    if (n.name === 'include') {
      const src = String(a.src);
      if (/^[a-z]+:/i.test(src) || posix.isAbsolute(src))
        throw new Error('include must use a relative local path');
      const path = posix.normalize(posix.join(directory, src));
      if (path === '..' || path.startsWith('../'))
        throw new Error('include escapes scene directory');
      if (files.includes(path)) throw new Error('include cycle');
      if (!options.read || !options.load) throw new Error('include requires a scene reader');
      const xml = options.read(path);
      if (a.sha256 && createHash('sha256').update(xml).digest('hex') !== a.sha256)
        throw new Error('include sha256 mismatch');
      const loaded = options.load(xml);
      if (!loaded.ok || !loaded.scene) throw new Error(`invalid included scene ${path}`);
      const foreign = loaded.scene,
        selected =
          a.symbol === undefined
            ? foreign.children.find((n) => n.name === 'composition')
            : foreign.children
                .find((n) => n.name === 'symbols')
                ?.children.find((n) => n.attributes.id === a.symbol);
      if (!selected) throw new Error('included symbol not found');
      const roots = foreign.children.filter((c) =>
        ['assets', 'paints', 'styles', 'effects', 'symbols', 'markers'].includes(c.name),
      );
      const scoped = scope(
        [...roots, ...selected.children],
        id,
        n.children.filter((c) => c.name === 'override'),
      );
      /** @param {Node} c @returns {Node} */ const repair = (c) => {
        const attrs = { ...c.attributes };
        if (attrs.src !== undefined && c.name !== 'include')
          attrs.src = posix.join(posix.dirname(path), String(attrs.src));
        return { ...c, attributes: attrs, children: c.children.map(repair) };
      };
      const children = [];
      for (const c of scoped) {
        if (roots.some((r) => r.name === c.name)) {
          const fixed = repair(c);
          merged.set(c.name, [...(merged.get(c.name) ?? []), ...fixed.children]);
          if (c.name === 'symbols')
            for (const s of fixed.children) symbols.set(String(s.attributes.id), s);
        } else children.push(walk(c, stack, [...files, path], posix.dirname(path)));
      }
      return {
        ...n,
        name: 'group',
        type: 'groupType',
        attributes: Object.fromEntries(
          Object.entries(a).filter(
            ([k]) => k in (MODEL.complexTypes.groupType?.attributes ?? {}),
          ),
        ),
        children: [
          ...n.children.filter((c) =>
            ['animate', 'expression', 'link', 'mask', 'motionPath'].includes(c.name),
          ),
          ...children,
        ],
      };
    }
    if (n.name === 'repeat') {
      if (Number(a.count ?? 0) > budget) throw new Error('repeat exceeds node budget');
      let items =
        a.over === undefined
          ? Array.from({ length: Number(a.count ?? 0) }, (_, i) => i)
          : (data.get(String(a.over)) ?? params[String(a.over)]);
      if (!Array.isArray(items))
        throw new Error('repeat over must reference a list or data rows');
      items = items.filter(
        (_, i) =>
          i >= Number(a.from ?? 0) && (i - Number(a.from ?? 0)) % Number(a.step ?? 1) === 0,
      );
      if (a.count !== undefined) items = items.slice(0, Number(a.count));
      if (items.length > budget) throw new Error('repeat exceeds node budget');
      const children = items.map((/** @type {any} */ item, /** @type {number} */ i) => {
        const prefix = id + '__' + i,
          context = {
            ...n.context,
            index: i,
            count: items.length,
            [String(a.var ?? 'item')]: item,
          },
          cloned = scope(
            n.children.filter(
              (c) => !['animate', 'expression', 'link', 'mask', 'motionPath'].includes(c.name),
            ),
            prefix,
            [],
            context,
          );
        return /** @type {Node} */ ({
          name: 'group',
          type: 'groupType',
          path: prefix,
          loc: n.loc,
          value: null,
          context,
          attributes: {
            id: prefix,
            x: i * Number(a.offsetX ?? 0),
            y: i * Number(a.offsetY ?? 0),
            rotation: i * Number(a.rotationStep ?? 0),
            scaleX: Number(a.scaleStep ?? 1) ** i,
            scaleY: Number(a.scaleStep ?? 1) ** i,
            opacity: Math.max(0, 1 - i * Number(a.opacityStep ?? 0)),
            timeOffset: -i * Number(a.timeStep ?? 0),
          },
          children: cloned.map((c) => walk(c, stack, files, directory)),
        });
      });
      return {
        ...n,
        name: 'group',
        type: 'groupType',
        attributes: Object.fromEntries(
          Object.entries(a).filter(
            ([k]) => k in (MODEL.complexTypes.groupType?.attributes ?? {}),
          ),
        ),
        children: [
          ...n.children.filter((c) =>
            ['animate', 'expression', 'link', 'mask', 'motionPath'].includes(c.name),
          ),
          ...children,
        ],
      };
    }
    if (n.name === 'symbols') return n;
    return {
      ...n,
      children: n.children.map((c) => walk(c, stack, files, directory)),
    };
  };
  const scene = walk(input, [], [], '');
  const sections = scene.children.map((s) =>
    merged.has(s.name) ? { ...s, children: [...s.children, ...(merged.get(s.name) ?? [])] } : s,
  );
  for (const [name, children] of merged)
    if (!sections.some((s) => s.name === name))
      sections.push({
        name,
        type: name + 'Type',
        attributes: {},
        children,
        value: null,
        loc: scene.loc,
        path: scene.path + '/' + name,
      });
  return { ...scene, children: sections.filter((s) => s.name !== 'symbols') };
}
