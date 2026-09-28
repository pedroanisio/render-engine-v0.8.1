import { noise } from '../eval/expression.js';
import { svgPathProperties } from 'svg-path-properties';
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {{index:number,count:number,word:number,words:number,line:number,lines:number,span:number,spans:number,role:string,text:string,size:number}} Unit */
const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
/** Pure selector, including seeded random order and absolute-time wiggle.
 * @param {Record<string,any>} a @param {Unit} unit @param {number} time @param {number} [expression] */
export function selection(a, unit, time, expression) {
  let index = unit.index,
    count = unit.count;
  if (a.unit === 'word') {
    index = unit.word;
    count = unit.words;
  }
  if (a.unit === 'line') {
    index = unit.line;
    count = unit.lines;
  }
  if (a.unit === 'span') {
    index = unit.span;
    count = unit.spans;
  }
  if (a.span && a.span !== unit.role) return { amount: 0, progress: 1 };
  if (a.unit === 'character-no-space' && /^\s+$/.test(unit.text))
    return { amount: 0, progress: 1 };
  const seed = Number(BigInt(String(a.seed ?? 0)) & 0xffffffffn);
  if (a.order === 'reverse') index = count - 1 - index;
  else if (a.order === 'center-out')
    index = Math.abs(index - (count - 1) / 2) * 2;
  else if (a.order === 'edges-in')
    index = Math.min(index, count - 1 - index) * 2;
  else if (a.order === 'random') {
    const order = Array.from({ length: count }, (_, i) => i).sort(
      (x, y) => noise(seed, x) - noise(seed, y) || x - y,
    );
    index = order.indexOf(index);
  }
  const point =
      a.rangeUnits === 'index'
        ? index + 0.5
        : ((index + 0.5) / Math.max(1, count)) * 100,
    start = Number(a.start ?? 0) + Number(a.offset ?? 0),
    end = Number(a.end ?? 100) + Number(a.offset ?? 0),
    u = (point - start) / (end - start || 1);
  let amount = u >= 0 && u <= 1 ? 1 : 0;
  if (amount) {
    if (a.shape === 'ramp-up') amount = u;
    if (a.shape === 'ramp-down') amount = 1 - u;
    if (a.shape === 'triangle') amount = 1 - Math.abs(u * 2 - 1);
    if (a.shape === 'round')
      amount = Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2));
    if (a.shape === 'smooth') amount = Math.sin(u * Math.PI) ** 2;
    const smooth = Number(a.smoothness ?? 1);
    amount = 1 - smooth + smooth * amount;
    amount = amount ** (2 ** (-Number(a.easeHigh ?? 0) / 100));
    amount = 1 - (1 - amount) ** (2 ** (-Number(a.easeLow ?? 0) / 100));
  }
  if (a.selector === 'wiggly') {
    const t = time * Number(a.wiggleRate ?? 2),
      n = Math.floor(t),
      f = t - n;
    amount *= noise(seed, index, n) * (1 - f) + noise(seed, index, n + 1) * f;
  }
  if (a.selector === 'expression')
    amount = clamp(Number(expression ?? 0) / 100);
  amount *= Number(a.amount ?? 100) / 100;
  const duration = Number(a.presetDuration ?? 1),
    stagger =
      Number(a.stagger ?? duration / Math.max(1, count)) *
      (1 - Number(a.overlap ?? 0)),
    progress = clamp(
      (time - Number(a.presetStart ?? 0) - index * stagger) / duration,
    );
  return { amount, progress };
}
/** @param {Record<string,any>} a @param {Unit} unit @param {number} time @param {number} [expression] */
export function textTransform(a, unit, time, expression) {
  const { amount, progress: p } = selection(a, unit, time, expression),
    q = 1 - p,
    size = unit.size;
  /** @type {Record<string,any>} */ const out = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    tracking: 0,
    baselineShift: 0,
    lineSpacing: 0,
  };
  switch (a.preset) {
    case 'typewriter':
    case 'letter-by-letter':
    case 'word-by-word':
    case 'line-by-line':
      out.opacity = p > 0 ? 1 : 0;
      break;
    case 'fade-in':
      out.opacity = p;
      break;
    case 'fade-out':
      out.opacity = q;
      break;
    case 'ascend':
      out.y = q * size;
      out.rotation = -q * 20;
      out.opacity = p;
      break;
    case 'slide-up':
      out.y = q * size;
      out.opacity = p;
      break;
    case 'slide-down':
      out.y = -q * size;
      out.opacity = p;
      break;
    case 'slide-left':
      out.x = q * size;
      out.opacity = p;
      break;
    case 'shift':
      out.x = -q * size * (unit.index + 1) * 0.3;
      out.tracking = q * size * 0.15;
      out.opacity = p;
      break;
    case 'slide-right':
      out.x = -q * size;
      out.opacity = p;
      break;
    case 'pop':
      out.scaleX = out.scaleY = p + Math.sin(p * Math.PI) * 0.35;
      out.opacity = p;
      break;
    case 'scale-in':
      out.scaleX = out.scaleY = p;
      out.opacity = p;
      break;
    case 'blur-in':
      out.blur = q * size * 0.25;
      out.opacity = p;
      break;
    case 'wave':
      out.y = Math.sin(time * 4 - unit.index * 0.5) * size * 0.2;
      break;
    case 'bounce':
      out.y = -Math.abs(Math.sin(p * Math.PI * 3)) * q * size;
      break;
    case 'spin':
      out.rotation = q * 360;
      out.opacity = p;
      break;
    case 'scramble':
      if (p < 1)
        out.characterOffset = Math.floor(
          noise(Number(a.seed ?? 0), unit.index, Math.floor(time * 20)) * 26,
        );
      break;
    case 'counter':
      out.counter = p;
      break;
    case 'karaoke':
      out.karaoke = p;
      break;
    case 'highlight':
      out.highlight = p;
      break;
    case 'tracking-in':
      out.tracking = q * size;
      out.opacity = p;
      break;
    case 'mask-reveal':
      out.reveal = p;
      break;
  }
  for (const key of [
    'x',
    'y',
    'rotation',
    'tracking',
    'baselineShift',
    'lineSpacing',
    'blur',
    'characterOffset',
  ])
    out[key] = Number(out[key] ?? 0) + Number(a[key] ?? 0);
  for (const key of ['scaleX', 'scaleY'])
    out[key] *= Number(a[key] ?? a.scale ?? 1);
  out.opacity *= Number(a.opacity ?? 1);
  out.scaleX *= Math.cos((Number(a.rotationY ?? 0) * Math.PI) / 180);
  out.scaleY *= Math.cos((Number(a.rotationX ?? 0) * Math.PI) / 180);
  const perspective = 1000 / Math.max(1, 1000 + Number(a.zDepth ?? 0));
  out.scaleX *= perspective;
  out.scaleY *= perspective;
  for (const key of Object.keys(out)) {
    if (typeof out[key] === 'number') {
      const neutral = [
        'scaleX',
        'scaleY',
        'opacity',
        'reveal',
        'counter',
      ].includes(key)
        ? 1
        : 0;
      out[key] = neutral + (out[key] - neutral) * amount;
    }
  }
  for (const key of ['fill', 'stroke', 'strokeWidth', 'variation'])
    if (
      a[key] !== undefined &&
      amount > 0 &&
      !(key === 'fill' && ['karaoke', 'highlight'].includes(a.preset))
    )
      out[key] = a[key];
  out.skew = Number(a.skew ?? 0) * amount;
  out.anchorX = Number(a.anchorX ?? 0);
  out.anchorY = Number(a.anchorY ?? 0);
  return out;
}
/** @param {Record<string,any>} a @param {number} distance @param {number} advance @param {number} fullWidth */
export function textPathPoint(a, distance, advance, fullWidth) {
  const path = new svgPathProperties(String(a.path)),
    length = path.getTotalLength(),
    first = Number(a.firstMargin ?? 0),
    last = Number(a.lastMargin ?? 0),
    offset = String(a.startOffset ?? 0).endsWith('%')
      ? (parseFloat(a.startOffset) * length) / 100
      : Number(a.startOffset ?? 0),
    available = Math.max(0, length - first - last);
  let d =
    first +
    offset +
    (a.forceAlignment && fullWidth > 0
      ? (distance / fullWidth) * available
      : distance) +
    advance / 2;
  if (a.reverse) d = length - d;
  const point = path.getPointAtLength(Math.max(0, Math.min(length, d))),
    tangent = path.getTangentAtLength(Math.max(0, Math.min(length, d)));
  return {
    x: point.x,
    y: point.y,
    rotation:
      a.perpendicular === false
        ? 0
        : (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI +
          (a.reverse ? 180 : 0),
  };
}

/** Compose independently selected animator properties in declaration order.
 * @param {Array<Record<string,any>>} transforms */
export function combineTransforms(transforms) {
  /** @type {Record<string,any>} */ const result = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    tracking: 0,
    baselineShift: 0,
    lineSpacing: 0,
    skew: 0,
    anchorX: 0,
    anchorY: 0,
  };
  for (const transform of transforms)
    for (const [key, value] of Object.entries(transform)) {
      if (key === 'combine') continue;
      if (typeof value !== 'number') {
        result[key] = value;
        continue;
      }
      const identity = ['scaleX', 'scaleY', 'opacity'].includes(key) ? 1 : 0,
        previous = Number(result[key] ?? identity);
      result[key] =
        transform.combine === 'replace'
          ? value
          : transform.combine === 'multiply'
            ? previous * value
            : identity + (previous - identity) + (value - identity);
    }
  result.opacity = Math.max(0, Math.min(1, result.opacity));
  result.blur = Math.max(0, result.blur);
  return result;
}
