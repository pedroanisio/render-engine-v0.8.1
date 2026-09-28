/**
 * Frame worker: owns a renderer built exactly like the pipeline's and encodes
 * the frames it is asked for. Frames are independent of rendering order, as
 * stills and shards already rely on, so any worker may render any frame.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createRenderer } from "./setup.js";
import { contrastFrame } from "./accessibility.js";
import { gpuDevice, gpuFrame } from "./gpu.js";

const port = parentPort;
if (!port) throw new Error("frame worker requires a parent port");
/** @param {unknown} error */
const message = (error) =>
  error instanceof Error ? error.message : String(error);
try {
  const { renderer, oa, plan, media } = await createRenderer(
    workerData.options,
    workerData.snapshot,
  );
  const floatFrames = plan.codec === "exr-sequence";
  // The GPU tail finishes and encodes frames where it can (--gpu).
  const gpu =
    (workerData.options.gpu ?? "auto") !== "off" && !floatFrames
      ? await gpuDevice()
      : undefined;
  port.on("message", async (m) => {
    if (m.type === "render") {
      try {
        const done = gpu
          ? await gpuFrame(
              renderer,
              gpu,
              m.time,
              oa.alpha === true,
              !!m.contrast,
            )
          : undefined;
        if (done) {
          port.postMessage(
            {
              type: "frame",
              id: m.id,
              bytes: done.bytes.buffer,
              byteOffset: done.bytes.byteOffset,
              length: done.bytes.length,
              unsupported: [...renderer.unsupported],
              warnings: [...renderer.warnings],
              contrast: done.contrast,
            },
            [/** @type {ArrayBuffer} */ (done.bytes.buffer)],
          );
          return;
        }
        // With a contrast check the frame is measured as it renders.
        const measured = m.contrast
            ? contrastFrame(renderer, m.time)
            : undefined,
          frame = measured?.picture ?? renderer.render(m.time);
        const bytes = floatFrames
          ? renderer.color.encodeFloat(frame, oa.alpha === true)
          : renderer.color.encode16(frame, oa.alpha === true);
        port.postMessage(
          {
            type: "frame",
            id: m.id,
            bytes: bytes.buffer,
            byteOffset: bytes.byteOffset,
            length: bytes.length,
            unsupported: [...renderer.unsupported],
            warnings: [...renderer.warnings],
            contrast: measured?.contrast,
          },
          [bytes.buffer],
        );
      } catch (error) {
        port.postMessage({ type: "error", message: message(error) });
      }
    } else if (m.type === "clear") renderer.cache.clear();
    else if (m.type === "close") {
      media.close();
      // An open device keeps this thread alive (and must not be torn down by terminate).
      gpu?.device.destroy();
      port.close();
    }
  });
  port.postMessage({ type: "ready" });
} catch (error) {
  port.postMessage({ type: "error", message: message(error) });
}
