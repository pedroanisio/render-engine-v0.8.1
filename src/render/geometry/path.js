import { Path2D, PathOp, StrokeCap, StrokeJoin, FillType } from '@napi-rs/canvas';
import { motionPath } from '../../eval/path.js';
import { noise } from '../../eval/expression.js';
import { transform, dom } from './matrix.js';
/** @typedef {Record<string,any>} Attributes */
/** @param {Attributes} a @param {number} w @param {number} h */
export function shapePath(a, w, h) {
  let p = new Path2D();
  const kind = a.shape ?? a.type;
  if (kind === 'path') {
    if (!a.path) throw new Error('path shape requires @path');
    motionPath(String(a.path));
    p = new Path2D(String(a.path));
  } else if (kind === 'rect') p.rect(0, 0, w, h);
  else if (kind === 'rounded-rect')
    p.roundRect(0, 0, w, h, a.cornerRadii?.map(Number) ?? Number(a.radius ?? 0));
  else if (kind === 'ellipse') p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
  else if (kind === 'line') {
    p.moveTo(0, 0);
    p.lineTo(w, h);
  } else if (kind === 'polygon' || kind === 'star') {
    const count = Math.max(3, Number(a.points ?? 5)),
      n = kind === 'star' ? count * 2 : count,
      outer = Number(a.outerRadius ?? Math.min(w, h) / 2),
      inner = Number(a.innerRadius ?? outer / 2);
    const pts = Array.from({ length: n }, (_, i) => {
      const r = kind === 'star' && i % 2 ? inner : outer,
        t = (i * 2 * Math.PI) / n - Math.PI / 2;
      return { x: w / 2 + Math.cos(t) * r, y: h / 2 + Math.sin(t) * r };
    });
    for (let i = 0; i < n; i++) {
      const cur = pts[i],
        prev = pts[(i + n - 1) % n],
        next = pts[(i + 1) % n];
      if (!cur || !prev || !next) continue;
      const round =
        Number(kind === 'star' && i % 2 ? (a.innerRoundness ?? 0) : (a.outerRoundness ?? 0)) /
        2;
      const start = {
          x: cur.x + (prev.x - cur.x) * round,
          y: cur.y + (prev.y - cur.y) * round,
        },
        end = {
          x: cur.x + (next.x - cur.x) * round,
          y: cur.y + (next.y - cur.y) * round,
        };
      if (i === 0) p.moveTo(start.x, start.y);
      else p.lineTo(start.x, start.y);
      p.quadraticCurveTo(cur.x, cur.y, end.x, end.y);
    }
    p.closePath();
  } else throw new Error(`unknown shape ${kind}`);
  p.setFillType(a.fillRule === 'evenodd' ? FillType.EvenOdd : FillType.Winding);
  return p;
}
/** @param {Path2D} path @param {Attributes} a */
export function trimPath(path, a) {
  let start = Number(a.trimStart ?? 0),
    end = Number(a.trimEnd ?? 1);
  if (start === 0 && end === 1) return new Path2D(path);
  if (end <= start) return new Path2D();
  const offset = Number(a.trimOffset ?? 0) / 360;
  start = (((start + offset) % 1) + 1) % 1;
  end = (((end + offset) % 1) + 1) % 1;
  const contours =
    a.trimMode === 'individual'
      ? (path.toSVGString().match(/[Mm][^Mm]*/g) ?? [])
      : [path.toSVGString()];
  const out = new Path2D();
  for (const contour of contours) {
    const p = new Path2D(contour);
    if (end > start) out.addPath(p.trim(start, end));
    else {
      out.addPath(new Path2D(p).trim(start, 1));
      out.addPath(new Path2D(p).trim(0, end));
    }
  }
  return out;
}
/** @param {Path2D} path @param {Attributes} a */
export function strokePath(path, a) {
  const width =
    Number(a.strokeWidth ?? 0) * (a.strokePosition === 'center' || !a.strokePosition ? 1 : 2);
  let p = new Path2D(path).stroke({
    width,
    miterLimit: Number(a.miterLimit ?? 4),
    cap:
      a.strokeCap === 'round'
        ? StrokeCap.Round
        : a.strokeCap === 'square'
          ? StrokeCap.Square
          : StrokeCap.Butt,
    join:
      a.strokeJoin === 'round'
        ? StrokeJoin.Round
        : a.strokeJoin === 'bevel'
          ? StrokeJoin.Bevel
          : StrokeJoin.Miter,
  });
  if (a.strokePosition === 'inside') p = p.op(path, PathOp.Intersect);
  if (a.strokePosition === 'outside') p = p.op(path, PathOp.Difference);
  return p;
}
/** @param {Path2D} path @param {Attributes} a @param {number} time @returns {Array<{path:Path2D,opacity:number}>} */
export function modify(path, a, time) {
  const type = a.type;
  if (type === 'repeater') {
    const count = Math.max(0, Number(a.copies ?? 3)),
      items = [];
    for (let i = 0; i < Math.ceil(count); i++) {
      const n = i + Number(a.offset ?? 0),
        m = transform(
          {
            x: n * Number(a.offsetX ?? 0),
            y: n * Number(a.offsetY ?? 0),
            rotation: n * Number(a.rotation ?? 0),
            scaleX: Number(a.scale ?? 1) ** n,
            scaleY: Number(a.scale ?? 1) ** n,
          },
          1,
          1,
          1,
          1,
        );
      items.push({
        path: new Path2D(path).transform(dom(m)),
        opacity:
          (Number(a.startOpacity ?? 1) +
            (Number(a.endOpacity ?? 1) - Number(a.startOpacity ?? 1)) *
              (count <= 1 ? 0 : i / (count - 1))) *
          Math.min(1, count - i),
      });
    }
    return a.composite === 'below' ? items.reverse() : items;
  }
  if (type === 'round-corners')
    return [
      {
        path: new Path2D(path).round(Math.abs(Number(a.size ?? 10))),
        opacity: 1,
      },
    ];
  if (type === 'offset-path') {
    const amount = Number(a.amount ?? 0),
      outline = strokePath(path, {
        strokeWidth: Math.abs(amount) * 2,
        strokeJoin: a.mode ?? 'round',
      });
    return [
      {
        path: new Path2D(path).op(outline, amount >= 0 ? PathOp.Union : PathOp.Difference),
        opacity: 1,
      },
    ];
  }
  if (type === 'trim')
    return [
      {
        path: trimPath(path, {
          trimStart: Number(a.offset ?? 0) / 100,
          trimEnd: Number(a.amount ?? 100) / 100,
        }),
        opacity: 1,
      },
    ];
  if (type === 'merge') {
    const modes = {
      add: PathOp.Union,
      union: PathOp.Union,
      subtract: PathOp.Difference,
      intersect: PathOp.Intersect,
      exclude: PathOp.Xor,
      xor: PathOp.Xor,
    };
    const contours = path.toSVGString().match(/[Mm][^Mm]*/g) ?? [];
    let p = new Path2D(contours[0] ?? '');
    for (const c of contours.slice(1))
      p = p.op(
        new Path2D(c),
        /** @type {Record<string,PathOp>} */ (modes)[a.mode ?? 'add'] ?? PathOp.Union,
      );
    return [{ path: p, opacity: 1 }];
  }
  const out = new Path2D(),
    bounds = path.getBounds(),
    cx = (bounds[0] + bounds[2]) / 2,
    cy = (bounds[1] + bounds[3]) / 2;
  for (const contour of path.toSVGString().match(/[Mm][^Mm]*/g) ?? []) {
    const curve = motionPath(contour),
      total = curve.getTotalLength(),
      steps = Math.max(16, Math.ceil(total / Math.max(0.25, Number(a.detail ?? 10))));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps,
        p = curve.getPointAtLength(total * u),
        t = curve.getTangentAtLength(total * u);
      let x = p.x,
        y = p.y;
      const amount = Number(a.amount ?? 0),
        dx = x - cx,
        dy = y - cy;
      if (type === 'pucker-bloat') {
        const factor = 1 + (amount / 100) * Math.cos(u * 2 * Math.PI * 4);
        x = cx + dx * factor;
        y = cy + dy * factor;
      } else if (type === 'twist') {
        const r =
            (((amount * Math.PI) / 180) * Math.hypot(dx, dy)) /
            Math.max(1, bounds[2] - bounds[0], bounds[3] - bounds[1]),
          c = Math.cos(r),
          s = Math.sin(r);
        x = cx + c * dx - s * dy;
        y = cy + s * dx + c * dy;
      } else if (type === 'zig-zag') {
        const phase = u * Number(a.ridges ?? 5) * 2,
          amp =
            Number(a.size ?? 10) *
            (a.mode === 'smooth'
              ? Math.sin(phase * Math.PI)
              : 1 - 2 * Math.abs((phase % 2) - 1));
        x -= t.y * amp;
        y += t.x * amp;
      } else if (type === 'wiggle-path') {
        const seed = Number(BigInt(String(a.seed ?? 0)) & 0xffffffffn),
          phase = time * Number(a.frequency ?? 2),
          k = Math.floor(phase),
          f = phase - k;
        const n = (/** @type {number} */ axis) =>
          (noise(seed, i, axis, k) * (1 - f) + noise(seed, i, axis, k + 1) * f) * 2 - 1;
        x += n(0) * Number(a.size ?? 10);
        y += n(1) * Number(a.size ?? 10);
      } else throw new Error(`unknown shape modifier ${type}`);
      if (i === 0) out.moveTo(x, y);
      else out.lineTo(x, y);
    }
    if (/[Zz]\s*$/.test(contour)) out.closePath();
  }
  return [{ path: out, opacity: 1 }];
}
/** Trim a list in concatenated arc-length order, preserving per-copy alpha.
 * @param {Array<{path:Path2D,opacity:number}>} paths @param {Attributes} a
 */
