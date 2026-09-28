/**
 * Deterministic corpus for the libxml2 differential test: documents
 * generated from the schema model, plus seeded mutations of them. The
 * generator does not need to be right about validity; libxml2 decides
 * the expected verdict for every document.
 */

/** @typedef {import('../../src/xsd/model.js').SchemaModel} SchemaModel */
/** @typedef {import('../../src/xsd/model.js').Particle} Particle */
/** @typedef {{ name: string, attrs: Array<[string, string]>, children: Array<Node | string> }} Node */

/** @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** @param {number} n */
    int: (n) => Math.floor(next() * n),
    /** @template T @param {readonly T[]} xs @returns {T} */
    pick: (xs) => /** @type {T} */ (xs[Math.floor(next() * xs.length)]),
  };
}

const POOLS = /** @type {Record<string, string[]>} */ ({
  'xs:double': ['0', '1', '0.5', '0.25', '2', '10', '100', '-1', '-0.5', '1e3', '360', '0.001', '4096'],
  'xs:integer': ['1', '2', '3', '4', '8', '16', '30', '100', '1000', '42'],
  'xs:unsignedLong': ['0', '7', '18446744073709551615'],
  'xs:boolean': ['true', 'false', '1', '0'],
  'xs:string': ['a', 'hello world', 'x-1'],
  'xs:anyURI': ['assets/a.png', 'https://example.com/x.wav', 'file.xml'],
  'xs:NMTOKEN': ['tok', 'a-1', 'x.y'],
  'xs:NCName': ['name1', 'n_2'],
  'xs:dateTime': ['2026-09-26T10:00:00Z', '2024-02-29T23:59:59.5+01:00'],
});
const INT_TYPES = ['xs:int', 'xs:nonNegativeInteger', 'xs:positiveInteger'];

/** Samples for pattern-restricted types, keyed by model type name. */
const PATTERN_SAMPLES = /** @type {Record<string, string[]>} */ ({
  fpsType: ['30', '30000/1001', '25'],
  aspectType: ['16:9', '1:1'],
  sha256Type: ['a'.repeat(64), '0123456789abcdef'.repeat(4)],
  timecodeType: ['01:00:00:00', '00:59:59;29'],
  languageTagType: ['en', 'pt-BR', 'zh-Hant-TW'],
  pointType: ['0,0', '1.5,-2', '.5,1e3'],
  relativeLength: ['50%', '-10vw', '.5vh', '100vmin', '0vmax'],
  positiveRelativeLength: ['50%', '1vw', '0.5vh'],
  colorType: ['#FF0000', '#00ff00AA', '1,0.5,0', '0,0,0,1', 'var(--brand)'],
  paintRefType: ['url(#paint1)'],
  'tokenType@name': ['brand', 'x_1'],
});

/** Values chosen to probe lexical and facet edges; used by mutations. */
const EDGE_VALUES = ['', ' ', ' 1 ', '\t5\n', 'NaN', 'INF', '+INF', '-INF', '1e400', '-0', '+1', '01', '1.', '.',
  'abc', '#GGGGGG', '#FFF', '1,1,1,2', '1.5,0,0', '1,0.5', 'url(#)', 'var(--)', 'var(--a b)', '9007199254740993',
  '18446744073709551616', '-2147483649', '2147483648', '1 2', 'a:b', '1a', 'true ', 'TRUE', '2026-02-29T00:00:00',
  '50 %', '1e-400', '0x1F', '1,000', 'url(#a) ', ' #FFFFFF', '100000000000000000000', '-1e308', '1.7976931348623159e308'];

/**
 * @param {SchemaModel} model
 * @param {number} seed
 * @param {{ maxDepth?: number, attrProbability?: number }} [opts]
 * @returns {Node}
 */
