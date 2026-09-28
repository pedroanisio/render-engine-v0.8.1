/** Transform constraints evaluate a dependency graph at the requested timestamp. */
import { mediaTime, mediaRemap } from "../../media/clock.js";
import { motionPath } from "../../eval/path.js";
import {
  IDENTITY,
  multiply,
  transform,
  inverse,
  point,
  length,
} from "../geometry/matrix.js";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @typedef {import('../geometry/matrix.js').Matrix} Matrix */
/**
 * Decomposes a local-to-parent matrix M = T(x,y)·R·S·T(−anchor) back into
 * authored attributes: x/y are the image of the anchor point (0,0 by default).
 * @param {Matrix} m @param {{x:number,y:number}} [anchor]
 */
export function decompose(m, anchor = { x: 0, y: 0 }) {
  const scaleX = Math.hypot(m[0], m[1]),
    det = m[0] * m[3] - m[1] * m[2];
  return {
    x: m[4] + m[0] * anchor.x + m[2] * anchor.y,
    y: m[5] + m[1] * anchor.x + m[3] * anchor.y,
    rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
    scaleX,
    scaleY: scaleX ? det / scaleX : Math.hypot(m[2], m[3]),
  };
}
/** Local anchor of authored attributes, as `transform(a, 1, 1, 1, 1)` resolves it. @param {Record<string,any>} a */
const anchorOf = (a) => ({
  x: length(a.anchorX ?? 0, 1, 1, 1),
  y: length(a.anchorY ?? 0, 1, 1, 1),
});
export class Constraints {
  /** @param {Node} scene @param {(n:Node,t:number)=>Record<string,any>} attributes @param {import('./tracking.js').Tracking} tracking @param {(n:Node,t:number)=>number} [localTime] */
  constructor(
    scene,
    attributes,
    tracking,
    localTime = (n, t) => t - Number(n.attributes.start ?? 0),
  ) {
    this.scene = scene;
    this.localTime = localTime;
    this.raw = attributes;
    this.tracking = tracking;
    /** @type {Map<string,Node>} */ this.ids = new Map();
    /** @type {Map<Node,Node>} */ this.parents = new Map();
    const walk = (
      /** @type {Node} */ n,
      /** @type {Node|undefined} */ parent,
    ) => {
      if (n.attributes.id) this.ids.set(String(n.attributes.id), n);
      if (parent) this.parents.set(n, parent);
      for (const c of n.children) walk(c, n);
    };
    walk(scene, undefined);
  }
  /** @param {Node} node @param {number} time @param {Set<Node>} [stack] @returns {Record<string,any>} */
  attributes(node, time, stack = new Set()) {
    if (stack.has(node)) throw new Error("transform constraint cycle");
    stack = new Set(stack).add(node);
    const a = { ...this.raw(node, time) };
    if (node.name === "bone") {
      const skeleton = this.parents.get(node);
      for (const c of skeleton?.children ?? [])
        if (c.name === "transformConstraint" && c.attributes.type === "ik") {
          const ca = this.raw(c, time),
            tip = this.ids.get(String(ca.point)),
            root = tip
              ? this.ids.get(String(tip.attributes.parent))
              : undefined,
            target = this.ids.get(String(ca.target));
          if (!tip || !root || !target)
            throw new Error(
              "IK requires point=tip bone, parent bone and target",
            );
          if (node !== tip && node !== root) continue;
          const first = this.raw(root, time),
            second = this.raw(tip, time),
            parent = this.ids.get(String(first.parent)),
            base = parent ? this.world(parent, time, stack) : IDENTITY,
            origin = point(base, Number(first.x ?? 0), Number(first.y ?? 0)),
            goal = decompose(
              this.world(target, time, stack),
              anchorOf(this.raw(target, time)),
            ),
            dx = Number(goal.x) - origin.x + Number(ca.offsetX ?? 0),
            dy = Number(goal.y) - origin.y + Number(ca.offsetY ?? 0),
            l1 = Number(first.length),
            l2 = Number(second.length),
            distance = Math.max(1e-9, Math.min(l1 + l2, Math.hypot(dx, dy))),
            sign = ca.bendPositive === false ? -1 : 1;
          if (!(l1 > 0 && l2 > 0))
            throw new Error("IK bone lengths must be positive");
          const clamp = (/** @type {number} */ x) =>
              Math.max(-1, Math.min(1, x)),
            elbow =
              sign *
              Math.acos(
                clamp(
                  (distance * distance - l1 * l1 - l2 * l2) / (2 * l1 * l2),
                ),
              ),
            shoulder =
              Math.atan2(dy, dx) -
              Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow)),
            wanted =
              node === root
                ? (shoulder * 180) / Math.PI - decompose(base).rotation
                : (elbow * 180) / Math.PI;
          a.rotation =
            Number(a.rotation ?? 0) +
            (wanted - Number(a.rotation ?? 0)) * Number(ca.influence ?? 1);
        }
    }
    const constraints = node.children.filter(
      (c) => c.name === "transformConstraint",
    );
    for (const c of constraints) {
      const ca = this.raw(c, time);
      if (ca.type === "ik" && node.name === "skeleton") continue;
      if (
        ["object3D", "camera", "light"].includes(node.name) &&
        ca.type !== "track"
      )
        continue;
      const target = this.ids.get(String(ca.target)),
        q = Number(ca.influence ?? 1);
      let desired = { ...a };
      const local = ca.space === "local";
      const parent = this.ids.get(String(a.parent)) ?? this.parents.get(node),
        parentWorld =
          parent && parent.name !== "composition"
            ? this.world(parent, time, stack)
            : IDENTITY,
        inv = inverse(parentWorld);
      if (!inv) throw new Error("singular constraint parent");
      const ownWorld = multiply(parentWorld, transform(a, 1, 1, 1, 1)),
        own = decompose(ownWorld, anchorOf(a));
      // the target's matrix in its own parent space (local) or world space
      const targetMatrix = target
          ? local
            ? transform(this.attributes(target, time, stack), 1, 1, 1, 1)
            : this.world(target, time, stack)
          : undefined,
        t = target
          ? local
            ? this.attributes(target, time, stack)
            : decompose(
                /** @type {Matrix} */ (targetMatrix),
                anchorOf(this.raw(target, time)),
              )
          : undefined;
      if (ca.type === "track") {
        const value = this.tracking.sample(
          String(ca.target),
          time,
          ca.point ? String(ca.point) : undefined,
        );
        desired = { ...a, ...value };
        delete desired.time;
        delete desired.points;
      } else if (ca.type === "follow-path") {
        const path = motionPath(String(ca.path)),
          distance = path.getTotalLength() * Number(ca.progress ?? 0),
          p = path.getPointAtLength(distance);
        desired.x = p.x;
        desired.y = p.y;
        if (ca.autoOrient) {
          const tangent = path.getTangentAtLength(distance);
          desired.rotation = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
        }
      } else if (!t) throw new Error("constraint target is required");
      else if (ca.type === "look-at") {
        const origin = local ? a : own;
        desired.rotation =
          (Math.atan2(
            Number(t.y) - Number(origin.y ?? 0),
            Number(t.x) - Number(origin.x ?? 0),
          ) *
            180) /
            Math.PI -
          (local ? 0 : decompose(parentWorld).rotation);
      } else if (ca.type === "distance") {
        const origin = local ? a : own,
          dx = Number(origin.x ?? 0) - Number(t.x ?? 0),
          dy = Number(origin.y ?? 0) - Number(t.y ?? 0),
          distance = Math.hypot(dx, dy),
          clamped = Math.min(
            Number(ca.maxDistance ?? Infinity),
            Math.max(Number(ca.minDistance ?? 0), distance),
          );
        const p = {
            x: Number(t.x ?? 0) + (distance ? dx / distance : 1) * clamped,
            y: Number(t.y ?? 0) + (distance ? dy / distance : 0) * clamped,
          },
          dst = local ? p : point(inv, p.x, p.y);
        desired.x = dst.x;
        desired.y = dst.y;
      } else if (ca.type === "parent") {
        const m = multiply(
          /** @type {Matrix} */ (targetMatrix),
          transform(a, 1, 1, 1, 1),
        );
        desired = {
          ...a,
          ...decompose(local ? m : multiply(inv, m), anchorOf(a)),
        };
      } else if (
        [
          "copy-position",
          "copy-rotation",
          "copy-scale",
          "copy-transform",
        ].includes(String(ca.type))
      ) {
        const tr = /** @type {Record<string,any>} */ (
          local
            ? t
            : decompose(
                multiply(inv, /** @type {Matrix} */ (targetMatrix)),
                anchorOf(this.raw(/** @type {Node} */ (target), time)),
              )
        );
        for (const key of ca.type === "copy-position"
          ? ["x", "y"]
          : ca.type === "copy-rotation"
            ? ["rotation"]
            : ca.type === "copy-scale"
              ? ["scaleX", "scaleY"]
              : ["x", "y", "rotation", "scaleX", "scaleY"])
          desired[key] = tr[key];
      } else
        throw new Error(`constraint ${ca.type} requires a skeleton IK chain`);
      for (const [key, offset] of [
        ["x", "offsetX"],
        ["y", "offsetY"],
        ["rotation", "offsetRotation"],
      ])
        desired[String(key)] =
          Number(desired[String(key)] ?? 0) + Number(ca[String(offset)] ?? 0);
      for (const key of [
        "x",
        "y",
        "z",
        "zDepth",
        "rotation",
        "rotationX",
        "rotationY",
        "yaw",
        "pitch",
        "roll",
        "fov",
        "focalLength",
        "scaleX",
        "scaleY",
        "scaleZ",
      ])
        if (desired[key] !== undefined)
          a[key] =
            Number(a[key] ?? (key.startsWith("scale") ? 1 : 0)) +
            (Number(desired[key]) -
              Number(a[key] ?? (key.startsWith("scale") ? 1 : 0))) *
              q;
    }
    if (node.name === "layer" && a.stabilize) {
      const footage = this.ids.get(String(a.asset));
      const project = this.scene.children.find((n) => n.name === "project");
      const sourceTime = mediaTime(
        a,
        this.localTime(node, time),
        Number(
          footage?.attributes.duration ?? project?.attributes.duration ?? 1,
        ),
        mediaRemap(this.scene, node),
      );
      const correction = this.tracking.stabilize(
        String(a.asset),
        sourceTime,
        Number(a.stabilizeSmoothness ?? 0.5),
      );
      for (const key of ["x", "y", "rotation"])
        a[key] = Number(a[key] ?? 0) + Number(correction[key]);
      for (const key of ["scaleX", "scaleY"])
        a[key] = Number(a[key] ?? 1) * Number(correction[key]);
    }
    return a;
  }
  /** @param {Node} node @param {number} time @param {Set<Node>} [stack] @returns {Matrix} */
  world(node, time, stack = new Set()) {
    const a = this.attributes(node, time, stack),
      parent = this.ids.get(String(a.parent)) ?? this.parents.get(node),
      local = transform(a, 1, 1, 1, 1);
    if (!parent || parent.name === "composition" || parent.name === "scene")
      return local;
    return multiply(this.world(parent, time, new Set(stack).add(node)), local);
  }
}