export function trimPaths(paths, a) {
  if (paths.length <= 1 || a.trimMode === 'individual')
    return paths.map((p) => ({ ...p, path: trimPath(p.path, a) }));
  const start = Number(a.trimStart ?? 0),
    end = Number(a.trimEnd ?? 1);
  if (start === 0 && end === 1) return paths;
  if (end <= start) return [];
  const lengths = paths.map((p) => motionPath(p.path.toSVGString()).getTotalLength()),
    total = lengths.reduce((s, n) => s + n, 0),
    offset = Number(a.trimOffset ?? 0) / 360,
    lo = (((start + offset) % 1) + 1) % 1,
    hi = (((end + offset) % 1) + 1) % 1;
  const ranges =
    hi > lo
      ? [[lo * total, hi * total]]
      : [
          [lo * total, total],
          [0, hi * total],
        ];
  let cursor = 0;
  return paths.map((p, i) => {
    const size = Number(lengths[i]),
      out = new Path2D();
    for (const range of ranges) {
      const from = Math.max(cursor, Number(range[0])),
        to = Math.min(cursor + size, Number(range[1]));
      if (to > from && size > 0)
        out.addPath(new Path2D(p.path).trim((from - cursor) / size, (to - cursor) / size));
    }
    cursor += size;
    return { ...p, path: out };
  });
}
/** @param {Array<{path:Path2D,opacity:number}>} paths @param {Attributes} a @param {number} time */
export function modifyPaths(paths, a, time) {
  if (a.type === 'trim')
    return trimPaths(paths, {
      trimStart: Number(a.offset ?? 0) / 100,
      trimEnd: Number(a.amount ?? 100) / 100,
    });
  if (a.type === 'merge') {
    const joined = new Path2D();
    for (const p of paths) joined.addPath(p.path);
    return modify(joined, a, time).map((p) => ({
      ...p,
      opacity: Math.max(0, ...paths.map((p) => p.opacity)),
    }));
  }
  return paths.flatMap((p) =>
    modify(p.path, a, time).map((q) => ({ ...q, opacity: q.opacity * p.opacity })),
  );
}