export function generate(model, seed, opts = {}) {
  const r = rng(seed);
  const maxDepth = opts.maxDepth ?? 4;
  const attrP = opts.attrProbability ?? 0.5;
  let idCounter = 0;
  /** @type {string[]} */
  const ids = [];
  /** @type {Array<{ node: Node, index: number, list: boolean }>} */
  const refs = [];

  /** @param {string} type @returns {'ID' | 'IDREF' | 'IDREFS' | null} */
  const idKind = (type) => {
    if (type === 'xs:ID') return 'ID';
    if (type === 'xs:IDREF') return 'IDREF';
    if (type === 'xs:IDREFS') return 'IDREFS';
    return null;
  };

  /** @param {string} type @returns {string} */
  function sample(type) {
    const special = PATTERN_SAMPLES[type];
    if (special) return r.pick(special);
    if (POOLS[type]) return r.pick(/** @type {string[]} */ (POOLS[type]));
    if (INT_TYPES.includes(type)) return r.pick(/** @type {string[]} */ (POOLS['xs:integer']));
    if (type === 'xs:NMTOKENS') return 'a b';
    const def = model.simpleTypes[type];
    if (!def) throw new Error(`generator has no sample for ${type}`);
    if (def.kind === 'list') return Array.from({ length: 1 + r.int(3) }, () => sample(def.itemType)).join(' ');
    if (def.kind === 'union') return sample(r.pick(def.memberTypes));
    if (def.facets.enumeration) return r.pick(def.facets.enumeration);
    if (def.facets.patterns) throw new Error(`generator has no sample for pattern type ${type}`);
    const f = def.facets;
    const lo = f.minInclusive ?? f.minExclusive;
    const hi = f.maxInclusive ?? f.maxExclusive;
    if (lo !== undefined || hi !== undefined) {
      const a = Number(lo ?? (Number(hi) - 10));
      const b = Number(hi ?? (a + 10));
      const integral = !['xs:double'].includes(rootBuiltin(type));
      const pts = [a, b, (a + b) / 2, a + (b - a) / 4].filter((x) =>
        (f.minExclusive === undefined || x > Number(f.minExclusive)) && (f.maxExclusive === undefined || x < Number(f.maxExclusive)));
      const v = pts.length ? r.pick(pts) : (a + b) / 2;
      return String(integral ? Math.round(v) : v);
    }
    return sample(def.base);
  }

  /** @param {string} type @returns {string} */
  function rootBuiltin(type) {
    const def = model.simpleTypes[type];
    if (!def || def.kind !== 'restriction') return type;
    return rootBuiltin(def.base);
  }

  /** @param {Particle} p @param {number} depth @param {Node} into @param {Record<string, string>} types */
  function content(p, depth, into, types) {
    const deep = depth >= maxDepth;
    const extra = deep ? 0 : r.int(2);
    const count = p.max === null ? p.min + extra : Math.min(p.max, p.min + extra);
    for (let i = 0; i < count; i++) {
      if (p.kind === 'element') into.children.push(element(p.name, /** @type {string} */ (types[p.name]), depth + 1));
      else if (p.kind === 'sequence') for (const it of p.items) content(it, depth, into, types);
      else if (p.items.length) content(r.pick(p.items), depth, into, types);
    }
  }

  /** @param {string} name @param {string} type @param {number} depth @returns {Node} */
  function element(name, type, depth) {
    const def = model.complexTypes[type];
    if (!def) throw new Error(`unknown complex type ${type}`);
    /** @type {Node} */
    const node = { name, attrs: [], children: [] };
    for (const [a, ad] of Object.entries(def.attributes)) {
      if (!ad.required && r.next() >= attrP) continue;
      const k = idKind(ad.type);
      if (k === 'ID') {
        idCounter += 1;
        const id = `id${idCounter}`;
        ids.push(id);
        node.attrs.push([a, id]);
      } else if (k) {
        refs.push({ node, index: node.attrs.length, list: k === 'IDREFS' });
        node.attrs.push([a, '']);
      } else node.attrs.push([a, sample(ad.type)]);
    }
    if (def.content.kind === 'simple') node.children.push(sample(def.content.type));
    else if (def.content.kind === 'elements') content(def.content.particle, depth, node, def.content.elementTypes);
    return node;
  }

  const root = element(model.root.name, model.root.type, 0);
  for (const ref of refs) {
    const pair = /** @type {[string, string]} */ (ref.node.attrs[ref.index]);
    pair[1] = ids.length ? (ref.list ? `${r.pick(ids)} ${r.pick(ids)}` : r.pick(ids)) : 'dangling';
  }
  return root;
}

