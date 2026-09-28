import { createCanvas } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import bwip from 'bwip-js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { Surface } from '../render/surface.js';
import { shapePath, strokePath } from '../render/geometry/path.js';
import { paint } from '../render/geometry/paint.js';
import { noise } from '../eval/expression.js';
import { canvasPaint } from './canvas-paint.js';
import { parseColor } from '../render/color.js';
import { rgbaSurface } from './color.js';
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const maths = mathjax.document('', {
  InputJax: new TeX({
    packages: AllPackages.filter(
      (p) => !['noerrors', 'noundefined'].includes(p),
    ),
    maxBuffer: 65536,
    maxMacros: 1000,
  }),
  OutputJax: new SVG({ fontCache: 'none' }),
});
/** @param {string} svg @param {number} width @param {number} height */
export function svgSurface(svg, width, height) {
  if (
    /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|(?:href|url)\s*[=(]\s*["']?\s*(?:https?:|file:|\/\/)/i.test(
      svg,
    )
  )
    throw new Error('SVG external resources and active content are forbidden');
  const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
    }).render(),
    rgba = png.pixels;
  // resvg returns premultiplied RGBA (50% white is 128,128,128,128).
  const source = rgbaSurface(rgba, png.width, png.height, {
    alpha: 'premultiplied',
  });
  if (png.height === height) return source;
  const out = new Surface(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i =
        (Math.min(png.height - 1, Math.floor((y * png.height) / height)) *
          width +
          x) *
        4;
      out.data.set(source.data.subarray(i, i + 4), (y * width + x) * 4);
    }
  return out;
}
/** @param {Record<string,any>} a @param {number} scale */
export function codeSurface(a, scale) {
  const bcid = {
    qr: 'qrcode',
    datamatrix: 'datamatrix',
    pdf417: 'pdf417',
    ean13: 'ean13',
    'upc-a': 'upca',
    code128: 'code128',
  }[/** @type {'qr'} */ (a.kind)];
  const color = (/** @type {unknown} */ v) =>
    String(v).replace('#', '').slice(0, 6);
  const svg = bwip.toSVG(
    /** @type {any} */ ({
      bcid,
      text: String(a.data),
      ...(a.kind === 'qr'
        ? { eclevel: String(a.errorCorrection ?? 'M') }
        : a.kind === 'pdf417'
          ? {
              eclevel: { L: 1, M: 3, Q: 5, H: 7 }[
                /** @type {'M'} */ (a.errorCorrection ?? 'M')
              ],
            }
          : {}),
      padding: Number(a.quietZone ?? 4),
      barcolor: '000000',
      backgroundcolor: 'FFFFFF',
      scale: 1,
    }),
  );
  const surface = svgSurface(
      svg,
      Math.round(a.width * scale),
      Math.round(a.height * scale),
    ),
    foreground = parseColor(String(a.foreground ?? '#000000FF')),
    background = parseColor(String(a.background ?? '#FFFFFFFF'));
  for (let i = 0; i < surface.data.length; i += 4) {
    const blend = Number(surface.data[i]);
    for (let c = 0; c < 3; c++)
      surface.data[i + c] =
        Number(foreground[c]) * Number(foreground[3]) * (1 - blend) +
        Number(background[c]) * Number(background[3]) * blend;
    surface.data[i + 3] =
      Number(foreground[3]) * (1 - blend) + Number(background[3]) * blend;
  }
  return surface;
}
/** @param {Record<string,any>} a @param {number} scale @param {PaintEnv} [env] */
export function formulaSurface(a, scale, env) {
  const output = maths.convert(String(a.tex), {
    display: true,
    em: Number(a.size),
    ex: Number(a.size) / 2,
    containerWidth: Number(a.width),
  });
  let svg = adaptor.innerHTML(output);
  if (svg.includes('data-mjx-error')) throw new Error('invalid TeX formula');
  svg = svg.replace(/currentColor/g, '#FFFFFF');
  const view = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number),
    factor = Number(a.size ?? 48) / 1000;
  const width = Math.max(1, Number(view?.[2] ?? 1000) * factor),
    height = Math.max(1, Number(view?.[3] ?? 1000) * factor);
  svg = svg
    .replace(/width="[^"]+"/, 'width="' + width + '"')
    .replace(/height="[^"]+"/, 'height="' + height + '"');
  const ink = svgSurface(
      svg,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    ),
    out = new Surface(
      Math.round(a.width * scale),
      Math.round(a.height * scale),
    );
  out.drawSurface(ink, 0, 0, 1, 1, 1, out.bounds());
  const sample = env
    ? paint(
        String(a.color ?? '#FFFFFF'),
        env,
        Number(a.width),
        Number(a.height),
      )
    : () => parseColor(String(a.color ?? '#FFFFFF'));
  for (let i = 0; i < out.data.length; i += 4) {
    const rgba = sample(
        ((i / 4) % out.width) / scale,
        Math.floor(i / 4 / out.width) / scale,
      ),
      alpha = Number(out.data[i + 3]) * Number(rgba[3]);
    for (let c = 0; c < 3; c++) out.data[i + c] = Number(rgba[c]) * alpha;
    out.data[i + 3] = alpha;
  }
  return out;
}
/** @typedef {Parameters<typeof paint>[1]} PaintEnv */
/** @param {Record<string,any>} a @param {number} scale @param {PaintEnv} env */
export function vectorSurface(a, scale, env) {
  const w = Math.round(a.width * scale),
    h = Math.round(a.height * scale),
    out = new Surface(w, h),
    path = shapePath(a, Number(a.width), Number(a.height));
  const draw = (/** @type {boolean} */ stroke) => {
    const c = createCanvas(w, h),
      ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    if (stroke) {
      ctx.lineWidth = Number(a.strokeWidth);
      ctx.lineJoin = a.strokeJoin ?? 'miter';
      ctx.lineCap = a.strokeCap ?? 'butt';
      ctx.miterLimit = Number(a.miterLimit ?? 4);
      ctx.setLineDash(a.dash ?? []);
      ctx.lineDashOffset = Number(a.dashOffset ?? 0);
      if (a.strokePosition === 'inside' || a.strokePosition === 'outside')
        ctx.fill(strokePath(path, a));
      else ctx.stroke(path);
    } else ctx.fill(path, a.fillRule ?? 'nonzero');
    const pixels = ctx.getImageData(0, 0, w, h).data,
      sample = paint(
        String(stroke ? (a.stroke ?? '#00000000') : (a.fill ?? '#FFFFFF')),
        env,
        Number(a.width),
        Number(a.height),
      );
    for (let i = 0; i < w * h; i++) {
      const rgba = sample((i % w) / scale, Math.floor(i / w) / scale),
        alpha = (Number(rgba[3]) * Number(pixels[i * 4 + 3])) / 255;
      out.blend(
        i * 4,
        Number(rgba[0]) * alpha,
        Number(rgba[1]) * alpha,
        Number(rgba[2]) * alpha,
        alpha,
        1,
      );
    }
  };
  if (a.paintOrder === 'stroke-fill') {
    if (a.strokeWidth) draw(true);
    draw(false);
  } else {
    draw(false);
    if (a.strokeWidth) draw(true);
  }
  return out;
}
/** @param {number} seed @param {number} x @param {number} y @param {number} z */
function valueNoise(seed, x, y, z) {
  const X = Math.floor(x),
    Y = Math.floor(y),
    Z = Math.floor(z),
    smooth = (/** @type {number} */ v) => v * v * (3 - 2 * v),
    u = smooth(x - X),
    v = smooth(y - Y),
    t = smooth(z - Z);
  let result = 0;
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++)
        result +=
          noise(seed, X + i, Y + j, Z + k) *
          (i ? u : 1 - u) *
          (j ? v : 1 - v) *
          (k ? t : 1 - t);
  return result;
}
/** @param {Record<string,any>} a @param {number} scale @param {PaintEnv} env */
export function generatorSurface(a, scale, env) {
  const w = Math.round(a.width * scale),
    h = Math.round(a.height * scale),
    out = new Surface(w, h),
    p = paint(String(a.paint), env, a.width, a.height),
    q = paint(String(a.paint2), env, a.width, a.height),
    seed = Number(BigInt(String(a.seed ?? 0)) & 0xffffffffn),
    angle = (Number(a.angle) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    size = Number(a.scale),
    e = Number(a.evolution);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = (c * x + s * y) / scale / size,
        Y = (-s * x + c * y) / scale / size;
      let u = 0;
      switch (a.kind) {
        case 'solid':
          break;
        case 'gradient':
          u =
            0.5 +
            ((x - w / 2) * c + (y - h / 2) * s) /
              (Math.abs(c) * w + Math.abs(s) * h);
          break;
        case 'noise':
          u = valueNoise(seed, X, Y, e);
          break;
        case 'fractal-noise': {
          let total = 0,
            weight = 0;
          for (let i = 0; i < Number(a.octaves); i++) {
            total += valueNoise(seed, X * 2 ** i, Y * 2 ** i, e) * 0.5 ** i;
            weight += 0.5 ** i;
          }
          u = total / weight;
          break;
        }
        case 'film-grain':
          u = noise(seed, x, y, e);
          break;
        case 'checkerboard':
          u = (((Math.floor(X) + Math.floor(Y)) % 2) + 2) % 2;
          break;
        case 'stripes':
          u = ((X % 1) + 1) % 1 < 0.5 ? 0 : 1;
          break;
        case 'grid':
          u = ((X % 1) + 1) % 1 < 0.05 || ((Y % 1) + 1) % 1 < 0.05 ? 0 : 1;
          break;
        case 'cells': {
          let d = Infinity;
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
              const xx = Math.floor(X) + i,
                yy = Math.floor(Y) + j;
              d = Math.min(
                d,
                Math.hypot(
                  X - xx - noise(seed, xx, yy, 0),
                  Y - yy - noise(seed, xx, yy, 1),
                ),
              );
            }
          u = Math.min(1, d);
          break;
        }
        case 'light-rays': {
          const theta = (Math.atan2(y - h / 2, x - w / 2) - angle) * size;
          u =
            valueNoise(seed, theta, 0, e) *
            Math.max(
              0,
              1 - Math.hypot(x - w / 2, y - h / 2) / Math.hypot(w / 2, h / 2),
            );
          break;
        }
        default:
          throw new Error(`unknown generator ${a.kind}`);
      }
      u =
        a.kind === 'solid'
          ? 0
          : Math.max(0, Math.min(1, (u - 0.5) * Number(a.contrast) + 0.5));
      const A = p(x / scale, y / scale),
        B = q(x / scale, y / scale),
        alpha = Number(A[3]) * (1 - u) + Number(B[3]) * u;
      out.data.set(
        [0, 1, 2]
          .map(
            (k) =>
              Number(A[k]) * Number(A[3]) * (1 - u) +
              Number(B[k]) * Number(B[3]) * u,
          )
          .concat(alpha),
        (y * w + x) * 4,
      );
    }
  return out;
}
/** @param {Record<string,any>} a @param {Array<Record<string,any>>} series @param {number} scale @param {Record<string,any>} [style] @param {PaintEnv} [paintEnv] */
export function chartSurface(a, series, scale, style = {}, paintEnv) {
  const w = Math.round(a.width * scale),
    h = Math.round(a.height * scale),
    c = createCanvas(w, h),
    ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const W = Number(a.width),
    H = Number(a.height),
    pad = a.showAxes ? 24 : 4,
    iw = W - pad * 2,
    ih = H - pad * 2,
    progress = Number(a.progress ?? 1),
    values = series.flatMap((s) => s.values.map(Number)),
    max = Math.max(1, ...values),
    min = Math.min(0, ...values),
    range = max - min,
    palette = ['#60A5FA', '#34D399', '#FBBF24', '#F472B6'];
  const fill = paintEnv
    ? canvasPaint(ctx, paintEnv, W, H, scale)
    : (/** @type {string} */ v) => v;
  ctx.font = `${String(style.fontStyle ?? 'normal')} ${String(style.weight ?? 400)} ${Number(style.size ?? 12)}px ${String(style.font ?? 'sans-serif')}`;
  ctx.textBaseline = 'middle';
  const format = (/** @type {number} */ v) =>
    a.format
      ? new Intl.NumberFormat('en', {
          maximumFractionDigits: Math.min(
            12,
            Number(/\.([0]+)/.exec(String(a.format))?.[1]?.length ?? 0),
          ),
        }).format(v)
      : String(Math.round(v * 100) / 100);
  if (a.showAxes && !['pie', 'donut', 'counter', 'progress'].includes(a.kind)) {
    ctx.strokeStyle = '#808080';
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.stroke();
  }
  series.forEach((series, si) => {
    const val = series.values.map(Number),
      n = val.length;
    ctx.fillStyle = fill(String(series.color ?? palette[si % palette.length]));
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    const at = (/** @type {number} */ i) => pad + (iw * i) / Math.max(1, n - 1),
      Y = (/** @type {number} */ v) => H - pad - ((v - min) / range) * ih;
    if (a.kind === 'counter') {
      ctx.font = `${Number(style.size ?? 32)}px ${String(style.font ?? 'sans-serif')}`;
      ctx.fillText(format(Number(val[0] ?? 0) * progress), pad, H / 2);
    } else if (a.kind === 'progress') {
      ctx.fillRect(
        pad,
        H / 2 - 6,
        iw * Math.max(0, Math.min(1, Number(val[0] ?? 1) * progress)),
        12,
      );
    } else if (a.kind === 'pie' || a.kind === 'donut') {
      let start = -Math.PI / 2,
        total = val.reduce(
          (/** @type {number} */ s, /** @type {number} */ v) =>
            s + Math.max(0, v),
          0,
        );
      for (let i = 0; i < n; i++) {
        const end =
          start +
          (Math.max(0, Number(val[i])) / (total || 1)) * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - pad, start, end);
        ctx.closePath();
        ctx.fillStyle = palette[i % palette.length] ?? '#fff';
        ctx.fill();
        start = end;
      }
      if (a.kind === 'donut') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.min(W, H) / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (a.kind === 'bar' || a.kind === 'column') {
      val.forEach((/** @type {number} */ v, /** @type {number} */ i) => {
        if (a.kind === 'bar')
          ctx.fillRect(
            pad + (-min / range) * iw,
            pad + (i * ih) / n + (si * ih) / n / seriesCount(),
            ((iw * v) / range) * progress,
            (ih / n / seriesCount()) * 0.7,
          );
        else
          ctx.fillRect(
            pad + (i * iw) / n + (si * iw) / n / seriesCount(),
            Y(v * progress),
            (iw / n / seriesCount()) * 0.7,
            Y(0) - Y(v * progress),
          );
      });
    } else {
      ctx.beginPath();
      val.forEach((/** @type {number} */ v, /** @type {number} */ i) => {
        const x = at(i),
          y = Y(v * progress);
        if (a.kind === 'scatter') {
          ctx.moveTo(x + 3, y);
          ctx.arc(x, y, 3, 0, Math.PI * 2);
        } else if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (a.kind === 'area') {
        ctx.lineTo(at(n - 1), H - pad);
        ctx.lineTo(pad, H - pad);
        ctx.closePath();
        ctx.fill();
      } else if (a.kind === 'scatter') ctx.fill();
      else ctx.stroke();
    }
    if (a.showValues)
      val.forEach((/** @type {number} */ v, /** @type {number} */ i) =>
        ctx.fillText(
          format(v * progress),
          at(i),
          Math.max(8, Y(v * progress) - 10),
        ),
      );
  });
  function seriesCount() {
    return Math.max(1, series.length);
  }
  if (a.labels) {
    ctx.fillStyle = String(style.color ?? '#FFFFFF').slice(0, 7);
    String(a.labels)
      .split(',')
      .forEach((label, i, all) =>
        ctx.fillText(
          label,
          pad +
            iw *
              (a.kind === 'column'
                ? (i + 0.5) / all.length
                : i / Math.max(1, all.length - 1)),
          H - 8,
        ),
      );
  }
  return rgbaSurface(ctx.getImageData(0, 0, w, h).data, w, h);
}
