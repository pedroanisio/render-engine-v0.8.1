/**
 * Frame worker: owns a renderer built exactly like the pipeline's and encodes
 * the frames it is asked for. Frames are independent of rendering order, as
 * stills and shards already rely on, so any worker may render any frame.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createRenderer } from "./setup.js";

const port = parentPort;
if (!port) throw new Error("frame worker requires a parent port");
/** @param {unknown} error */
const message = (error) =>
  error instanceof Error ? error.message : String(error);
try {
  const { renderer, oa, plan, media } = await createRenderer(
    workerData.options,
  );
  const floatFrames = plan.codec === "exr-sequence";
  port.on("message", (m) => {
    if (m.type === "render") {
      try {
        const frame = renderer.render(m.time);
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
          },
          [bytes.buffer],
        );
      } catch (error) {
        port.postMessage({ type: "error", message: message(error) });
      }
    } else if (m.type === "clear") renderer.cache.clear();
    else if (m.type === "close") {
      media.close();
      port.close();
    }
  });
  port.postMessage({ type: "ready" });
} catch (error) {
  port.postMessage({ type: "error", message: message(error) });
}
