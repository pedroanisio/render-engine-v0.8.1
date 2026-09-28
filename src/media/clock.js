import { instanceTime, fpsOf } from "../eval/clock.js";
import { compileAnimations } from "../eval/track.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {Record<string,any>} a @param {number} local @param {number} duration @param {import('../eval/track.js').Track} [remap] */
export function mediaTime(a, local, duration, remap) {
  if (a.transitionHandle && !remap && a.freezeAt === undefined && !a.loop) {
    const speed = Number(a.speed ?? 1) / Number(a.timeStretch ?? 1),
      reverse = a.reverse === true || speed < 0;
    return Math.max(
      0,
      Math.min(
        duration - 1e-9,
        (reverse ? Number(a.clipOut ?? duration) : Number(a.clipIn ?? 0)) +
          (reverse ? -1 : 1) * local * Math.abs(speed),
      ),
    );
  }
  const time = remap
    ? Number(remap.valueAt(local))
    : a.freezeAt !== undefined
      ? Number(a.freezeAt)
      : instanceTime(
          {
            ...a,
            start: 0,
            speed: Number(a.speed ?? 1) / Number(a.timeStretch ?? 1),
          },
          local,
          duration,
        );
  return Math.max(0, Math.min(duration - 1e-9, time));
}
/** @param {Node} scene @param {Node} layer */
export function mediaRemap(scene, layer) {
  const source = layer.children.find((n) => n.name === "timeRemap");
  if (!source) return undefined;
  const project = scene.children.find((n) => n.name === "project");
  const target = {
    ...layer,
    name: "shape",
    type: "shapeType",
    attributes: { id: "remap", x: 0 },
    children: [
      {
        ...source,
        name: "animate",
        type: "animateType",
        attributes: {
          property: "x",
          defaultInterpolation:
            source.attributes.defaultInterpolation ?? "linear",
          timeBase: "composition",
        },
      },
    ],
  };
  const compiled = compileAnimations({
    ...scene,
    children: [...(project ? [project] : []), target],
  });
  if (compiled.diagnostics.length)
    throw new Error(compiled.diagnostics.map((d) => d.message).join("; "));
  return compiled.tracks.get("remap")?.[0];
}
export { fpsOf };
