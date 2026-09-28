import { createCanvas } from '@napi-rs/canvas';
import { paint } from '../render/geometry/paint.js';
import { encodeSrgb } from '../render/color.js';
/** Canvas paint sampled in the asset's coordinate system, independent of glyph transforms.
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx @param {Parameters<typeof paint>[1]} env @param {number} width @param {number} height @param {number} scale */
export function canvasPaint(ctx, env, width, height, scale) {
  const origin = ctx.getTransform();
  /** @type {Map<string,import('@napi-rs/canvas').CanvasPattern>} */ const patterns =
    new Map();
  return (/** @type {string} */ value) => {
    if (!value.startsWith('url(') && !value.startsWith('var(')) return value;
    let pattern = patterns.get(value);
    if (!pattern) {
      const tile = createCanvas(
          Math.max(1, Math.ceil(width * scale)),
          Math.max(1, Math.ceil(height * scale)),
        ),
        context = tile.getContext('2d'),
        pixels = context.createImageData(tile.width, tile.height),
        sample = paint(value, env, width, height);
      for (let y = 0; y < tile.height; y++)
        for (let x = 0; x < tile.width; x++) {
          const color = sample(x / scale, y / scale),
            at = (y * tile.width + x) * 4;
          for (let c = 0; c < 3; c++)
            pixels.data[at + c] = encodeSrgb(Number(color[c]));
          pixels.data[at + 3] = Math.round(Number(color[3]) * 255);
        }
      context.putImageData(pixels, 0, 0);
      pattern = ctx.createPattern(tile, 'repeat');
      patterns.set(value, pattern);
    }
    pattern.setTransform(
      ctx
        .getTransform()
        .inverse()
        .multiply(origin)
        .scale(1 / scale),
    );
    return pattern;
  };
}
