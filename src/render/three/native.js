/** Cycles CPU bridge. All input bytes are audited by the host asset resolver. */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { warp } from "../fx/pixels.js";
import { noise } from "../fx/spatial.js";
import { Compositor } from "../compositor.js";
import { deformedBounds } from "../dynamics/deform.js";
import { point } from "../geometry/matrix.js";
import { fontBytes } from "../../media/font-container.js";
import { Surface } from "../surface.js";
import { parseColor } from "../color.js";
import { svgPathProperties } from "svg-path-properties";
/** @typedef {import('../../xsd/validate.js').ValidNode} Node */
const executable = () =>
  process.env.SCENE_RENDER_BLENDER_PYTHON ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../.venv-3d/bin/python",
  );
/** @type {Record<string,string>|undefined} */ let version;
export function cyclesInfo() {
  if (!version)
    version = JSON.parse(
      execFileSync(
        executable(),
        [
          "-c",
          'import bpy,json,MaterialX;print(json.dumps({"Blender":bpy.app.version_string,"MaterialX":MaterialX.__version__,"engine":"Cycles CPU"}))',
        ],
        { encoding: "utf8", timeout: 30000 },
      ),
    );
  return version;
}
/** @param {Node} scene */
export function needsCycles(scene) {
  const walk = (/** @type {Node} */ n) =>
    (n.name === "object3D" &&
      (n.attributes.castShadow !== false ||
        n.attributes.receiveShadow !== false ||
        ["text", "extrude"].includes(String(n.attributes.primitive)) ||
        Number(n.attributes.bevel ?? 0) > 0)) ||
    (n.name === "material" && n.attributes.unlit !== true) ||
    (n.name === "light" && n.attributes.environmentVisible === true) ||
    (n.name === "camera" &&
      (n.attributes.focalLength !== undefined ||
        n.attributes.depthOfField === true ||
        Number(n.attributes.lensDistortion ?? 0) !== 0)) ||
    n.name === "scene360" ||
    (n.name === "project" &&
      (n.attributes.mode !== "standard" ||
        Number(n.attributes.antialias3d ?? 1) > 1)) ||
    n.attributes.threeD === true ||
    (!["object3D", "camera"].includes(n.name) &&
      n.attributes.parent !== undefined) ||
    n.children.some(
      (c) =>
        ["animate", "expression", "link"].includes(c.name) &&
        ["castShadow", "receiveShadow"].includes(String(c.attributes.property)),
    ) ||
    (n.name === "object3D" &&
      (n.attributes.animationClip !== undefined ||
        n.attributes.morphWeights !== undefined ||
        n.attributes.materialVariant !== undefined ||
        Number(n.attributes.instances ?? 1) > 1 ||
        n.children.some((c) => c.name === "transformConstraint"))) ||
    (n.name === "camera" &&
      n.children.some(
        (c) => c.name === "shake" || c.name === "transformConstraint",
      )) ||
    n.children.some(walk);
  /** @returns {boolean} */
  const nested = (/** @type {Node} */ n, /** @type {number} */ depth) =>
    (["object3D", "camera"].includes(n.name) && depth > 2) ||
    n.children.some((c) => nested(c, depth + 1));
  return walk(scene) || nested(scene, 0);
}
/** @param {import('../frame.js').FrameRenderer} host */
export function cyclesFrame(host) {
  const dir = mkdtempSync(join(tmpdir(), "scene-cycles-"));
  try {
    /** @type {Record<string,any>[]} */ const objects = [];
    /** @type {Record<string,any>[]} */ const cameras = [],
      lights = [],
      materials = [];
    const attrs = (/** @type {Node} */ n) => host.attributes(n);
    const project =
      host.scene.children.find((n) => n.name === "project")?.attributes ?? {};
    const resource = (/** @type {string} */ src) => {
      const normalized = posix.normalize(src);
      if (
        posix.isAbsolute(normalized) ||
        normalized.startsWith("../") ||
        /[:\\]/.test(normalized)
      )
        throw new Error("unsafe 3D resource");
      const file = join(dir, normalized);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, host.effectRead(normalized));
      return file;
    };
    for (const [src, bytes] of host.effectFiles) {
      const file = join(dir, src);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    const color = (/** @type {any} */ c) => parseColor(String(c), host.tokens);
    for (const n of host.scene.children.find((n) => n.name === "materials")
      ?.children ?? []) {
      const a = attrs(n);
      for (const key of [
        "baseColor",
        "emissive",
        "attenuationColor",
        "sheenColor",
        "specularColor",
      ])
        if (a[key]) a[key] = color(a[key]);
      for (const key of [
        "baseColorMap",
        "normalMap",
        "metallicRoughnessMap",
        "occlusionMap",
        "emissiveMap",
        "displacementMap",
        "materialX",
      ])
        if (a[key]) a[key] = resource(String(a[key]));
      materials.push(a);
    }
    const walk = (/** @type {Node} */ n, /** @type {string|null} */ parent) => {
      const a = attrs(n),
        id = String(a.id ?? n.path);
      a.constraints = n.children
        .filter(
          (c) =>
            c.name === "transformConstraint" && c.attributes.type !== "track",
        )
        .map((c) => {
          const ca = attrs(c);
          if (ca.type === "follow-path") {
            const p = new svgPathProperties(String(ca.path)),
              length = p.getTotalLength();
            ca.pathPoints = Array.from({ length: 129 }, (_, i) => {
              const v = p.getPointAtLength((length * i) / 128);
              return [v.x, v.y];
            });
          }
          return ca;
        });
      if (
        (a.threeD === true ||
          new Compositor(host).nodes.get(String(a.parent))?.name ===
            "object3D") &&
        ["shape", "layer", "group", "sequence", "particleEmitter"].includes(
          n.name,
        )
      ) {
        const composition = new Compositor(host);
        composition.measure(
          host.composition,
          [host.scale, 0, 0, host.scale, 0, 0],
          Number(project.width),
          Number(project.height),
        );
        const box = composition.boxes.get(n);
        if (!box) throw new Error("missing 3D layer bounds");
        const deform = n.children.some((c) => c.name === "deform")
            ? deformedBounds(n, host, box)
            : { x: 0, y: 0, width: box.width, height: box.height },
          left = Math.min(0, deform.x),
          top = Math.min(0, deform.y),
          right = Math.max(box.width, deform.x + deform.width),
          bottom = Math.max(box.height, deform.y + deform.height),
          textureBox = {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          };
        const parent3D =
          composition.nodes.get(String(a.parent))?.name === "object3D";
        const world = parent3D
            ? composition.locals.get(n)
            : composition.world(n),
          center = point(
            world,
            textureBox.x + textureBox.width / 2,
            textureBox.y + textureBox.height / 2,
          );
        const clone = Object.assign(
          Object.create(Object.getPrototypeOf(host)),
          host,
        );
        clone.width = Math.max(1, Math.ceil(textureBox.width * host.scale));
        clone.height = Math.max(1, Math.ceil(textureBox.height * host.scale));
        clone.composition = { ...host.composition, children: [n] };
        clone.inTexture = true;
        clone.nodeOverrides = new Map(host.nodeOverrides);
        clone.nodeOverrides.set(n, {
          x: -textureBox.x,
          y: -textureBox.y,
          width: box.width,
          height: box.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0,
          anchorY: 0,
          skewX: 0,
          skewY: 0,
          parent: undefined,
          threeD: false,
        });
        const surface = host.color.linear(new Compositor(clone).render(n)),
          texture = join(dir, "plane-" + objects.length + ".f32");
        writeFileSync(
          texture,
          Buffer.from(
            surface.data.buffer,
            surface.data.byteOffset,
            surface.data.byteLength,
          ),
        );
        objects.push({
          ...a,
          id,
          primitive: "textured-plane",
          width: textureBox.width,
          height: textureBox.height,
          x: center.x / host.scale - (parent3D ? 0 : Number(project.width) / 2),
          y:
            center.y / host.scale - (parent3D ? 0 : Number(project.height) / 2),
          z: Number(a.zDepth ?? 0),
          rotation: (Math.atan2(world[1], world[0]) * 180) / Math.PI,
          scaleX: Math.hypot(world[0], world[1]) / host.scale,
          scaleY: Math.hypot(world[2], world[3]) / host.scale,
          parent: parent3D ? a.parent : null,
          opacity: 1,
          texture,
          textureWidth: surface.width,
          textureHeight: surface.height,
          visible: host.active(n),
          renderVisible: host.geometryFilter
            ? host.geometryFilter.has(n)
            : !host.geometryExcluded.has(id),
        });
        return;
      }
      if (n.name === "object3D") {
        if (a.font) {
          const font = [...host.assets.values()].find(
            (f) =>
              f.name === "font" &&
              (f.attributes.id === a.font || f.attributes.family === a.font),
          );
          const src = String(font?.attributes.src ?? a.font);
          a.font = join(dir, "font-" + id + ".ttf");
          writeFileSync(a.font, fontBytes(host.effectRead(src)));
        }
        if (a.primitive === "mesh") {
          const key = String(a.mesh);
          a.geometry = host.io.meshes?.get(key);
          const meshAsset = host.assets.get(key);
          if (
            /\.(gltf|glb|fbx|usd|usda|usdc|usdz|obj|ply|stl)$/i.test(
              String(meshAsset?.attributes.src),
            ) ||
            a.animationClip !== undefined ||
            a.morphWeights !== undefined ||
            a.materialVariant !== undefined
          ) {
            const asset = host.assets.get(key);
            if (!asset) throw new Error("missing animated mesh asset");
            for (const dep of host.io.meshDependencies?.get(key) ?? [])
              resource(dep.src);
            a.source = resource(String(asset.attributes.src));
            a.clipTime =
              (host.runtime?.timeline.spans.get(n)?.local(host.time) ??
                host.time) *
                Number(a.animationSpeed ?? 1) +
              Number(a.animationOffset ?? 0);
          }
          if (!a.geometry) throw new Error("missing imported geometry");
          if (!a.source && a.geometry.materials) {
            a.geometry = structuredClone(a.geometry);
            for (const m of a.geometry.materials)
              for (const prop of m.properties ?? [])
                if (prop.key === "$tex.file")
                  prop.value = resource(
                    posix.join(
                      posix.dirname(String(meshAsset?.attributes.src ?? "")),
                      String(prop.value),
                    ),
                  );
          }
        }
        if (a.primitive === "extrude") {
          a.contours = String(a.path ?? "")
            .split(/(?=[Mm])/)
            .filter(Boolean)
            .map((d) => {
              const p = new svgPathProperties(d),
                length = p.getTotalLength();
              return Array.from(
                { length: Math.max(16, Number(a.segments) * 4) },
                (_, i) => {
                  const v = p.getPointAtLength(
                    (length * i) / Math.max(16, Number(a.segments) * 4),
                  );
                  return [v.x, v.y];
                },
              );
            });
        }
        objects.push({
          ...a,
          parent: a.parent ?? parent,
          visible: host.active(n),
          renderVisible: host.geometryFilter
            ? host.geometryFilter.has(n)
            : !host.geometryExcluded.has(id),
        });
      } else if (n.name === "camera" && host.active(n) && a.active !== false) {
        for (const shake of n.children.filter((c) => c.name === "shake")) {
          const s = attrs(shake);
          if (
            host.time < Number(s.start ?? 0) ||
            host.time >= Number(s.end ?? Infinity)
          )
            continue;
          const seed = Number(
              BigInt(String(s.seed ?? project.seed ?? 0)) & 0xffffffffn,
            ),
            octaves = Math.min(16, Number(s.octaves ?? 2)),
            frequency = Number(s.frequency ?? 2);
          const sample = (/** @type {number} */ lane) => {
            let v = 0,
              sum = 0;
            for (let i = 0; i < octaves; i++) {
              const weight = 2 ** -i;
              v +=
                weight *
                (2 * noise(host.time * frequency * 2 ** i, lane, seed + i) - 1);
              sum += weight;
            }
            return v / sum;
          };
          a.x = Number(a.x ?? 0) + sample(0) * Number(s.amplitude ?? 10);
          a.y = Number(a.y ?? 0) + sample(10) * Number(s.amplitude ?? 10);
          a.shakeRotation = sample(20) * Number(s.rotation ?? 0);
          a.zoomFactor = Math.max(0.01, 1 + sample(30) * Number(s.zoom ?? 0));
        }
        cameras.push({ ...a, parent: a.parent ?? parent });
      } else if (["group", "sequence"].includes(n.name))
        objects.push({
          ...a,
          id,
          parent: a.parent ?? parent,
          primitive: "empty",
          visible: host.active(n),
          renderVisible: host.geometryFilter
            ? host.geometryFilter.has(n)
            : !host.geometryExcluded.has(id),
        });
      for (const c of n.children)
        walk(
          c,
          ["object3D", "group", "sequence"].includes(n.name) ? id : parent,
        );
    };
    walk(host.composition, null);
    for (const n of host.scene.children.find((n) => n.name === "lights")
      ?.children ?? []) {
      const a = attrs(n);
      a.color = color(a.color ?? "#FFFFFF");
      a.mappedShadow =
        n.specifiedAttributes?.some((k) =>
          ["shadowMapSize", "shadowBias"].includes(k),
        ) === true;
      if (host.geometryFilter?.size) a.environmentVisible = false;
      for (const key of ["ies", "environment"])
        if (a[key]) a[key] = resource(String(a[key]));
      a.constraints = n.children
        .filter((c) => c.name === "transformConstraint")
        .map((c) => {
          const ca = attrs(c);
          if (ca.type === "follow-path") {
            const p = new svgPathProperties(String(ca.path));
            ca.pathPoints = Array.from({ length: 129 }, (_, i) => {
              const v = p.getPointAtLength((p.getTotalLength() * i) / 128);
              return [v.x, v.y];
            });
          }
          return ca;
        });
      lights.push(a);
    }
    const output = join(dir, "frame.f32"),
      request = {
        fps: host.fps,
        width: host.width,
        height: host.height,
        projectWidth: Number(project.width),
        projectHeight: Number(project.height),
        time: host.time,
        seed: Number(BigInt(String(project.seed ?? 0)) % 2147483647n),
        quality: project.quality,
        antialias: Number(project.antialias3d ?? 1),
        objects,
        materials,
        cameras,
        lights,
        output,
        scene360:
          project.mode === "viewport"
            ? undefined
            : (host.scene.children.find((n) => n.name === "scene360")
                ?.attributes ??
              (project.mode === "equirectangular"
                ? { layout: "equirectangular", stereo: "mono" }
                : undefined)),
        viewportCamera: host.scene.children.find((n) => n.name === "scene360")
          ?.attributes.viewportCamera,
      };
    const input = join(dir, "request.json");
    writeFileSync(
      input,
      JSON.stringify(request, (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
    );
    execFileSync(
      executable(),
      [new URL("./cycles_render.py", import.meta.url).pathname, input],
      {
        timeout: 120000,
        maxBuffer: 2 << 20,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const bytes = readFileSync(output);
    if (bytes.length !== host.width * host.height * 16)
      throw new Error("Cycles returned invalid frame size");
    const s = new Surface(host.width, host.height);
    s.data.set(
      new Float32Array(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
    );
    if (!s.data.every(Number.isFinite))
      throw new Error("Cycles returned non-finite pixels");
    const ca = cameras.at(-1),
      distortion = Number(ca?.lensDistortion ?? 0);
    const corrected = distortion
      ? warp(s, (x, y) => {
          const nx = (x - (host.width - 1) / 2) / host.width,
            ny = (y - (host.height - 1) / 2) / host.height,
            r = Math.hypot(nx, ny);
          let u = r;
          for (let i = 0; i < 8; i++)
            u -=
              (u * (1 + distortion * u * u) - r) / (1 + 3 * distortion * u * u);
          const q = r ? u / r : 1;
          return [
            (host.width - 1) / 2 + nx * q * host.width,
            (host.height - 1) / 2 + ny * q * host.height,
          ];
        })
      : s;
    return host.color.input(corrected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
