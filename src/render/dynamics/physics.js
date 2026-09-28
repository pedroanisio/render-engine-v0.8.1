/** Fixed-step Box2D simulation. Read-only pose checkpoints make seek order irrelevant. */
import * as pl from "planck";
import { createHash } from "node:crypto";
import { pathTriangles, alphaHull } from "./collision.js";
import {
  IDENTITY,
  transform,
  multiply,
  inverse,
  point,
  length,
} from "../geometry/matrix.js";
import { decompose } from "./constraints.js";
import { field } from "./fields.js";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
/** @typedef {{x:number,y:number,rotation:number}} Pose */
/** @typedef {{node:Node,body:pl.Body,a:Record<string,any>,initial:Pose}} Entry */
export class Physics {
  /** @param {Node} scene @param {(n:Node,t:number)=>Record<string,any>} attrs @param {(n:Node)=>{width:number,height:number}} dimensions @param {(src:string)=>Uint8Array} read @param {((n:Node)=>import("../surface.js").Surface)|undefined} [image] */
  constructor(scene, attrs, dimensions, read, image) {
    this.image = image;
    /** @type {Map<string,Node>} */ this.ids = new Map();
    /** @type {Map<Node,Node>} */ this.parents = new Map();
    /** @type {Map<Node,import('../geometry/matrix.js').Matrix>} */ this.bindLinear =
      new Map();
    const index = (
      /** @type {Node} */ n,
      /** @type {Node|undefined} */ parent,
    ) => {
      if (n.attributes.id) this.ids.set(String(n.attributes.id), n);
      if (parent) this.parents.set(n, parent);
      for (const c of n.children) index(c, n);
    };
    index(scene, undefined);
    this.scene = scene;
    this.attrs = attrs;
    this.dimensions = dimensions;
    this.node = scene.children.find((n) => n.name === "physics");
    this.a = this.node?.attributes ?? {};
    this.dt = Number(this.a.fixedStep ?? 1 / 120);
    this.start = Number(this.a.start ?? 0);
    this.ppm = Number(this.a.pixelsPerMeter ?? 100);
    if (
      this.dt < 1 / 2000 ||
      this.dt > 1 ||
      Number(this.a.solverIterations ?? 8) > 100
    )
      throw new Error("physics step/solver budget exceeded");
    /** @type {Entry[]} */ this.entries = [];
    /** @type {Map<Node,Map<number,Pose>>} */ this.poses = new Map();
    /** @type {{joint:pl.Joint,limit:number,id:string}[]} */ this.joints = [];
    this.broken = new Set();
    this.tick = 0;
    /** @type {Map<Node,{rows:number,cols:number,entries:Entry[],pressure:number,boundary:number[]}>} */ this.soft =
      new Map();
    this.world = new pl.World({
      gravity: pl.Vec2(
        Number(this.a.gravityX ?? 0),
        -Number(this.a.gravityY ?? -9.80665),
      ),
      allowSleep: false,
      warmStarting: false,
    });
    this.substeps = 1;
    this.ground = this.world.createBody();
    /** @type {Map<string,Entry>} */ const byId = new Map();
    const walk = (/** @type {Node} */ n) => {
      const body = n.children.find((c) => c.name === "rigidBody");
      if (n.children.some((c) => c.name === "softBody")) this.createSoft(n);
      if (body) {
        const entry = this.create(n, body);
        this.entries.push(entry);
        byId.set(String(n.attributes.id), entry);
        this.poses.set(n, new Map([[0, entry.initial]]));
      }
      for (const c of n.children) walk(c);
    };
    walk(scene);
    const groups = (/** @type {string} */ s, /** @type {number} */ g) =>
      s === "all" || s.split(/[ ,]+/).includes(String(g));
    this.world.on("pre-solve", (contact) => {
      const a = /** @type {Record<string,any>} */ (
          contact.getFixtureA().getUserData()
        ),
        b = /** @type {Record<string,any>} */ (
          contact.getFixtureB().getUserData()
        );
      if (a && b && a.softId && a.softId === b.softId && !a.selfCollision) {
        contact.setEnabled(false);
        return;
      }
      if (
        a &&
        b &&
        !(
          groups(
            String(a.collidesWith ?? "all"),
            Number(b.collisionGroup ?? 0),
          ) &&
          groups(String(b.collidesWith ?? "all"), Number(a.collisionGroup ?? 0))
        )
      )
        contact.setEnabled(false);
    });
    for (const c of this.node?.children ?? [])
      if (c.name === "constraint") this.joint(c, byId);
    if (["frame", "floor"].includes(String(this.a.bounds))) {
      const p =
          scene.children.find((n) => n.name === "project")?.attributes ?? {},
        w = Number(p.width) / this.ppm,
        h = Number(p.height) / this.ppm;
      for (const [a, b] of [
        [
          [0, 0],
          [w, 0],
        ],
        [
          [w, 0],
          [w, h],
        ],
        [
          [w, h],
          [0, h],
        ],
        [
          [0, h],
          [0, 0],
        ],
      ].filter((_, i) => this.a.bounds !== "floor" || i === 2))
        this.ground.createFixture(
          new pl.Edge(
            pl.Vec2(Number(a?.[0]), Number(a?.[1])),
            pl.Vec2(Number(b?.[0]), Number(b?.[1])),
          ),
          { friction: 0.5 },
        );
    }
    this.hash = createHash("sha256")
      .update(
        JSON.stringify(scene, (k, v) =>
          ["cache", "cacheSha256", "loc"].includes(k)
            ? undefined
            : k === "specifiedAttributes" && Array.isArray(v)
              ? v.filter((x) => !["cache", "cacheSha256"].includes(x))
              : typeof v === "bigint"
                ? String(v)
                : v,
        ),
      )
      .update(
        JSON.stringify(
          this.entries.map((e) => {
            const shapes = [];
            for (let f = e.body.getFixtureList(); f; f = f.getNext())
              shapes.push(f.getShape());
            return { initial: e.initial, shapes };
          }),
        ),
      )
      .update(
        [...this.ids.values()]
          .filter((n) => n.name === "trackData")
          .map((n) =>
            createHash("sha256")
              .update(read(String(n.attributes.src)))
              .digest("hex"),
          )
          .join(""),
      )
      .update("planck-1.4.2-physics-4")
      .digest("hex");
    if (this.a.cache) {
      const bytes = read(String(this.a.cache));
      if (
        this.a.cacheSha256 &&
        createHash("sha256").update(bytes).digest("hex") !== this.a.cacheSha256
      )
        throw new Error("physics cache SHA-256 mismatch");
      const data = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (data.hash !== this.hash || data.dt !== this.dt)
        throw new Error("stale physics cache");
      for (const e of this.entries) {
        const poses = data.poses[String(e.node.attributes.id)];
        if (
          !Array.isArray(poses) ||
          poses.some(
            (p) =>
              !Array.isArray(p) || p.length !== 4 || !p.every(Number.isFinite),
          )
        )
          throw new Error("invalid physics cache poses");
        this.poses.set(
          e.node,
          new Map(
            poses.map((p) => [p[0], { x: p[1], y: p[2], rotation: p[3] }]),
          ),
        );
      }
    }
  }
  /** @param {Node} node @param {number} time @returns {import('../geometry/matrix.js').Matrix} */
  parentMatrix(node, time) {
    const a = this.attrs(node, time),
      parent = this.ids.get(String(a.parent)) ?? this.parents.get(node);
    return parent && !["scene", "composition"].includes(parent.name)
      ? this.worldMatrix(parent, time)
      : IDENTITY;
  }
  /** @param {Node} node @param {number} time @returns {import('../geometry/matrix.js').Matrix} */
  worldMatrix(node, time) {
    const a = this.attrs(node, time),
      size = this.dimensions(node),
      project =
        this.scene.children.find((n) => n.name === "project")?.attributes ?? {};
    return multiply(
      this.parentMatrix(node, time),
      transform(
        a,
        size.width,
        size.height,
        Number(project.width ?? 1),
        Number(project.height ?? 1),
      ),
    );
  }
  /** Convert solved world-space geometry back to authored parent/anchor coordinates. @param {Node} node @param {number} time */
  renderPose(node, time) {
    const pose = this.pose(node, time),
      linear = this.bindLinear.get(node);
    if (!pose || !linear) return undefined;
    const parent = inverse(this.parentMatrix(node, time));
    if (!parent) throw new Error("singular physics parent");
    const angle = (pose.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      world = multiply([c, s, -s, c, pose.x, pose.y], linear),
      local = multiply(parent, world),
      a = this.attrs(node, time),
      size = this.dimensions(node);
    const ax = length(a.anchorX ?? 0, size.width, size.width, size.height),
      ay = length(a.anchorY ?? 0, size.height, size.width, size.height),
      result = decompose(local);
    return {
      ...result,
      x: local[4] - ax + local[0] * ax + local[2] * ay,
      y: local[5] - ay + local[1] * ax + local[3] * ay,
      skewX:
        (Math.atan2(
          local[0] * local[2] + local[1] * local[3],
          local[0] * local[3] - local[1] * local[2],
        ) *
          180) /
        Math.PI,
      skewY: 0,
    };
  }
  /** @param {Node} node */
  createSoft(node) {
    const definition = /** @type {Node} */ (
        node.children.find((c) => c.name === "softBody")
      ),
      a = this.attrs(definition, this.start),
      n = this.attrs(node, this.start),
      size = this.dimensions(node),
      rows = a.kind === "rope" ? 1 : Number(a.rows ?? 4),
      cols = Number(a.cols ?? 4);
    this.substeps = Math.max(
      this.substeps,
      Math.ceil(
        (this.dt *
          Math.sqrt(
            (Number(a.stiffness ?? 20) * rows * cols) / Number(a.mass ?? 1),
          )) /
          2,
      ),
    );
    if (this.substeps > 4096)
      throw new Error("soft body requires more than 4096 substeps");
    if (rows * cols > 4096) throw new Error("soft body grid budget exceeded");
    /** @type {Entry[]} */ const entries = [];
    const mass = Number(a.mass ?? 1) / (rows * cols),
      world = this.worldMatrix(node, this.start);
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const dx = cols > 1 ? (col / (cols - 1)) * size.width : 0,
          dy = rows > 1 ? (row / (rows - 1)) * size.height : 0,
          { x, y } = point(world, dx, dy);
        const pinned =
          (a.pin === "top" && row === 0) ||
          (a.pin === "bottom" && row === rows - 1) ||
          (a.pin === "left" && col === 0) ||
          (a.pin === "right" && col === cols - 1) ||
          (a.pin === "corners" &&
            (row === 0 || row === rows - 1) &&
            (col === 0 || col === cols - 1));
        const body = this.world.createBody({
          type: pinned ? "static" : "dynamic",
          position: pl.Vec2(x / this.ppm, y / this.ppm),
          linearDamping: Number(a.damping ?? 0.1),
          fixedRotation: true,
        });
        const radius =
          (Math.min(
            size.width / Math.max(1, cols - 1),
            size.height / Math.max(1, rows - 1),
          ) *
            0.1) /
          this.ppm;
        const props = {
          type: pinned ? "static" : "dynamic",
          softId: String(n.id),
          selfCollision: a.selfCollision,
          ...(pinned ? { pinTarget: String(n.id), pinX: dx, pinY: dy } : {}),
          collisionGroup: 0,
          collidesWith: "all",
        };
        body.createFixture(new pl.Circle(Math.max(radius, 0.001)), {
          density: 1,
          userData: props,
          friction: 0.5,
        });
        if (!pinned) body.setMassData({ mass, center: pl.Vec2(), I: 0 });
        const virtual = {
            ...node,
            attributes: { id: String(n.id) + "_point_" + row + "_" + col },
            children: [],
          },
          entry = {
            node: virtual,
            body,
            a: props,
            initial: { x, y, rotation: 0 },
          };
        entries.push(entry);
        this.entries.push(entry);
        this.poses.set(virtual, new Map([[0, entry.initial]]));
      }
    const connect = (
      /** @type {number} */ i,
      /** @type {number} */ j,
      /** @type {number} */ factor = 1,
    ) => {
      const a = /** @type {Entry} */ (entries[i]),
        b = /** @type {Entry} */ (entries[j]);
      this.world.createJoint(
        new pl.DistanceJoint(
          {
            frequencyHz:
              Math.sqrt(
                (Number(definition.attributes.stiffness ?? 20) * factor) / mass,
              ) /
              (2 * Math.PI),
            dampingRatio: Number(definition.attributes.damping ?? 0.1),
          },
          a.body,
          b.body,
          a.body.getPosition(),
          b.body.getPosition(),
        ),
      );
    };
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        if (col + 1 < cols) connect(i, i + 1);
        if (row + 1 < rows) connect(i, i + cols);
        if (row + 1 < rows && col + 1 < cols) {
          connect(i, i + cols + 1, a.kind === "jelly" ? 1 : 0.2);
          connect(i + 1, i + cols, a.kind === "jelly" ? 1 : 0.2);
        }
      }
    const boundary = [];
    for (let c = 0; c < cols; c++) boundary.push(c);
    for (let r = 1; r < rows; r++) boundary.push(r * cols + cols - 1);
    if (rows > 1) {
      for (let c = cols - 2; c >= 0; c--) boundary.push((rows - 1) * cols + c);
      for (let r = rows - 2; r > 0; r--) boundary.push(r * cols);
    }
    this.soft.set(node, {
      rows,
      cols,
      entries,
      pressure: Number(a.pressure ?? 0),
      boundary,
    });
  }
  /** @param {Node} node @param {number} time */
  softGeometry(node, time) {
    const soft = this.soft.get(node);
    if (!soft) return undefined;
    return {
      ...soft,
      points: soft.entries.map((e) => this.pose(e.node, time)),
    };
  }
  /** @param {Node} node @param {Node} definition @returns {Entry} */
  create(node, definition) {
    const a = this.attrs(definition, this.start),
      n = this.attrs(node, this.start),
      size = this.dimensions(node),
      w = size.width / this.ppm,
      h = size.height / this.ppm;
    if (!(w > 0 && h > 0 && Number(a.mass ?? 1) > 0))
      throw new Error("physics mass and dimensions must be positive");
    const world = this.worldMatrix(node, this.start),
      initialTransform = decompose(world);
    const initial = {
      x: initialTransform.x,
      y: initialTransform.y,
      rotation: initialTransform.rotation,
    };
    const angle = (initial.rotation * Math.PI) / 180,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    /** @type {import('../geometry/matrix.js').Matrix} */ const linear =
      multiply(
        [cs, -sn, sn, cs, 0, 0],
        [world[0], world[1], world[2], world[3], 0, 0],
      );
    this.bindLinear.set(node, linear);
    const body = this.world.createBody({
      type: /** @type {pl.BodyType} */ (a.type ?? "dynamic"),
      position: pl.Vec2(initial.x / this.ppm, initial.y / this.ppm),
      angle: (initial.rotation * Math.PI) / 180,
      linearDamping: Number(a.linearDamping ?? 0.01),
      angularDamping: Number(a.angularDamping ?? 0.01),
      linearVelocity: pl.Vec2(
        Number(a.velocityX ?? 0) / this.ppm,
        Number(a.velocityY ?? 0) / this.ppm,
      ),
      angularVelocity: a.fixedRotation
        ? 0
        : (Number(a.angularVelocity ?? 0) * Math.PI) / 180,
      fixedRotation: a.fixedRotation === true,
      bullet: a.bullet === true,
    });
    /** @type {pl.Shape[]} */ let shapes = [];
    const r = Number(a.radius ?? 0) / this.ppm || Math.min(w, h) / 2;
    if (a.shape === "circle")
      shapes = [new pl.Circle(pl.Vec2(w / 2, h / 2), r)];
    else if (a.shape === "box")
      shapes = [new pl.Box(w / 2, h / 2, pl.Vec2(w / 2, h / 2))];
    else if (a.shape === "capsule") {
      if (h >= w) {
        shapes = [
          new pl.Box(r, Math.max(0.001, h / 2 - r), pl.Vec2(w / 2, h / 2)),
          new pl.Circle(pl.Vec2(w / 2, r), r),
          new pl.Circle(pl.Vec2(w / 2, h - r), r),
        ];
      } else
        shapes = [
          new pl.Box(Math.max(0.001, w / 2 - r), r, pl.Vec2(w / 2, h / 2)),
          new pl.Circle(pl.Vec2(r, h / 2), r),
          new pl.Circle(pl.Vec2(w - r, h / 2), r),
        ];
    } else if (a.shape === "polygon" || a.shape === "path") {
      shapes = pathTriangles(String(a.path ?? n.path)).map(
        (points) =>
          new pl.Polygon(
            points.map(([x, y]) => pl.Vec2(x / this.ppm, y / this.ppm)),
          ),
      );
    } else if (a.shape === "convex-hull") {
      if (!this.image)
        throw new Error("convex-hull requires an image provider");
      shapes = alphaHull(this.image(node), size.width, size.height).map(
        (points) =>
          new pl.Polygon(
            points.map(([x, y]) => pl.Vec2(x / this.ppm, y / this.ppm)),
          ),
      );
    } else throw new Error(`unsupported rigidBody shape ${a.shape}`);
    const map = (/** @type {pl.Vec2} */ v) => {
      const p = point(linear, v.x, v.y);
      return pl.Vec2(p.x, p.y);
    };
    shapes = shapes.flatMap(
      /** @returns {pl.Shape[]} */ (shape) => {
        if (shape.getType() === "polygon")
          return [
            new pl.Polygon(
              /** @type {pl.Polygon} */ (shape).m_vertices.map(map),
            ),
          ];
        const circle = /** @type {pl.Circle} */ (shape),
          center = circle.getCenter(),
          radius = circle.getRadius();
        const sx = Math.hypot(linear[0], linear[1]),
          sy = Math.hypot(linear[2], linear[3]);
        if (
          Math.abs(sx - sy) < 1e-8 &&
          Math.abs(linear[0] * linear[2] + linear[1] * linear[3]) < 1e-8
        )
          return [new pl.Circle(map(center), radius * sx)];
        return Array.from(
          { length: 24 },
          (_, i) =>
            new pl.Polygon([
              map(center),
              ...[i, i + 1].map((j) =>
                map(
                  pl.Vec2(
                    center.x + radius * Math.cos((j * Math.PI) / 12),
                    center.y + radius * Math.sin((j * Math.PI) / 12),
                  ),
                ),
              ),
            ]),
        );
      },
    );
    for (const shape of shapes)
      body.createFixture(shape, {
        density: 1,
        friction: Number(a.friction ?? 0.5),
        restitution: Number(a.restitution ?? 0),
        isSensor: a.sensor === true,
        userData: a,
      });
    if (a.type !== "static" && a.type !== "kinematic") {
      const data = { mass: 0, center: pl.Vec2(), I: 0 };
      body.getMassData(data);
      const ratio = Number(a.mass ?? 1) / data.mass;
      body.setMassData({
        mass: Number(a.mass ?? 1),
        center: data.center,
        I: data.I * ratio,
      });
    }
    body.setActive(Number(a.activateAt ?? 0) <= this.start);
    return { node, body, a, initial };
  }
  /** @param {Node} n @param {Map<string,Entry>} entries */
  joint(n, entries) {
    const a = n.attributes,
      first = entries.get(String(a.a)),
      second = entries.get(String(a.b));
    if (!first || (a.b && !second))
      throw new Error("constraint body reference is missing");
    const ba = first.body,
      bb = second?.body ?? this.ground,
      anchor = pl.Vec2(
        Number(a.x ?? first.initial.x) / this.ppm,
        Number(a.y ?? first.initial.y) / this.ppm,
      ),
      length =
        Number(
          a.restLength ??
            Math.hypot(
              ba.getPosition().x - bb.getPosition().x,
              ba.getPosition().y - bb.getPosition().y,
            ) * this.ppm,
        ) / this.ppm;
    const mass = ba.getMass(),
      frequency =
        Math.sqrt(Number(a.stiffness ?? 20) / Math.max(mass, 1e-9)) /
        (2 * Math.PI),
      damping = Math.min(1, Number(a.damping ?? 0.1));
    /** @type {pl.Joint} */ let joint;
    if (a.type === "spring" || a.type === "distance")
      joint = new pl.DistanceJoint(
        {
          length,
          frequencyHz: a.type === "spring" ? frequency : 0,
          dampingRatio: damping,
        },
        ba,
        bb,
        ba.getPosition(),
        bb.getPosition(),
      );
    else if (a.type === "rope")
      joint = new pl.RopeJoint({
        maxLength: length,
        localAnchorA: pl.Vec2(),
        localAnchorB: pl.Vec2(),
        bodyA: ba,
        bodyB: bb,
      });
    else if (a.type === "pin" || a.type === "hinge")
      joint = new pl.RevoluteJoint(
        {
          enableLimit: a.minAngle !== undefined || a.maxAngle !== undefined,
          lowerAngle: (Number(a.minAngle ?? -360) * Math.PI) / 180,
          upperAngle: (Number(a.maxAngle ?? 360) * Math.PI) / 180,
          enableMotor: Number(a.motorSpeed ?? 0) !== 0,
          motorSpeed: (Number(a.motorSpeed ?? 0) * Math.PI) / 180,
          maxMotorTorque: Number(a.maxForce ?? 1000),
        },
        ba,
        bb,
        anchor,
      );
    else if (a.type === "slider")
      joint = new pl.PrismaticJoint(
        {
          enableLimit: a.minAngle !== undefined || a.maxAngle !== undefined,
          lowerTranslation: Number(a.minAngle ?? 0) / this.ppm,
          upperTranslation: Number(a.maxAngle ?? 0) / this.ppm,
          enableMotor: Number(a.motorSpeed ?? 0) !== 0,
          motorSpeed: Number(a.motorSpeed ?? 0) / this.ppm,
          maxMotorForce: Number(a.maxForce ?? 1000),
        },
        ba,
        bb,
        anchor,
        pl.Vec2(
          Math.cos((Number(a.axisAngle ?? 0) * Math.PI) / 180),
          Math.sin((Number(a.axisAngle ?? 0) * Math.PI) / 180),
        ),
      );
    else if (a.type === "weld")
      joint = new pl.WeldJoint(
        {
          frequencyHz: a.stiffness === undefined ? 0 : frequency,
          dampingRatio: damping,
        },
        ba,
        bb,
        anchor,
      );
    else if (a.type === "motor")
      joint = new pl.RevoluteJoint(
        {
          enableMotor: true,
          motorSpeed: (Number(a.motorSpeed ?? 0) * Math.PI) / 180,
          maxMotorTorque: Number(a.maxForce ?? 1000),
        },
        ba,
        bb,
        anchor,
      );
    else throw new Error(`unknown physics constraint ${a.type}`);
    this.world.createJoint(joint);
    this.joints.push({
      joint,
      limit: Number(a.breakForce ?? Infinity),
      id: String(a.id),
    });
  }
  /** @param {number} tick */ advance(tick) {
    if (tick * this.entries.length > 2000000)
      throw new Error("physics checkpoint budget exceeded");
    while (this.tick < tick) {
      const time = this.start + this.tick * this.dt;
      for (const e of this.entries) {
        if (e.a.pinTarget) {
          const node = this.ids.get(String(e.a.pinTarget));
          if (node) {
            const p = point(
              this.worldMatrix(node, time + this.dt),
              Number(e.a.pinX),
              Number(e.a.pinY),
            );
            e.body.setTransform(pl.Vec2(p.x / this.ppm, p.y / this.ppm), 0);
          }
        }
        if (time >= Number(e.a.activateAt ?? 0)) e.body.setActive(true);
        if (e.a.type === "kinematic") {
          const a = decompose(this.worldMatrix(e.node, time + this.dt)),
            p = e.body.getPosition();
          e.body.setLinearVelocity(
            pl.Vec2(
              (Number(a.x ?? 0) / this.ppm - p.x) / this.dt,
              (Number(a.y ?? 0) / this.ppm - p.y) / this.dt,
            ),
          );
          e.body.setAngularVelocity(
            ((Number(a.rotation ?? 0) * Math.PI) / 180 - e.body.getAngle()) /
              this.dt,
          );
        }
        const p = e.body.getWorldCenter(),
          v = e.body.getLinearVelocity();
        for (const n of this.node?.children ?? [])
          if (n.name === "forceField") {
            const a = this.attrs(n, time);
            if (a.affects === "particles") continue;
            const f = field(
              a,
              p.x * this.ppm,
              p.y * this.ppm,
              v.x * this.ppm,
              v.y * this.ppm,
              time,
            );
            e.body.applyForceToCenter(
              pl.Vec2(
                (f[0] * e.body.getMass()) / this.ppm,
                (f[1] * e.body.getMass()) / this.ppm,
              ),
            );
          }
      }
      for (const soft of this.soft.values())
        if (soft.pressure && soft.rows > 1)
          for (let i = 0; i < soft.boundary.length; i++) {
            const ea = soft.entries[Number(soft.boundary[i])],
              eb =
                soft.entries[
                  Number(soft.boundary[(i + 1) % soft.boundary.length])
                ];
            if (!ea || !eb) continue;
            const a = ea.body.getPosition(),
              b = eb.body.getPosition(),
              f = pl.Vec2(
                ((b.y - a.y) * soft.pressure) / 2,
                (-(b.x - a.x) * soft.pressure) / 2,
              );
            ea.body.applyForceToCenter(f);
            eb.body.applyForceToCenter(f);
          }
      this.world.setAutoClearForces(false);
      for (let i = 0; i < this.substeps; i++)
        this.world.step(
          this.dt / this.substeps,
          Number(this.a.solverIterations ?? 8),
          Number(this.a.solverIterations ?? 8),
        );
      this.world.clearForces();
      this.tick++;
      for (const j of this.joints)
        if (!this.broken.has(j.id)) {
          const f = j.joint.getReactionForce(1 / this.dt);
          if (Math.hypot(f.x, f.y) > j.limit) {
            this.world.destroyJoint(j.joint);
            this.broken.add(j.id);
          }
        }
      for (const e of this.entries) {
        const p = e.body.getPosition();
        this.poses.get(e.node)?.set(this.tick, {
          x: p.x * this.ppm,
          y: p.y * this.ppm,
          rotation: (e.body.getAngle() * 180) / Math.PI,
        });
      }
    }
  }
  /** @param {Node} node @param {number} time */ pose(node, time) {
    if (!this.poses.has(node)) return undefined;
    const step = Math.max(0, (time - this.start) / this.dt),
      lo = Math.floor(step + 1e-9),
      hi = Math.ceil(step - 1e-9);
    if (!this.poses.get(node)?.has(hi)) this.advance(hi);
    const a = this.poses.get(node)?.get(lo),
      b = this.poses.get(node)?.get(hi);
    if (!a || !b) throw new Error("physics cache is incomplete");
    const q = step - lo;
    return {
      x: a.x + (b.x - a.x) * q,
      y: a.y + (b.y - a.y) * q,
      rotation: a.rotation + (b.rotation - a.rotation) * q,
    };
  }
  /** Historical fixture contours in scene pixels; independent of solver seek order. */
  particleColliders() {
    /** @type {import('./particle-collision.js').Collider[]} */ const result =
      [];
    for (const entry of this.entries) {
      if (entry.a.sensor === true) continue;
      for (let f = entry.body.getFixtureList(); f; f = f.getNext()) {
        const shape = f.getShape(),
          pose = (/** @type {number} */ t) =>
            /** @type {Pose} */ (this.pose(entry.node, t));
        if (shape.getType() === "circle") {
          const circle = /** @type {pl.Circle} */ (shape),
            center = circle.getCenter();
          result.push({
            center: { x: center.x * this.ppm, y: center.y * this.ppm },
            radius: circle.getRadius() * this.ppm,
            activateAt: Number(entry.a.activateAt ?? 0),
            pose,
          });
        } else if (shape.getType() === "polygon")
          result.push({
            vertices: /** @type {pl.Polygon} */ (shape).m_vertices.map((p) => ({
              x: p.x * this.ppm,
              y: p.y * this.ppm,
            })),
            activateAt: Number(entry.a.activateAt ?? 0),
            pose,
          });
      }
    }
    return result;
  }
  export() {
    return {
      hash: this.hash,
      dt: this.dt,
      poses: Object.fromEntries(
        this.entries.map((e) => [
          String(e.node.attributes.id),
          [...(this.poses.get(e.node) ?? [])].map(([tick, p]) => [
            tick,
            p.x,
            p.y,
            p.rotation,
          ]),
        ]),
      ),
    };
  }
}
