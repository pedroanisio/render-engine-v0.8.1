import { svgPathProperties } from 'svg-path-properties';
/** Parameter-space traversal (equal time per SVG segment), as opposed to arc length. */
/** @param {InstanceType<typeof import('svg-path-properties').svgPathProperties>} path @param {number} u */
export function parameterPoint(path, u) {
  const parts = path.getParts();
  if (!parts.length) return path.getPointAtLength(0);
  const scaled = Math.max(0, Math.min(1, u)) * parts.length,
    index = Math.min(parts.length - 1, Math.floor(scaled)),
    p = parts[index];
  if (!p) throw new Error('missing SVG path segment');
  const t = scaled - index,
    v = 1 - t,
    d = p.details,
    s = p.start,
    e = p.end;
  /** @param {'x'|'y'} axis */ const component = (axis) => {
    const j = axis === 'x' ? 1 : 2;
    if (d[0] === 'C')
      return (
        v ** 3 * s[axis] +
        3 * v * v * t * Number(d[j]) +
        3 * v * t * t * Number(d[j + 2]) +
        t ** 3 * e[axis]
      );
    if (d[0] === 'Q') return v * v * s[axis] + 2 * v * t * Number(d[j]) + t * t * e[axis];
    return s[axis] + (e[axis] - s[axis]) * t;
  };
  if (d[0] !== 'A') return { x: component('x'), y: component('y') };
  let rx = Math.abs(d[1]),
    ry = Math.abs(d[2]);
  if (!rx || !ry) return { x: s.x + (d[6] - s.x) * t, y: s.y + (d[7] - s.y) * t };
  const angle = (d[3] * Math.PI) / 180,
    c = Math.cos(angle),
    sn = Math.sin(angle),
    dx = (s.x - e.x) / 2,
    dy = (s.y - e.y) / 2,
    x = c * dx + sn * dy,
    y = -sn * dx + c * dy;
  const ratio = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (ratio > 1) {
    rx *= Math.sqrt(ratio);
    ry *= Math.sqrt(ratio);
  }
  const sign = d[4] === d[5] ? -1 : 1,
    den = rx * rx * y * y + ry * ry * x * x;
  const factor = den ? sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)) : 0,
    cx = (factor * rx * y) / ry,
    cy = (-factor * ry * x) / rx;
  const start = Math.atan2((y - cy) / ry, (x - cx) / rx),
    end = Math.atan2((-y - cy) / ry, (-x - cx) / rx);
  let sweep = end - start;
  if (!d[5] && sweep > 0) sweep -= 2 * Math.PI;
  if (d[5] && sweep < 0) sweep += 2 * Math.PI;
  const theta = start + sweep * t,
    px = rx * Math.cos(theta) + cx,
    py = ry * Math.sin(theta) + cy;
  return { x: c * px - sn * py + (s.x + e.x) / 2, y: sn * px + c * py + (s.y + e.y) / 2 };
}

/** Canonicalize zero-radius arcs to lines (SVG's specified degenerate case).
 * Arc flags are single characters, so compact forms like `a5 5 0 0110 10` parse. @param {string} source */
export function motionPath(source) {
  const number = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const out = [];
  let command = '',
    i = 0;
  const skip = () => {
    while (i < source.length && /[\s,]/.test(String(source[i]))) i++;
  };
  /** @param {boolean} flag */
  const read = (flag) => {
    skip();
    if (flag && (source[i] === '0' || source[i] === '1')) return String(source[i++]);
    number.lastIndex = i;
    const m = flag ? null : number.exec(source);
    if (m) {
      i = number.lastIndex;
      return m[0];
    }
    if (i < source.length && !/[-+.\da-df-zA-DF-Z]/.test(String(source[i])))
      throw new Error('invalid SVG path text');
    throw new Error('invalid SVG path arguments');
  };
  skip();
  while (i < source.length) {
    if (/[a-df-zA-DF-Z]/.test(String(source[i]))) command = String(source[i++]);
    else if (!command && !/[-+.\d]/.test(String(source[i]))) throw new Error('invalid SVG path text');
    const upper = command.toUpperCase(),
      n = /** @type {Record<string,number>} */ (arity)[upper];
    if (n === undefined) throw new Error('invalid SVG path command');
    if (n === 0) {
      out.push(command);
      command = '';
      skip();
      continue;
    }
    const args = Array.from({ length: n }, (_, j) => read(upper === 'A' && (j === 3 || j === 4)));
    if (args.some((x) => !Number.isFinite(Number(x)))) throw new Error('invalid SVG path arguments');
    skip();
    if (upper === 'A' && (Number(args[0]) === 0 || Number(args[1]) === 0))
      out.push(command === 'A' ? 'L' : 'l', ...args.slice(5));
    else out.push(command, ...args);
    if (command === 'M') command = 'L';
    else if (command === 'm') command = 'l';
  }
  if (!out.length) throw new Error('empty SVG motion path');
  return new svgPathProperties(out.join(' '));
}