/** @param {Node} root @returns {Node[]} */
function allNodes(root) {
  /** @type {Node[]} */
  const out = [];
  /** @param {Node} n */
  const walk = (n) => {
    out.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  return out;
}

/** @param {Node} root @param {Node} target @returns {Node | null} */
function parentOf(root, target) {
  for (const n of allNodes(root)) if (n.children.includes(target)) return n;
  return null;
}

/**
 * Applies one seeded mutation in place and returns its label.
 * @param {SchemaModel} model
 * @param {Node} root
 * @param {ReturnType<typeof rng>} r
 */
export function mutate(model, root, r) {
  const nodes = allNodes(root);
  const inner = nodes.slice(1);
  const withAttrs = nodes.filter((n) => n.attrs.length);
  const kind = r.int(12);
  const allPools = [...Object.values(POOLS).flat(), ...Object.values(PATTERN_SAMPLES).flat(), ...EDGE_VALUES];
  switch (kind) {
    case 0: case 1: {
      const n = r.pick(withAttrs);
      const pair = /** @type {[string, string]} */ (r.pick(n.attrs));
      pair[1] = r.next() < 0.6 ? r.pick(EDGE_VALUES) : r.pick(allPools);
      return `value ${pair[0]}`;
    }
    case 2: {
      const n = r.pick(withAttrs);
      n.attrs.splice(r.int(n.attrs.length), 1);
      return 'drop attribute';
    }
    case 3: r.pick(nodes).attrs.push(['zzz', '1']); return 'unknown attribute';
    case 4: {
      if (!inner.length) return 'noop';
      const n = r.pick(inner);
      const p = /** @type {Node} */ (parentOf(root, n));
      p.children.splice(p.children.indexOf(n), 1);
      return 'drop element';
    }
    case 5: {
      if (!inner.length) return 'noop';
      const n = r.pick(inner);
      const p = /** @type {Node} */ (parentOf(root, n));
      p.children.splice(p.children.indexOf(n), 0, structuredClone(n));
      return 'duplicate element';
    }
    case 6: {
      const p = r.pick(nodes.filter((n) => n.children.filter((c) => typeof c !== 'string').length >= 2).concat([root]));
      const els = p.children.filter((c) => typeof c !== 'string');
      if (els.length < 2) return 'noop';
      const i = r.int(els.length - 1);
      const a = p.children.indexOf(/** @type {Node} */ (els[i]));
      const b = p.children.indexOf(/** @type {Node} */ (els[i + 1]));
      [p.children[a], p.children[b]] = [/** @type {Node} */ (els[i + 1]), /** @type {Node} */ (els[i])];
      return 'swap siblings';
    }
    case 7: {
      if (!inner.length) return 'noop';
      const names = [...new Set(Object.values(model.complexTypes).flatMap((d) =>
        d.content.kind === 'elements' ? Object.keys(d.content.elementTypes) : []))].sort();
      r.pick(inner).name = r.pick(names);
      return 'rename element';
    }
    case 8: r.pick(nodes).children.push(r.next() < 0.5 ? 'x' : ' \n '); return 'text';
    case 9: {
      const idAttrs = nodes.flatMap((n) => n.attrs.filter(([k]) => k === 'id'));
      if (idAttrs.length < 2) return 'noop';
      const [x, y] = [r.pick(idAttrs), r.pick(idAttrs)];
      x[1] = y[1];
      return 'duplicate id';
    }
    case 10: {
      const n = r.pick(withAttrs);
      const pair = /** @type {[string, string]} */ (r.pick(n.attrs));
      pair[1] = 'missing';
      return 'dangling ref';
    }
    default: {
      if (inner.length < 2) return 'noop';
      const n = r.pick(inner);
      const p = /** @type {Node} */ (parentOf(root, n));
      const targets = nodes.filter((t) => t !== n && !allNodes(n).includes(t));
      p.children.splice(p.children.indexOf(n), 1);
      r.pick(targets).children.push(n);
      return 'move element';
    }
  }
}

/** @param {string} s */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');

/** @param {Node} n @returns {string} */
export function serialize(n) {
  const attrs = n.attrs.map(([k, v]) => ` ${k}="${escape(v)}"`).join('');
  if (!n.children.length) return `<${n.name}${attrs}/>`;
  const body = n.children.map((c) => (typeof c === 'string' ? escape(c) : serialize(c))).join('');
  return `<${n.name}${attrs}>${body}</${n.name}>`;
}

/**
 * The full corpus: `valid` generated documents and `mutated` mutants.
 * @param {SchemaModel} model
 * @param {{ valid?: number, mutated?: number, seed?: number }} [opts]
 * @returns {Array<{ label: string, xml: string }>}
 */
export function buildCorpus(model, opts = {}) {
  const valid = opts.valid ?? 150;
  const mutated = opts.mutated ?? 1500;
  const seed = opts.seed ?? 1;
  /** @type {Array<{ label: string, xml: string }>} */
  const out = [];
  for (let i = 0; i < valid; i++) {
    out.push({ label: `generated#${i}`, xml: serialize(generate(model, seed + i)) });
  }
  for (let i = 0; i < mutated; i++) {
    const r = rng(seed * 7919 + i);
    const doc = generate(model, seed + (i % valid));
    const labels = [mutate(model, doc, r)];
    if (r.next() < 0.3) labels.push(mutate(model, doc, r));
    out.push({ label: `mutant#${i} ${labels.join(' + ')}`, xml: serialize(doc) });
  }
  return out;
}
