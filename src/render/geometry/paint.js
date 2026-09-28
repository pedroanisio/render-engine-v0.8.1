import { parseColor } from '../color.js';
import { clamp } from './blend.js';
import { noise } from '../../eval/expression.js';
/** @param {number} v */ const enc = (v) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
/** @param {number} v */ const dec = (v) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
/** @param {number[]} c */ function lab(c) {
  const r = Number(c[0]),
    g = Number(c[1]),
    b = Number(c[2]),
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** @param {number[]} c */ function rgb(c) {
  const L = Number(c[0]),
    a = Number(c[1]),
    b = Number(c[2]),
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
/** @param {number[]} a @param {number[]} b @param {number} t @param {string} space */
export function colorMix(a, b, t, space) {
  const alpha = Number(a[3]) * (1 - t) + Number(b[3]) * t;
  if (alpha <= 0) return [0, 0, 0, 0];
  t = (Number(b[3]) * t) / alpha;
  let x = a.slice(0, 3),
    y = b.slice(0, 3);
  if (space === 'srgb') {
    x = x.map(enc);
    y = y.map(enc);
  }
  if (space === 'oklab' || space === 'oklch') {
    x = lab(x);
    y = lab(y);
  }
  if (space === 'oklch') {
    const ca = Math.hypot(Number(x[1]), Number(x[2])),
      cb = Math.hypot(Number(y[1]), Number(y[2])),
      ha = Math.atan2(Number(x[2]), Number(x[1])),
      hb = Math.atan2(Number(y[2]), Number(y[1])),
      dh = ((hb - ha + 3 * Math.PI) % (2 * Math.PI)) - Math.PI,
      c = ca + (cb - ca) * t,
      h = ha + dh * t;
    x = [Number(x[0]) + (Number(y[0]) - Number(x[0])) * t, c * Math.cos(h), c * Math.sin(h)];
  } else x = x.map((v, i) => v + (Number(y[i]) - v) * t);
  if (space === 'srgb') x = x.map(dec);
  if (space === 'oklab' || space === 'oklch') x = rgb(x);
  return [...x.map(clamp), alpha];
}
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @param {string} value @param {{paints:Map<string,Node>,tokens:Map<string,string>,attributes:(n:Node)=>Record<string,any>,image:(id:string)=>import('../surface.js').Surface,scale:number}} env @param {number} width @param {number} height */
export function paint(value, env, width, height) {
  if (!value.startsWith('url(#')) {
    const rgba = parseColor(value, env.tokens);
    return (/** @type {number} */ x, /** @type {number} */ y) => rgba;
  }
  const node = env.paints.get(value.slice(5, -1));
  if (!node) throw new Error(`unknown paint ${value}`);
  const a = env.attributes(node),
    angle = (Number(a.rotation ?? 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  if (node.name === 'pattern') {
    const img = env.image(String(a.asset)),
      tw = Number(a.tileWidth ?? img.width / env.scale),
      th = Number(a.tileHeight ?? img.height / env.scale),
      scale = Number(a.scale ?? 1);
    return (/** @type {number} */ x, /** @type {number} */ y) => {
      const dx = (x - Number(a.offsetX ?? 0)) / scale,
        dy = (y - Number(a.offsetY ?? 0)) / scale,
        u = ((((c * dx + s * dy) % tw) + tw) % tw) / tw,
        v = ((((-s * dx + c * dy) % th) + th) % th) / th,
        i = (Math.floor(v * img.height) * img.width + Math.floor(u * img.width)) * 4,
        alpha = Number(img.data[i + 3]);
      return [0, 1, 2].map((k) => (alpha ? Number(img.data[i + k]) / alpha : 0)).concat(alpha);
    };
  }
  const stops = node.children
    .filter((n) => n.name === 'stop')
    .map((n) => {
      const p = env.attributes(n),
        color = parseColor(String(p.color), env.tokens);
      color[3] *= Number(p.opacity ?? 1);
      return {
        offset: Number(p.offset),
        midpoint: Number(p.midpoint ?? 0.5),
        color,
      };
    })
    .sort((a, b) => a.offset - b.offset);
  const points = node.children.filter((n) => n.name === 'point').map((n) => env.attributes(n));
  const space = String(a.interpolationSpace ?? 'linear');
  const meshColors = new Map(
    points.map((p) => {
      const color = parseColor(String(p.color), env.tokens),
        linear = color.slice(0, 3);
      return [
        `${p.row}:${p.col}`,
        [
          ...(space === 'oklab' ? lab(linear) : space === 'srgb' ? linear.map(enc) : linear).map(v=>v*Number(color[3])),
          color[3],
        ],
      ];
    }),
  );
  /** @param {number} row @param {number} col @param {number} u @param {number} v */
  const meshColor = (row, col, u, v) => {
    const rows = Number(a.rows),
      cols = Number(a.cols);
    /** @param {number} t */ const weights = (t) => [
      -0.5 * t + t * t - 0.5 * t * t * t,
      1 - 2.5 * t * t + 1.5 * t * t * t,
      0.5 * t + 2 * t * t - 1.5 * t * t * t,
      -0.5 * t * t + 0.5 * t * t * t,
    ];
    const wx = weights(u),
      wy = weights(v),
      result = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const r = Math.max(0, Math.min(rows - 1, row + j - 1)),
          c = Math.max(0, Math.min(cols - 1, col + i - 1)),
          color = meshColors.get(`${r}:${c}`);
        if (!color) throw new Error('mesh gradient has missing grid point');
        for (let k = 0; k < 4; k++)
          result[k] = Number(result[k]) + Number(color[k]) * Number(wx[i]) * Number(wy[j]);
      }
    const alpha=clamp(Number(result[3]));
    const channels = result.slice(0, 3).map(v=>alpha?v/alpha:0);
    return [
      ...(space === 'oklab'
        ? rgb(channels)
        : space === 'srgb'
          ? channels.map(dec)
          : channels
      ).map(clamp),
      clamp(Number(result[3])),
    ];
  };
  const sample = (/** @type {number} */ t) => {
    if (a.spread === 'repeat') t = ((t % 1) + 1) % 1;
    else if (a.spread === 'reflect') {
      t = ((t % 2) + 2) % 2;
      if (t > 1) t = 2 - t;
    } else t = clamp(t);
    if (!stops.length) throw new Error('gradient requires color stops');
    let lo = stops[0];
    for (const hi of stops.slice(1)) {
      if (!lo) break;
      if (t < hi.offset) {
        const u = clamp((t - lo.offset) / (hi.offset - lo.offset)),
          mid = lo.midpoint;
        const v = mid <= 0 ? 1 : mid >= 1 ? 0 : u ** (Math.log(0.5) / Math.log(mid));
        return colorMix(lo.color, hi.color, v, space);
      }
      lo = hi;
    }
    return /** @type {number[]} */ (lo?.color);
  };
  return (/** @type {number} */ px, /** @type {number} */ py) => {
    let x = a.units === 'user' ? px : px / width,
      y = a.units === 'user' ? py : py / height;
    const cx = Number(a.cx ?? 0.5),
      cy = Number(a.cy ?? 0.5),
      dx = x - cx,
      dy = y - cy;
    x = cx + c * dx + s * dy;
    y = cy + -s * dx + c * dy;
    let t = 0,
      rgba;
    if (node.name === 'meshGradient') {
      const rows = Number(a.rows),
        cols = Number(a.cols);
      let best = Infinity,
        bestColor = [0, 0, 0, 0];
      for (let r = 0; r < rows - 1; r++)
        for (let col = 0; col < cols - 1; col++) {
          const pp = [
            [r, col],
            [r, col + 1],
            [r + 1, col],
            [r + 1, col + 1],
          ].map(([rr, cc]) => {
            const p = points.find((p) => p.row === rr && p.col === cc);
            if (!p) throw new Error('mesh gradient has missing grid point');
            return {
              x: Number(p.x ?? Number(cc) / (cols - 1)),
              y: Number(p.y ?? Number(rr) / (rows - 1)),
              color: parseColor(String(p.color), env.tokens),
            };
          });
          const p0 = pp[0],
            p1 = pp[1],
            p2 = pp[2],
            p3 = pp[3];
          if (!p0 || !p1 || !p2 || !p3) continue;
          let u = 0.5,
            v = 0.5;
          for (let j = 0; j < 10; j++) {
            const X =
                p0.x * (1 - u) * (1 - v) +
                p1.x * u * (1 - v) +
                p2.x * (1 - u) * v +
                p3.x * u * v,
              Y =
                p0.y * (1 - u) * (1 - v) +
                p1.y * u * (1 - v) +
                p2.y * (1 - u) * v +
                p3.y * u * v,
              ux = (p1.x - p0.x) * (1 - v) + (p3.x - p2.x) * v,
              uy = (p1.y - p0.y) * (1 - v) + (p3.y - p2.y) * v,
              vx = (p2.x - p0.x) * (1 - u) + (p3.x - p1.x) * u,
              vy = (p2.y - p0.y) * (1 - u) + (p3.y - p1.y) * u,
              det = ux * vy - uy * vx;
            if (Math.abs(det) < 1e-12) break;
            u -= ((X - x) * vy - (Y - y) * vx) / det;
            v -= ((Y - y) * ux - (X - x) * uy) / det;
          }
          const distance = Math.max(0, -u, u - 1) ** 2 + Math.max(0, -v, v - 1) ** 2;
          if (distance < best) {
            best = distance;
            bestColor = meshColor(r, col, clamp(u), clamp(v));
          }
        }
      rgba = bestColor;
    } else {
      if (node.name === 'linearGradient') {
        const X = Number(a.x2) - Number(a.x1),
          Y = Number(a.y2) - Number(a.y1);
        t = ((x - Number(a.x1)) * X + (y - Number(a.y1)) * Y) / (X * X + Y * Y || 1);
      } else if (node.name === 'conicGradient')
        t =
          ((Math.atan2(y - cy, x - cx) - (Number(a.angle ?? 0) * Math.PI) / 180) /
            (2 * Math.PI) +
            1) %
          1;
      else {
        const fx = Number(a.fx ?? cx),
          fy = Number(a.fy ?? cy),
          aspect = Number(a.aspect ?? 1),
          vx = x - fx,
          vy = (y - fy) / aspect,
          X = cx - fx,
          Y = (cy - fy) / aspect,
          fr = Number(a.fr ?? 0),
          dr = Number(a.r) - fr,
          A = X * X + Y * Y - dr * dr,
          B = -2 * (vx * X + vy * Y + fr * dr),
          C = vx * vx + vy * vy - fr * fr,
          D = B * B - 4 * A * C;
        t =
          Math.abs(A) < 1e-12
            ? -C / (B || 1)
            : D < 0
              ? 0
              : Math.max((-B + Math.sqrt(D)) / (2 * A), (-B - Math.sqrt(D)) / (2 * A));
      }
      rgba = sample(t);
    }
    if (a.dither === true) {
      const d = (noise(7, Math.floor(px), Math.floor(py)) - 0.5) / 255;
      rgba = rgba.map((v, i) => (i === 3 ? v : clamp(v + d)));
    }
    return rgba;
  };
}
