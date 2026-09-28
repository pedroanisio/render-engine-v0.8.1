import { DotLottie } from '@lottiefiles/dotlottie-web';
import { readFileSync } from 'node:fs';
import { rgbaSurface } from './color.js';
const wasm = new URL(
  './dotlottie-player.wasm',
  import.meta.resolve('@lottiefiles/dotlottie-web'),
);
DotLottie.setWasmUrl(
  'data:application/wasm;base64,' + readFileSync(wasm).toString('base64'),
);
/** @param {Uint8Array} bytes @param {Record<string,any>} a @param {(src:string)=>Uint8Array} read */
export async function loadLottie(bytes, a, read) {
  const width = Number(a.width),
    height = Number(a.height),
    segment = a.segment === undefined ? undefined : String(a.segment);
  const numeric = segment?.split(',').map(Number);
  const player = new DotLottie({
    canvas: { width, height },
    data:
      bytes[0] === 0x50
        ? Uint8Array.from(bytes).buffer
        : new TextDecoder().decode(bytes),
    autoplay: false,
    animationId: a.animation === undefined ? undefined : String(a.animation),
    ...(numeric?.length === 2 && numeric.every(Number.isFinite)
      ? { segment: /** @type {[number,number]} */ (numeric) }
      : segment
        ? { marker: segment }
        : {}),
    renderConfig: {
      autoResize: false,
      freezeOnOffscreen: false,
      devicePixelRatio: 1,
    },
    assetResolver: read,
  });
  await new Promise((resolve, reject) => {
    player.addEventListener('load', resolve);
    player.addEventListener('loadError', (e) =>
      reject(new Error(`invalid Lottie: ${JSON.stringify(e)}`)),
    );
  });
  const bounds = player.segment ?? [0, player.totalFrames - 1],
    fps = player.totalFrames / player.duration,
    duration = (Number(bounds[1]) - Number(bounds[0]) + 1) / fps;
  return {
    duration,
    frame: (
      /** @type {number} */ time,
      /** @type {Record<string,unknown>} */ slots = {},
    ) => {
      player.setSlots(slots);
      player.setFrame(
        Number(bounds[0]) +
          Math.max(
            0,
            Math.min(Number(bounds[1]) - Number(bounds[0]), time * fps),
          ),
      );
      const data = player.buffer;
      if (!data) throw new Error('Lottie produced no pixels');
      return rgbaSurface(data, width, height);
    },
    close: () => player.destroy(),
  };
}
