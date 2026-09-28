/** Pure timeline resolution. All times are seconds, with rational FPS retained. */
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
import { compileAnimations } from './track.js';
export const identity = (/** @type {number} */ t) => t;
/** @param {unknown} value */
export function fpsOf(value) {
  const [n, d = 1] = String(value).split('/').map(Number);
  if (!n || !d || n < 0 || d < 0) throw new Error('FPS must be positive');
  return { numerator: n, denominator: d, value: n / d };
}
/** @param {string} text @param {number} fps */
export function timecode(text, fps) {
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return Number(text);
  const m = /^(\d+):([0-5]\d):([0-5]\d):(\d+)$/.exec(text);
  if (!m || Number(m[4]) >= Math.ceil(fps))
    throw new Error(`invalid non-drop-frame timecode ${text}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / fps;
}
/** @param {Node} scene */
export function clocks(scene) {
  const project = scene.children.find((n) => n.name === 'project');
  const duration = Number(project?.attributes.duration);
  const fps = fpsOf(project?.attributes.fps);
  /** @type {Map<string, number>} */ const markers = new Map();
  const section = scene.children.find((n) => n.name === 'markers');
  const grids = section?.children.filter((n) => n.name === 'beatGrid') ?? [];
  if (grids.length > 1) throw new Error('only one beatGrid may define beat.N/bar.N');
  const grid = grids[0];
  const period = 60 / Number(grid?.attributes.bpm ?? 60);
  const offset = Number(grid?.attributes.offset ?? 0);
  if (grid) {
    for (let i = 0; offset + i * period <= duration; i++) {
      markers.set(`beat.${i}`, offset + i * period);
      if (i % Number(grid.attributes.beatsPerBar) === 0)
        markers.set(`bar.${i / Number(grid.attributes.beatsPerBar)}`, offset + i * period);
      if (i > 1000000) throw new Error('beat grid exceeds one million markers');
    }
  }
  for (const n of section?.children ?? [])
    if (n.name === 'marker') {
      const id = String(n.attributes.id);
      if (markers.has(id)) throw new Error(`duplicate generated marker ${id}`);
      markers.set(id, Number(n.attributes.time));
    }
  /** @param {unknown} id */
  const marker = (id) => {
    const t = markers.get(String(id));
    if (t === undefined) throw new Error(`unknown marker ${String(id)}`);
    return t;
  };
  /** @typedef {{start:number,end:number,composition:(t:number)=>number,local:(t:number)=>number,active?:(t:number)=>boolean}} Clock */
  /** @type {Map<Node, Clock>} */ const spans = new Map();
  /** @param {Node} n @param {Clock} parent @param {{start:number,end:number}} [placement] */
  const walk = (n, parent, placement) => {
    const a = n.attributes;
    const start =
      placement?.start ??
      (a.startMarker === undefined
        ? Number(
            n.specifiedAttributes && !n.specifiedAttributes.includes('start')
              ? parent.start
              : (a.start ?? parent.start),
          )
        : marker(a.startMarker) + Number(a.start ?? 0));
    const end =
      placement?.end ??
      (a.endMarker === undefined
        ? Number(a.end ?? parent.end)
        : marker(a.endMarker) + Number(a.end ?? 0));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      throw new Error(`${n.path}: invalid interval [${start},${end}]`);
    const scale = Number(a.timeScale ?? 1),
      shift = Number(a.timeOffset ?? 0);
    if (!Number.isFinite(scale) || scale === 0)
      throw new Error(`${n.path}: timeScale must be finite and nonzero`);
    /** @type {import('./track.js').Track|undefined} */
    let remap;
    if (n.sourceRemap) {
      const map = n.sourceRemap;
      const anim = {
        ...map,
        name: 'animate',
        type: 'animateType',
        attributes: {
          defaultInterpolation: map.attributes.defaultInterpolation ?? 'linear',
          property: 'x',
          timeBase: 'composition',
        },
        children: map.children,
      };
      const target = {
        ...n,
        name: 'shape',
        type: 'shapeType',
        sourceClock: undefined,
        sourceRemap: undefined,
        attributes: { id: 'remap', x: 0 },
        children: [anim],
      };
      const result = compileAnimations({
        ...scene,
        children: [...(project ? [project] : []), target],
      });
      if (result.diagnostics.length)
        throw new Error(result.diagnostics.map((d) => d.message).join('; '));
      remap = result.tracks.get('remap')?.[0];
      if (map.attributes.frameBlend !== 'none')
        throw new Error('instance timeRemap frameBlend requires a media interpolation backend');
    }
    const composition = (/** @type {number} */ t) =>
      remap
        ? Number(remap.valueAt(parent.composition(t) - start))
        : n.sourceClock
          ? Math.min(
              n.sourceClock.duration - Number.EPSILON * Math.max(1, n.sourceClock.duration),
              instanceTime(
                { ...n.sourceClock, start },
                parent.composition(t),
                n.sourceClock.duration,
              ),
            )
          : start + (parent.composition(t) - start) * scale + shift;
    const clock = {
      start: n.sourceClock ? 0 : start,
      end: n.sourceClock ? n.sourceClock.duration : end,
      active: (/** @type {number} */ t) =>
        parent.composition(t) >= start && parent.composition(t) < end,
      composition,
      local: (/** @type {number} */ t) => composition(t) - (n.sourceClock ? 0 : start),
    };
    spans.set(n, clock);
    let cursor = start;
    for (const c of n.children) {
      if (
        n.name === 'sequence' &&
        ['group', 'layer', 'shape', 'instance', 'sequence', 'particleEmitter'].includes(c.name)
      ) {
        const originalStart = Number(c.attributes.start ?? 0);
        const length = Number(c.attributes.end ?? c.attributes.duration ?? end) - originalStart;
        if (length <= 0) throw new Error(`${c.path}: sequence child needs a positive duration`);
        const placedStart = cursor + originalStart;
        walk(c, clock, { start: placedStart, end: placedStart + length });
        cursor = placedStart + length + Number(a.timeGap ?? 0);
      } else walk(c, clock);
    }
  };
  walk(scene, {
    start: 0,
    end: duration,
    composition: identity,
    local: identity,
  });
  return {
    duration,
    fps,
    markers,
    marker,
    spans,
    beat: (/** @type {number} */ t) => (t - offset) / period,
  };
}
/** Source time of a reusable composition; loop=0 plays once, N adds N repeats.
 * @param {Record<string,import('../xsd/typed-value.js').TypedValue>} a
 * @param {number} t @param {number} sourceDuration
 */
export function instanceTime(a, t, sourceDuration) {
  const start = Number(a.start ?? 0),
    clipIn = Number(a.clipIn ?? 0),
    clipOut = Number(a.clipOut ?? sourceDuration),
    length = clipOut - clipIn,
    speed = Number(a.speed ?? 1);
  if (length <= 0 || !Number.isFinite(length) || !Number.isFinite(speed))
    throw new Error('invalid instance source interval');
  const elapsed = (t - start) * Math.abs(speed),
    repeats = Number(a.loop ?? 0),
    last = length * (repeats + 1);
  const phase = elapsed <= 0 ? 0 : elapsed >= last ? length : elapsed % length;
  return a.reverse === true || speed < 0 ? clipOut - phase : clipIn + phase;
}
