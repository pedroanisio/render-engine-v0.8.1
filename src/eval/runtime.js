import { parameterPoint, motionPath } from "./path.js";
import { svgPathProperties } from "svg-path-properties";
import { compileAnimations } from "./track.js";
import { clocks, instanceTime } from "./clock.js";
import {
  add,
  declaredAttribute,
  interpolate,
  propertyValue,
  spring,
} from "./value.js";
import { compileExpression, noise } from "./expression.js";
import { easing } from "./curves.js";
import { framePosition, frameIndex } from "./frames.js";
import { semanticRules } from "../scene/preflight.js";
import { expandScene } from "../scene/expand.js";
import { resolveParameters } from "../scene/parameters.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {import('./value.js').Value} Value */
/** @typedef {import('../scene/parameters.js').ParameterOptions & import('../scene/expand.js').Options & {expand?:boolean,audioAmplitude?:(id:string,time:number,band:string)=>number}} RuntimeOptions */
/** Property evaluations (cache misses) allowed per top-level `value()` call. */
export const EVALUATION_BUDGET = 100000;
/** FNV-1a 32-bit string hash. @param {string} text */
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
};
const clamp = (
  /** @type {number} */ x,
  /** @type {number} */ a = 0,
  /** @type {number} */ b = 1,
) => Math.min(b, Math.max(a, x));
/** Compiles a pure random-access evaluator. No state is carried from prior frames. */
export function compileRuntime(
  /** @type {Node} */ input,
  /** @type {RuntimeOptions} */ options = {},
) {
  const resolved = resolveParameters(input, options);
  if (options.expand) {
    resolved.scene = expandScene(
      resolved.scene,
      resolved.params,
      resolved.data,
      options,
    );
    resolved.ids.clear();
    const index = (/** @type {Node} */ n) => {
      if (n.attributes.id !== undefined) {
        const id = String(n.attributes.id);
        if (resolved.ids.has(id))
          throw new Error(`expanded ID collision ${id}`);
        resolved.ids.set(id, n);
      }
      for (const c of n.children) index(c);
    };
    index(resolved.scene);
  }
  const { scene, params, ids } = resolved;
  const issues = semanticRules(scene);
  if (issues.length)
    throw new Error(issues.map((d) => `${d.path}: ${d.message}`).join("\n"));
  const projectSeed = Number(
    BigInt(
      String(
        scene.children.find((n) => n.name === "project")?.attributes.seed ?? 0,
      ),
    ) & 0xffffffffn,
  );
  const timeline = clocks(scene),
    compiled = compileAnimations(scene);
  if (compiled.diagnostics.length)
    throw new Error(
      compiled.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"),
    );
  /** @type {Map<Node,ReturnType<typeof compileExpression>>} */ const expressions =
    new Map();
  /** @type {Map<Node,ReturnType<typeof compileExpression>>} */ const conditions =
    new Map();
  /** @type {Map<Node,InstanceType<typeof svgPathProperties>>} */ const paths =
    new Map();
  /** @type {Map<string,Set<string>>} */ const dependencies = new Map();
  const key = (/** @type {Node} */ n) => String(n.attributes.id ?? n.path);
  /** @param {string} ref */
  const reference = (ref) => {
    const dot = ref.lastIndexOf("."),
      id = ref.slice(0, dot),
      property = ref.slice(dot + 1),
      node = ids.get(id);
    if (
      dot < 1 ||
      !node ||
      (node.attributes[property] === undefined &&
        !node.children.some((c) => c.attributes.property === property))
    )
      throw new Error(`unknown property reference ${ref}`);
    return { node, property };
  };
  /** Default seed: the project seed mixed with the owner's identity and property,
   * so sibling properties draw independent streams. @param {Node} node @param {string} property */
  const derivedSeed = (node, property) =>
    (projectSeed ^ hash(`${key(node)}.${property}`)) >>> 0;
  /** @param {Node} node @param {number} time @param {string} property @param {Value} base @param {number} [seed] */
  const context = (
    node,
    time,
    property,
    base,
    seed = derivedSeed(node, property),
  ) => {
    let invocation = 0;
    const expressionTime = timeline.spans.get(node)?.composition(time) ?? time;
    /** @param {Value[]} args @param {(u:number)=>number} curve */
    const remap = (args, curve) => {
      const [t, t0, t1, v0, v1] = args;
      const u =
        Number(t1) === Number(t0)
          ? Number(t) >= Number(t1)
            ? 1
            : 0
          : clamp((Number(t) - Number(t0)) / (Number(t1) - Number(t0)));
      return interpolate(v0 ?? 0, v1 ?? 1, curve(u));
    };
    const numeric =
      (/** @type {(x:number)=>number} */ fn) => (/** @type {Value} */ x) =>
        fn(Number(x));
    /** @type {import('./expression.js').Context} */ const c = {
      time,
      frame: framePosition(time, timeline.fps.value),
      value: base,
      index: 0,
      count: 1,
      textIndex: 0,
      textTotal: 1,
      seed,
      PI: Math.PI,
      E: Math.E,
      param: (id) => {
        const p = node.context?.[String(id)] ?? params[String(id)];
        if (p === undefined) throw new Error(`unknown parameter ${String(id)}`);
        return p;
      },
      prop: (ref) => {
        const r = reference(String(ref));
        return value(r.node, r.property, time) ?? 0;
      },
      valueAtTime: (t) => baseValue(node, property, Number(t)) ?? 0,
      markerTime: (id) => timeline.marker(id),
      beat: () => timeline.beat(expressionTime),
      audioAmplitude: (id, band = "all") => {
        if (!options.audioAmplitude)
          throw new Error("audioAmplitude needs an audio analysis provider");
        return options.audioAmplitude(String(id), time, String(band));
      },
      random: (...args) => {
        const a = args.length < 2 ? 0 : Number(args[0]),
          b = Number(args.at(-1) ?? 1);
        return (
          Number(a) +
          (Number(b) - Number(a)) *
            noise(
              seed,
              frameIndex(expressionTime, timeline.fps.value),
              invocation++,
            )
        );
      },
      noise: (...args) => noise(seed, ...args.map(Number)) * 2 - 1,
      wiggle: (freq, amp, octaves = 1, mult = 0.5) => {
        let v = Number(base);
        const count = clamp(Number(octaves), 1, 16);
        for (let i = 0; i < count; i++) {
          const x = expressionTime * Number(freq) * 2 ** i,
            k = Math.floor(x),
            u = x - k;
          v +=
            Number(amp) *
            Number(mult) ** i *
            ((noise(seed, i, k) * (1 - u) + noise(seed, i, k + 1) * u) * 2 - 1);
        }
        return v;
      },
      clamp: (x, a = 0, b = 1) => clamp(Number(x), Number(a), Number(b)),
      lerp: (a, b, u) => interpolate(a ?? 0, b ?? 0, Number(u)),
      smoothstep: (a, b, x) => {
        const u = clamp((Number(x) - Number(a)) / (Number(b) - Number(a)));
        return u * u * (3 - 2 * u);
      },
      spring: (t, k = 100, d = 10, m = 1) =>
        spring(Number(t), Number(k), Number(d), Number(m)),
      linear: (...a) => remap(a, (u) => u),
      ease: (...a) => remap(a, (u) => u * u * (3 - 2 * u)),
      easeIn: (...a) => remap(a, (u) => u * u),
      easeOut: (...a) => remap(a, (u) => 1 - (1 - u) ** 2),
      sin: numeric(Math.sin),
      cos: numeric(Math.cos),
      tan: numeric(Math.tan),
      abs: numeric(Math.abs),
      sqrt: numeric(Math.sqrt),
      floor: numeric(Math.floor),
      ceil: numeric(Math.ceil),
      round: numeric(Math.round),
      min: (...a) => Math.min(...a.map(Number)),
      max: (...a) => Math.max(...a.map(Number)),
      pow: (a, b) => Number(a) ** Number(b),
    };
    for (const mode of ["loopIn", "loopOut"])
      c[mode] = (kind = "loop", count = 0) => {
        if (
          !["loop", "ping-pong", "offset", "linear", "hold"].includes(
            String(kind),
          )
        )
          throw new Error("invalid loop mode");
        const amount = Number(count);
        if (!Number.isInteger(amount) || amount < 0)
          throw new Error("loop key count must be a non-negative integer");
        const track = compiled.tracks
          .get(key(node))
          ?.filter((n) => n.property === property)
          .at(-1);
        if (!track) return base;
        const keys = track.keyTimes,
          first =
            mode === "loopIn"
              ? 0
              : Math.max(0, keys.length - 1 - (amount || keys.length - 1)),
          last =
            mode === "loopOut"
              ? keys.length - 1
              : Math.min(keys.length - 1, amount || keys.length - 1);
        const t0 = Number(keys[first]),
          t1 = Number(keys[last]),
          span = t1 - t0,
          x = track.timeAt(time),
          origin = track.timeAt(0),
          rate = track.timeAt(1) - origin;
        if (span <= 0 || rate === 0 || (mode === "loopIn" ? x >= t0 : x <= t1))
          return base;
        const sample = (/** @type {number} */ t) =>
          baseValue(node, property, (t - origin) / rate) ?? 0;
        if (kind === "hold") return sample(mode === "loopIn" ? t0 : t1);
        if (kind === "linear")
          return (
            Number(sample(t0)) +
            ((x - t0) * (Number(sample(t1)) - Number(sample(t0)))) / span
          );
        const cycle = Math.floor((x - t0) / span),
          phase = (((x - t0) % span) + span) % span,
          t = kind === "ping-pong" && cycle % 2 !== 0 ? t1 - phase : t0 + phase,
          v = sample(t);
        return kind === "offset"
          ? Number(v) + cycle * (Number(sample(t1)) - Number(sample(t0)))
          : v;
      };
    if (node.context) Object.assign(c, node.context);
    const ct = timeline.spans.get(node)?.composition(time) ?? time;
    c.time = ct;
    c.frame = framePosition(ct, timeline.fps.value);
    return c;
  };
  /** @param {Node} node @param {string} prop @param {number} time @returns {Value|undefined} */
  const baseValue = (node, prop, time) => {
    let result = node.attributes[prop];
    for (const track of compiled.tracks.get(key(node)) ?? [])
      if (track.property === prop) {
        const v = track.valueAt(time);
        result = track.additive ? add(result ?? 0, v) : v;
      }
    return result;
  };
  /** @type {Set<string>} */ const active = new Set();
  // value(node, prop, time) is pure for its key (context index/textIndex are
  // fixed outside textSelector), so one top-level evaluation memoizes nested
  // prop()/link reads and bounds its total work.
  /** @type {Map<string,Value|undefined>} */ const memo = new Map();
  let work = 0;
  /** @param {Node} node @param {string} prop @param {number} time @returns {Value|undefined} */
  const value = (node, prop, time) => {
    if (node.name === "textAnimator" && prop === "selector")
      return node.attributes.selector;
    if (!Number.isFinite(time))
      throw new Error("evaluation time must be finite");
    const label = `${key(node)}.${prop}`,
      id = `${label}@${time}`;
    if (memo.has(id)) return memo.get(id);
    if (active.has(label)) throw new Error(`dependency cycle at ${label}`);
    if (++work > EVALUATION_BUDGET)
      throw new Error(
        `evaluation budget exceeded at ${label}: more than ${EVALUATION_BUDGET} property evaluations (nested links/prop references fan out too far)`,
      );
    const top = active.size === 0;
    active.add(label);
    try {
      const result = evaluate(node, prop, time);
      memo.set(id, result);
      return result;
    } finally {
      active.delete(label);
      if (top) {
        memo.clear();
        work = 0;
      }
    }
  };
  /** @param {Node} node @param {string} prop @param {number} time @returns {Value|undefined} */
  const evaluate = (node, prop, time) => {
    let result = baseValue(node, prop, time);
    for (const c of node.children) {
      const a = c.attributes;
      if (c.name === "motionPath" && ["x", "y", "rotation"].includes(prop)) {
        const path = paths.get(c);
        if (!path) continue;
        const span = timeline.spans.get(c),
          start = span?.start ?? 0,
          end = span?.end ?? timeline.duration;
        const progress = baseValue(c, "progress", time);
        let u = clamp(
          progress === undefined
            ? ((span?.composition(time) ?? time) - start) / (end - start || 1)
            : Number(progress),
        );
        u = easing(String(a.interpolation))(u);
        const distance = u * path.getTotalLength();
        const point =
          a.constantSpeed === false
            ? parameterPoint(path, u)
            : path.getPointAtLength(distance);
        let tangent = path.getTangentAtLength(distance);
        if (a.constantSpeed === false) {
          const before = parameterPoint(path, Math.max(0, u - 1e-6)),
            after = parameterPoint(path, Math.min(1, u + 1e-6));
          tangent = { x: after.x - before.x, y: after.y - before.y };
        }
        if (prop === "rotation") {
          if (a.autoOrient === true)
            result =
              (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI +
              Number(a.orientOffset);
        } else result = prop === "x" ? point.x : point.y;
      }
      if (a.property !== prop) continue;
      if (c.name === "expression" && a.enabled !== false)
        result = expressions
          .get(c)
          ?.evaluate(
            context(
              node,
              time,
              prop,
              result ?? 0,
              a.seed === undefined
                ? undefined
                : Number(BigInt(String(a.seed)) & 0xffffffffn),
            ),
          );
      if (c.name === "link") {
        /** @param {number} t */ const source = (t) => {
          const s = String(a.source),
            parts = s.split(":");
          if (parts[0] === "param") {
            const p = params[String(parts[1])];
            if (p === undefined)
              throw new Error(`unknown parameter ${parts[1]}`);
            return Number(p);
          }
          if (parts[0] === "marker") return timeline.marker(parts[1]);
          if (parts[0] === "audio") {
            if (!options.audioAmplitude)
              throw new Error("audio link needs an audio analysis provider");
            return options.audioAmplitude(
              String(parts[1]),
              t,
              parts[2] ?? "all",
            );
          }
          const r = reference(s);
          return Number(value(r.node, r.property, t));
        };
        const t = time - Number(a.delay),
          window = Number(a.smoothing);
        let v = source(t);
        // Fixed 32-panel trapezoidal window; absolute sampling makes seeking reproducible.
        if (window > 0) {
          v = (v + source(t - window)) / 2;
          for (let i = 1; i < 32; i++) v += source(t - (window * i) / 32);
          v /= 32;
        }
        result = clamp(
          v * Number(a.scale) + Number(a.offset),
          Number(a.min ?? -Infinity),
          Number(a.max ?? Infinity),
        );
      }
    }
    if (
      result !== undefined &&
      (node.children.some(
        (c) => c.attributes.property === prop && c.name !== "animate",
      ) ||
        node.children.some((c) => c.name === "motionPath"))
    )
      result = propertyValue(
        node,
        prop,
        Array.isArray(result) ? result.join(" ") : String(result),
      );
    return result;
  };
  /** @param {Node} node */
  const walk = (node) => {
    if (options.expand && node.name === "symbols") return;
    const owner = key(node);
    for (const c of node.children) {
      const a = c.attributes,
        property = String(a.property),
        label = `${owner}.${property}`;
      if (c.name === "motionPath") {
        paths.set(c, motionPath(String(a.path)));
        easing(String(a.interpolation));
      }
      if (c.name === "link" || c.name === "expression") {
        if (!declaredAttribute(node.type, property))
          throw new Error(`unknown driven property ${node.name}.${property}`);
        const deps = dependencies.get(label) ?? new Set();
        dependencies.set(label, deps);
        if (c.name === "link") {
          const src = String(a.source);
          if (!src.includes(":")) {
            reference(src);
            deps.add(src);
          } else if (src.startsWith("marker:")) timeline.marker(src.slice(7));
          else if (
            src.startsWith("param:") &&
            params[src.slice(6)] === undefined
          )
            throw new Error(`unknown parameter ${src.slice(6)}`);
          else if (src.startsWith("audio:") && !options.audioAmplitude)
            throw new Error("audio link needs an audio analysis provider");
          else if (!/^(marker|param|audio):/.test(src))
            throw new Error(`invalid link source ${src}`);
          if (Number(a.min ?? -Infinity) > Number(a.max ?? Infinity))
            throw new Error("link min exceeds max");
        } else if (a.enabled !== false) {
          const ex = compileExpression(String(c.value));
          expressions.set(c, ex);
          const ctx = context(
            node,
            0,
            property,
            node.attributes[property] ?? 0,
          );
          for (const name of ex.names)
            if (!Object.hasOwn(ctx, name))
              throw new Error(`unknown expression name ${name}`);
          for (const call of ex.calls) {
            if (call.name === "prop") {
              const ref = String(call.args[0]);
              reference(ref);
              deps.add(ref);
            }
            if (
              call.name === "param" &&
              params[String(call.args[0])] === undefined &&
              node.context?.[String(call.args[0])] === undefined
            )
              throw new Error("unknown expression parameter");
            if (call.name === "markerTime") timeline.marker(call.args[0]);
            if (call.name === "audioAmplitude" && !options.audioAmplitude)
              throw new Error(
                "audioAmplitude needs an audio analysis provider",
              );
          }
        }
      }
    }
    if (node.attributes.condition !== undefined) {
      const ex = compileExpression(String(node.attributes.condition)),
        ctx = context(node, 0, "visible", true);
      for (const name of ex.names)
        if (!Object.hasOwn(ctx, name))
          throw new Error(`unknown condition name ${name}`);
      for (const call of ex.calls) {
        if (call.name === "prop") reference(String(call.args[0]));
        if (
          call.name === "param" &&
          params[String(call.args[0])] === undefined &&
          node.context?.[String(call.args[0])] === undefined
        )
          throw new Error("unknown condition parameter");
      }
      conditions.set(node, ex);
    }
    for (const child of node.children) walk(child);
  };
  walk(scene);
  const done = new Set(),
    visiting = new Set();
  /** @param {string} id */ const visit = (id) => {
    if (visiting.has(id)) throw new Error(`dependency cycle at ${id}`);
    if (done.has(id)) return;
    visiting.add(id);
    for (const d of dependencies.get(id) ?? []) visit(d);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of dependencies.keys()) visit(id);
  /** @param {Node} node @param {number} t @param {boolean} [ignoreInterval] */
  const enabled = (node, t, ignoreInterval = false) => {
    const clock = timeline.spans.get(node);
    const time = clock?.composition(t) ?? t;
    return (
      (ignoreInterval ||
        (node.sourceClock && clock?.active
          ? clock.active(t)
          : time >= (clock?.start ?? 0) &&
            time < (clock?.end ?? timeline.duration))) &&
      value(node, "visible", t) !== false &&
      (!conditions.has(node) ||
        Boolean(
          conditions.get(node)?.evaluate(context(node, t, "visible", true)),
        ))
    );
  };
  /** @param {Node} node @param {number} t */
  const attributes = (node, t) =>
    Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(node.attributes),
          ...node.children
            .filter((c) => ["animate", "expression", "link"].includes(c.name))
            .map((c) => String(c.attributes.property)),
        ]),
      ].map((p) => [p, value(node, p, t)]),
    );
  /** Scoped instance evaluation is usable before the compositor implements drawing symbols.
   * @param {string} instanceId @param {string} innerId @param {string} property @param {number} t */
  const instanceValue = (instanceId, innerId, property, t) => {
    const instance = ids.get(instanceId),
      symbol = ids.get(String(instance?.attributes.symbol));
    if (
      !instance ||
      instance.name !== "instance" ||
      !symbol ||
      symbol.name !== "symbol"
    )
      throw new Error(`invalid instance ${instanceId}`);
    const innerIds = new Set();
    const collect = (/** @type {Node} */ n) => {
      if (n.attributes.id !== undefined) innerIds.add(String(n.attributes.id));
      for (const c of n.children) collect(c);
    };
    collect(symbol);
    for (const o of instance.children.filter((n) => n.name === "override"))
      if (!innerIds.has(String(o.attributes.target)))
        throw new Error(
          `unknown instance override target ${String(o.attributes.target)}`,
        );
    const overrides = new Map(
      instance.children
        .filter((n) => n.name === "override")
        .map((n) => [
          `${String(n.attributes.target)}.${String(n.attributes.property)}`,
          String(n.attributes.value),
        ]),
    );
    /** @param {Node} n @returns {Node} */
    const clone = (n) => {
      const attributes = { ...n.attributes };
      for (const [k, v] of overrides) {
        const dot = k.lastIndexOf(".");
        if (k.slice(0, dot) === n.attributes.id)
          attributes[k.slice(dot + 1)] = propertyValue(n, k.slice(dot + 1), v);
      }
      return { ...n, attributes, children: n.children.map(clone) };
    };
    const composition = scene.children.find((n) => n.name === "composition");
    if (!composition) throw new Error("composition missing");
    const duration = Number(symbol.attributes.duration ?? timeline.duration);
    const scopedScene = {
      ...scene,
      children: scene.children
        .filter((n) => !["symbols", "output"].includes(n.name))
        .map((n) =>
          n.name === "parameters"
            ? {
                ...n,
                children: n.children.filter((c) =>
                  ["param", "data"].includes(c.name),
                ),
              }
            : n.name === "composition"
              ? { ...composition, children: symbol.children.map(clone) }
              : n.name === "project"
                ? { ...n, attributes: { ...n.attributes, duration } }
                : n,
        ),
    };
    const scoped = compileRuntime(scopedScene, {
      ...options,
      parameters: params,
      variant: undefined,
      data: undefined,
    });
    const target = scoped.ids.get(innerId);
    if (!target)
      throw new Error(`unknown instance target ${instanceId}/${innerId}`);
    return scoped.value(
      target,
      property,
      instanceTime(
        {
          ...instance.attributes,
          start: timeline.spans.get(instance)?.start ?? 0,
        },
        t,
        duration,
      ),
    );
  };
  return {
    ...resolved,
    timeline,
    tracks: compiled.tracks,
    value,
    enabled,
    attributes,
    instanceValue,
    textSelector: (
      /** @type {Node} */ node,
      /** @type {number} */ time,
      /** @type {number} */ index,
      /** @type {number} */ count,
    ) => {
      const expression = node.children.find(
        (n) => n.name === "expression" && n.attributes.property === "selector",
      );
      if (!expression) return undefined;
      return Number(
        expressions.get(expression)?.evaluate({
          ...context(node, time, "selector", 0),
          textIndex: index,
          textTotal: count,
        }),
      );
    },
  };
}
