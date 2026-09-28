/** One shared camera/depth pass, with temporal quadrature at output frame rate. */
import { cyclesFrame } from "./native.js";
import { render3D } from "./scene.js";
import { Surface } from "../surface.js";
import { shutter } from "../shutter.js";
/** @param {import('../frame.js').FrameRenderer} host @returns {Surface} */
export function geometryPass(host) {
  const reframe = host.scene.reframe;
  if (reframe) {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(host)),
      host,
    );
    clone.scene = { ...host.scene, reframe: undefined };
    clone.scene.children = host.scene.children.map((n) =>
      n.name === "project"
        ? {
            ...n,
            attributes: {
              ...n.attributes,
              width: reframe.width,
              height: reframe.height,
            },
          }
        : n,
    );
    clone.width = Math.round(reframe.width * host.scale);
    clone.height = Math.round(reframe.height * host.scale);
    const src = geometryPass(clone),
      out = new Surface(host.width, host.height),
      ratio =
        reframe.mode === "crop"
          ? Math.max(out.width / src.width, out.height / src.height)
          : Math.min(out.width / src.width, out.height / src.height),
      ox = (out.width - src.width * ratio) * reframe.focusX,
      oy = (out.height - src.height * ratio) * reframe.focusY;
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        const px = Math.floor((x + 0.5 - ox) / ratio),
          py = Math.floor((y + 0.5 - oy) / ratio);
        if (px >= 0 && py >= 0 && px < src.width && py < src.height)
          out.data.set(
            src.data.subarray(
              (py * src.width + px) * 4,
              (py * src.width + px) * 4 + 4,
            ),
            (y * out.width + x) * 4,
          );
      }
    return out;
  }
  const project =
      host.scene.children.find((n) => n.name === "project")?.attributes ?? {},
    time = host.time;
  /** @type {import('../../xsd/validate.js').ValidNode[]} */ const nodes = [];
  /** @type {Map<import("../../xsd/validate.js").ValidNode,string>} */ const flags =
    new Map();
  const walk = (
    /** @type {import('../../xsd/validate.js').ValidNode} */ n,
    inherited = "inherit",
  ) => {
    nodes.push(n);
    const flag = String(n.attributes.motionBlur ?? "inherit");
    flags.set(n, flag === "inherit" ? inherited : flag);
    for (const c of n.children) walk(c, flags.get(n));
  };
  walk(host.composition);
  const enabled =
    project.motionBlur === true ||
    nodes.some((n) => n.attributes.motionBlur === "on");
  if (!enabled || host.shutterSampling)
    return host.cycles ? cyclesFrame(host) : render3D(host);
  const camera = nodes
      .filter(
        (n) =>
          n.name === "camera" &&
          host.active(n) &&
          host.attributes(n).active !== false,
      )
      .at(-1),
    settings = {
      ...project,
      shutterAngle: camera?.attributes.shutterAngle ?? project.shutterAngle,
    };
  const previous = host.sampleTimes;
  host.sampleTimes = new Map(previous);
  for (const n of nodes)
    if (flags.get(n) === "off") host.sampleTimes.set(n, time);
  host.shutterSampling = true;
  try {
    return shutter(time, host.fps, settings, (t) => {
      host.time = t;
      return host.cycles ? cyclesFrame(host) : render3D(host);
    });
  } finally {
    host.time = time;
    host.shutterSampling = false;
    host.sampleTimes = previous;
  }
}
