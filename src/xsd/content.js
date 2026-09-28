/**
 * Element-only content models matched by Brzozowski derivatives over
 * hash-consed regular expressions with occurrence counters.
 *
 * Every derivative is a sum of suffixes of the original expression, and
 * interning makes equal expressions identical, so the state space is
 * finite and bounded by the schema, whatever the input length.
 */

/**
 * @typedef {{ id: number, kind: 'empty' } | { id: number, kind: 'eps' }
 *   | { id: number, kind: 'sym', name: string }
 *   | { id: number, kind: 'seq', a: Re, b: Re }
 *   | { id: number, kind: 'alt', items: Re[] }
 *   | { id: number, kind: 'rep', r: Re, min: number, max: number | null }} Re
 */

/**
 * @typedef {{ ok: true }
 *   | { ok: false, kind: 'unexpected' | 'incomplete', index: number, expected: string[] }} MatchResult
 */

/** @param {import('./model.js').Particle} particle */
export function compileParticle(particle) {
  /** @type {Map<string, Re>} */
  const table = new Map();
  /** @type {Map<number, boolean>} */
  const nullMemo = new Map();
  /** @type {Map<number, Set<string>>} */
  const firstMemo = new Map();
  /** @type {Map<number, Map<string, Re>>} */
  const derivMemo = new Map();

  /** @template {Re} T @param {string} key @param {(id: number) => T} make @returns {Re} */
  const intern = (key, make) => {
    let n = table.get(key);
    if (!n) {
      n = make(table.size);
      table.set(key, n);
    }
    return n;
  };

  const EMPTY = intern('0', (id) => ({ id, kind: 'empty' }));
  const EPS = intern('e', (id) => ({ id, kind: 'eps' }));

  /** @param {string} name */
  const sym = (name) => intern(`N${name}`, (id) => ({ id, kind: 'sym', name }));

  /** @param {Re} a @param {Re} b @returns {Re} */
  const seq = (a, b) => {
    if (a === EMPTY || b === EMPTY) return EMPTY;
    if (a === EPS) return b;
    if (b === EPS) return a;
    if (a.kind === 'seq') return seq(a.a, seq(a.b, b));
    return intern(`S${a.id},${b.id}`, (id) => ({ id, kind: 'seq', a, b }));
  };

  /** @param {Re[]} list @returns {Re} */
  const alt = (list) => {
    /** @type {Map<number, Re>} */
    const byId = new Map();
    for (const x of list) {
      for (const y of x.kind === 'alt' ? x.items : [x]) if (y !== EMPTY) byId.set(y.id, y);
    }
    const items = [...byId.values()].sort((p, q) => p.id - q.id);
    if (items.length === 0) return EMPTY;
    if (items.length === 1) return /** @type {Re} */ (items[0]);
    return intern(`A${items.map((i) => i.id).join(',')}`, (id) => ({ id, kind: 'alt', items }));
  };

  /** @param {Re} r @param {number} min @param {number | null} max @returns {Re} */
  const rep = (r, min, max) => {
    if (max === 0 || r === EPS) return EPS;
    if (r === EMPTY) return min === 0 ? EPS : EMPTY;
    const lo = nullable(r) ? 0 : min;
    if (lo === 1 && max === 1) return r;
    return intern(`R${r.id},${lo},${max ?? 'u'}`, (id) => ({ id, kind: 'rep', r, min: lo, max }));
  };

  /** @param {Re} n @returns {boolean} */
  function nullable(n) {
    const hit = nullMemo.get(n.id);
    if (hit !== undefined) return hit;
    let v;
    switch (n.kind) {
      case 'empty': case 'sym': v = false; break;
      case 'eps': v = true; break;
      case 'seq': v = nullable(n.a) && nullable(n.b); break;
      case 'alt': v = n.items.some(nullable); break;
      default: v = n.min === 0;
    }
    nullMemo.set(n.id, v);
    return v;
  }

  /** @param {Re} n @returns {Set<string>} */
  function first(n) {
    const hit = firstMemo.get(n.id);
    if (hit) return hit;
    /** @type {Set<string>} */
    let s;
    switch (n.kind) {
      case 'empty': case 'eps': s = new Set(); break;
      case 'sym': s = new Set([n.name]); break;
      case 'seq': s = nullable(n.a) ? new Set([...first(n.a), ...first(n.b)]) : first(n.a); break;
      case 'alt': s = new Set(n.items.flatMap((i) => [...first(i)])); break;
      default: s = first(n.r);
    }
    firstMemo.set(n.id, s);
    return s;
  }

  /** @param {Re} n @param {string} name @returns {Re} */
  function deriv(n, name) {
    let memo = derivMemo.get(n.id);
    const hit = memo?.get(name);
    if (hit) return hit;
    let d;
    switch (n.kind) {
      case 'empty': case 'eps': d = EMPTY; break;
      case 'sym': d = n.name === name ? EPS : EMPTY; break;
      case 'seq': d = alt([seq(deriv(n.a, name), n.b), nullable(n.a) ? deriv(n.b, name) : EMPTY]); break;
      case 'alt': d = alt(n.items.map((i) => deriv(i, name))); break;
      default: d = seq(deriv(n.r, name), rep(n.r, Math.max(n.min - 1, 0), n.max === null ? null : n.max - 1));
    }
    if (!memo) {
      memo = new Map();
      derivMemo.set(n.id, memo);
    }
    memo.set(name, d);
    return d;
  }

  /** @param {import('./model.js').Particle} p @returns {Re} */
  function build(p) {
    if (p.kind === 'element') return rep(sym(p.name), p.min, p.max);
    const parts = p.items.map(build);
    const body = p.kind === 'choice' ? alt(parts) : parts.reduceRight((acc, x) => seq(x, acc), EPS);
    return rep(body, p.min, p.max);
  }

  const start = build(particle);

  /** @param {Re} n */
  const expected = (n) => [...first(n)].sort();

  return {
    /** @param {readonly string[]} names @returns {MatchResult} */
    match(names) {
      let state = start;
      for (let i = 0; i < names.length; i++) {
        const next = deriv(state, /** @type {string} */ (names[i]));
        if (next === EMPTY) return { ok: false, kind: 'unexpected', index: i, expected: expected(state) };
        state = next;
      }
      return nullable(state) ? { ok: true } : { ok: false, kind: 'incomplete', index: names.length, expected: expected(state) };
    },
    /** Number of interned expression states; bounded by the schema. */
    size: () => table.size,
  };
}
