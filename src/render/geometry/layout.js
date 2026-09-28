import { length } from './matrix.js';
/** @typedef {{x:number,y:number,width:number,height:number}} Box */
/** @param {string} mode @param {number} free @param {number} count @param {number} gap */
function distribution(mode, free, count, gap) {
  if (mode === 'center') return [free / 2, gap];
  if (mode === 'end') return [free, gap];
  if (mode === 'space-between' && count > 1) return [0, gap + free / (count - 1)];
  if (mode === 'space-around' && count) return [free / count / 2, gap + free / count];
  if (mode === 'space-evenly') return [free / (count + 1), gap + free / (count + 1)];
  return [0, gap];
}
/** @param {Record<string,any>} parent @param {Array<Record<string,any>>} children @param {number} width @param {number} height @param {number} vw @param {number} vh */
export function layout(parent, children, width, height, vw, vh) {
  const padding = length(parent.padding ?? 0, width, vw, vh),
    gap = length(parent.gap ?? 0, width, vw, vh),
    kind = parent.layout ?? 'none',
    column = kind === 'column',
    columns = Math.max(1, Number(parent.gridColumns ?? 2)),
    justify = String(parent.justify ?? 'start'),
    alignment = parent.alignItems ?? 'start';
  const boxes = children.map((a) => ({
    x: length(a.x ?? 0, width, vw, vh),
    y: length(a.y ?? 0, height, vw, vh),
    width: length(a.boxWidth ?? a.width ?? width, width, vw, vh),
    height: length(a.boxHeight ?? a.height ?? height, height, vw, vh),
  }));
  if (kind === 'none') return boxes;
  const contentW = Math.max(0, width - 2 * padding),
    contentH = Math.max(0, height - 2 * padding);
  /** @param {number} available @param {number} size @param {number} baseline @param {number} maxBaseline */
  const cross = (available, size, baseline, maxBaseline) =>
    alignment === 'center'
      ? (available - size) / 2
      : alignment === 'end'
        ? available - size
        : alignment === 'baseline'
          ? maxBaseline - baseline
          : 0;
  if (kind === 'grid') {
    const cellW = Math.max(0, (contentW - (columns - 1) * gap) / columns),
      rows = Math.ceil(boxes.length / columns);
    const heights = Array.from({ length: rows }, (_, r) =>
      Math.max(...boxes.slice(r * columns, (r + 1) * columns).map((b) => b.height)),
    );
    const [offset, spacing] = distribution(
      justify,
      contentH - heights.reduce((s, h) => s + h, 0) - Math.max(0, rows - 1) * gap,
      rows,
      gap,
    );
    let y = padding + Number(offset);
    return boxes.map((b, i) => {
      const row = Math.floor(i / columns),
        rowH = Number(heights[row]),
        rowStart = row * columns,
        maxBaseline = Math.max(
          ...boxes
            .slice(rowStart, rowStart + columns)
            .map((c, j) => Number(children[rowStart + j]?.baseline ?? c.height)),
        ),
        baseline = Number(children[i]?.baseline ?? b.height);
      const result = {
        x: b.x + padding + (i % columns) * (cellW + gap) + cross(cellW, b.width, 0, 0),
        y: b.y + y + cross(rowH, b.height, baseline, maxBaseline),
        width: alignment === 'stretch' ? cellW : b.width,
        height: alignment === 'stretch' ? rowH : b.height,
      };
      if (i % columns === columns - 1) y += rowH + Number(spacing);
      return result;
    });
  }
  const main = column ? contentH : contentW,
    crossSize = column ? contentW : contentH,
    total = boxes.reduce((s, b) => s + (column ? b.height : b.width), 0),
    [offset, spacing] = distribution(
      justify,
      main - total - gap * Math.max(0, boxes.length - 1),
      boxes.length,
      gap,
    );
  const maxBaseline = Math.max(
    0,
    ...boxes.map((b, i) => Number(children[i]?.baseline ?? b.height)),
  );
  let cursor = padding + Number(offset);
  return boxes.map((b, i) => {
    if (kind === 'stack') {
      const [x] = distribution(justify, contentW - b.width, 1, 0);
      return {
        ...b,
        x: b.x + padding + Number(x),
        y:
          b.y +
          padding +
          cross(contentH, b.height, Number(children[i]?.baseline ?? b.height), maxBaseline),
        height: alignment === 'stretch' ? contentH : b.height,
      };
    }
    const size = column ? b.width : b.height,
      position =
        padding +
        cross(
          crossSize,
          size,
          column ? 0 : Number(children[i]?.baseline ?? b.height),
          column ? 0 : maxBaseline,
        ),
      result = {
        ...b,
        x: b.x + (column ? position : cursor),
        y: b.y + (column ? cursor : position),
        width: column && alignment === 'stretch' ? crossSize : b.width,
        height: !column && alignment === 'stretch' ? crossSize : b.height,
      };
    cursor += (column ? b.height : b.width) + Number(spacing);
    return result;
  });
}
/** @param {Record<string,any>} a @param {Box} box @param {Box} target @param {number} vw @param {number} vh */
export function align(a, box, target, vw, vh) {
  const margin = length(a.margin ?? 0, target.width, vw, vh),
    result = { ...box };
  for (const axis of ['X', 'Y']) {
    const pos = axis === 'X' ? 'x' : 'y',
      size = axis === 'X' ? 'width' : 'height',
      mode = a['align' + axis];
    if (mode === undefined) continue;
    const origin = target[pos],
      available = target[size];
    if (['center', 'middle'].includes(mode))
      result[pos] += origin + (available - box[size]) / 2;
    else if (['right', 'bottom', 'end'].includes(mode))
      result[pos] += origin + available - box[size] - margin;
    else if (mode === 'stretch') {
      result[pos] += origin + margin;
      result[size] = Math.max(0, available - 2 * margin);
    } else result[pos] += origin + margin;
  }
  return result;
}
/** @param {Record<string,any>} a @param {number} w @param {number} h */
export function safeArea(a, w, h) {
  const presets = /** @type {Record<string,number[]>} */ ({
    custom: [0, 0, 0, 0],
    'title-safe': [0.1, 0.1, 0.1, 0.1],
    'action-safe': [0.05, 0.05, 0.05, 0.05],
    'instagram-reels': [0.14, 0.12, 0.2, 0.06],
    'instagram-stories': [0.14, 0.05, 0.2, 0.05],
    'instagram-feed': [0.05, 0.05, 0.05, 0.05],
    'facebook-reels': [0.14, 0.12, 0.2, 0.06],
    tiktok: [0.12, 0.16, 0.22, 0.06],
    'youtube-shorts': [0.1, 0.15, 0.2, 0.05],
    snapchat: [0.12, 0.08, 0.2, 0.08],
    'pinterest-idea': [0.1, 0.08, 0.2, 0.08],
  });
  const p = presets[a.preset ?? 'custom'];
  if (!p) throw new Error('unknown safe area preset');
  const top = Number(a.top ?? p[0]),
    right = Number(a.right ?? p[1]),
    bottom = Number(a.bottom ?? p[2]),
    left = Number(a.left ?? p[3]);
  if (top + bottom >= 1 || left + right >= 1) throw new Error('safe area has no usable region');
  return {
    x: left * w,
    y: top * h,
    width: (1 - left - right) * w,
    height: (1 - top - bottom) * h,
  };
}
