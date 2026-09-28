import { outputPlan } from "../render/export.js";
import { transitionTypes } from "../render/transitions.js";
import { effectTypes } from "../render/fx/processor.js";
import { shapePath } from "../render/geometry/path.js";
import { safeArea } from "../render/geometry/layout.js";
import { MODEL } from "../generated/model.js";
import { simple } from "../eval/value.js";
import { diagnostic, Codes } from "../diagnostics.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
const visual =
  "layer shape group sequence instance particleEmitter object3D adjustment repeat include".split(
    " ",
  );
const assets =
  "image video imageSequence audio font text vector lottie chart audiogram mesh generator code formula generated".split(
    " ",
  );
/** Expected targets are part of this runtime contract, not inferred Schematron rules. */
const targets = {
  marker: ["marker"],
  startMarker: ["marker"],
  endMarker: ["marker"],
  fontAsset: ["font"],
  basedOn: ["textStyle"],
  style: ["textStyle"],
  textStyle: ["textStyle"],
  effects: ["effect"],
  audioBus: ["bus"],
  bus: ["bus"],
  duckUnder: ["bus", "audioTrack"],
  sidechain: ["bus", "audioTrack"],
  output: ["bus"],
  symbol: ["symbol"],
  over: ["data", "param"],
  material: ["material"],
  mesh: ["mesh"],
  skeleton: ["skeleton"],
  sprite: ["image"],
  emitterAsset: ["image", "svg", "text"],
  forceFields: ["forceField"],
  focusTarget: visual,
  matte: visual,
  from: visual,
  to: visual,
  a: visual,
  b: visual,
  lights: ["light"],
  footage: ["video"],
  transcribe: ["audio", "audioTrack"],
  activeStyle: ["textStyle"],
  safeArea: ["safeArea"],
  param: ["param"],
  looks: ["look"],
  audioDescription: ["audio", "audioTrack"],
  viewportCamera: ["camera"],
  layout: ["layout"],
  variant: ["variant"],
  captions: ["captionTrack"],
  burnCaptions: ["captionTrack"],
};
/** @param {Node} scene */
export function semanticRules(scene) {
  /** @type {import('../diagnostics.js').Diagnostic[]} */ const out = [];
  /** @type {Map<string,Node>} */ const ids = new Map();
  /** @type {Node[]} */ const nodes = [];
  const walk = (/** @type {Node} */ n) => {
    nodes.push(n);
    if (n.attributes.id !== undefined) ids.set(String(n.attributes.id), n);
    for (const c of n.children) walk(c);
  };
  walk(scene);
  const report = (/** @type {Node} */ n, /** @type {string} */ message) =>
    out.push(
      diagnostic(Codes.RUNTIME_SEMANTIC, "semantic", message, n.loc, n.path),
    );
  if (scene.attributes.version !== "1.1")
    report(scene, "the runtime requires scene version 1.1");
  for (const n of nodes) {
    const a = n.attributes;
    for (const [prop, value] of Object.entries(a)) {
      const definition = MODEL.complexTypes[n.type]?.attributes[prop];
      if (!definition || !simple.idKind(definition.type)?.startsWith("IDREF"))
        continue;
      let expected = /** @type {Record<string,string[]>} */ (targets)[prop];
      if (prop === "asset")
        expected = n.name === "audioTrack" ? ["audio", "video"] : assets;
      if (prop === "parent") expected = n.name === "bone" ? ["bone"] : visual;
      if (prop === "target")
        expected =
          n.name === "bind"
            ? nodes.map((n) => n.name)
            : n.name === "transformConstraint" && a.type === "track"
              ? ["trackData"]
              : [...visual, "bone", "camera", "light"];
      if (prop === "source" && n.name === "beatGrid")
        expected = ["audio", "audioTrack"];
      if (prop === "source" && n.name === "effect")
        expected = [
          ...visual,
          ...assets,
          ...(a.type === "gradient-map"
            ? [
                "linearGradient",
                "radialGradient",
                "conicGradient",
                "meshGradient",
                "pattern",
              ]
            : []),
        ];
      if (prop === "source" && n.name === "audiogram")
        expected = ["audio", "audioTrack"];
      if (!expected) continue;
      for (const ref of Array.isArray(value) ? value : [value]) {
        const target = ids.get(String(ref));
        if (
          !target &&
          ["marker", "startMarker", "endMarker"].includes(prop) &&
          /^(beat|bar)\.\d+$/.test(String(ref))
        )
          continue;
        if (!target || !expected.includes(target.name))
          report(
            n,
            `@${prop}="${String(ref)}" must reference ${expected.join("|")}`,
          );
      }
    }
    for (const k of [
      "width",
      "height",
      ...(n.name === "marker" ? [] : ["duration"]),
    ])
      if (typeof a[k] === "number" && Number(a[k]) <= 0)
        report(n, `@${k} must be positive`);
    if (
      a.clipIn !== undefined &&
      a.clipOut !== undefined &&
      Number(a.clipOut) < Number(a.clipIn)
    )
      report(n, "clipOut precedes clipIn");
    if (
      a.start !== undefined &&
      a.end !== undefined &&
      Number(a.end) < Number(a.start)
    )
      report(n, "end precedes start");
    if (
      a.min !== undefined &&
      a.max !== undefined &&
      Number(a.min) > Number(a.max)
    )
      report(n, "min exceeds max");
  }
  for (const prop of ["parent", "matte", "basedOn", "output", "symbol"]) {
    const done = new Set(),
      stack = new Set();
    /** @param {Node} n */ const visit = (n) => {
      const id = String(n.attributes.id);
      if (stack.has(id)) {
        report(n, `${prop} reference cycle`);
        return;
      }
      if (done.has(id)) return;
      stack.add(id);
      const next = ids.get(String(n.attributes[prop]));
      if (next) visit(next);
      stack.delete(id);
      done.add(id);
    };
    for (const n of nodes) if (n.attributes[prop] !== undefined) visit(n);
  }
  const tokens = new Map(
    nodes
      .filter((n) => n.name === "token")
      .map((n) => [String(n.attributes.name), n]),
  );
  for (const [name, node] of tokens) {
    const seen = new Set([name]);
    let next = /^var\(--(.+)\)$/.exec(String(node.attributes.value))?.[1];
    while (next) {
      if (seen.has(next)) {
        report(node, "color token cycle");
        break;
      }
      seen.add(next);
      const token = tokens.get(next);
      if (!token) {
        report(node, `unknown color token ${next}`);
        break;
      }
      next = /^var\(--(.+)\)$/.exec(String(token.attributes.value))?.[1];
    }
  }
  const symbolEdges = new Map(
    nodes
      .filter((n) => n.name === "symbol")
      .map((n) => {
        const refs = new Set();
        const collect = (/** @type {Node} */ c) => {
          if (c.name === "instance") refs.add(String(c.attributes.symbol));
          for (const child of c.children) collect(child);
        };
        collect(n);
        return [String(n.attributes.id), refs];
      }),
  );
  const complete = new Set(),
    pending = new Set();
  const symbolVisit = (/** @type {string} */ id) => {
    if (pending.has(id)) {
      const node = ids.get(id);
      if (node) report(node, "recursive symbol instantiation");
      return;
    }
    if (complete.has(id)) return;
    pending.add(id);
    for (const child of symbolEdges.get(id) ?? []) symbolVisit(child);
    pending.delete(id);
    complete.add(id);
  };
  for (const id of symbolEdges.keys()) symbolVisit(id);
  return out;
}
const common =
  "id name tags z visible opacity start end startMarker endMarker condition";
/** Attributes actually consumed by the current raster/audio/export backend. */
/** @type {Record<string,string>} */
const supported = {
  scene: "version",
  project: "width height fps duration background linearLight seed",
  composition: "",
  assets: "",
  image: "id src sha256 width height",
  font: "id src sha256 family",
  audio: "id src sha256 duration channels sampleRate bpm",
  text: "id text width height fontAsset style size minSize maxSize lineHeight align verticalAlign autoFit color",
  styles: "",
  textStyle: "id fontAsset size lineHeight color",
  token: "name value",
  shape: `${common} shape x y width height radius fill stroke strokeWidth effects`,
  layer: `${common} asset x y scaleX scaleY anchorX anchorY rotation`,
  group: `${common} x y width height clip effects timeOffset timeScale`,
  mask: "id type mode x y width height feather invert expansion",
  particleEmitter: `${common} preset shape x y emitterWidth emitterHeight rate lifetime speed direction spread size trail color seed preroll maxParticles`,
  effects: "",
  effect: "id type enabled amount mix seed size angle intensity radius color",
  audioMix: "sampleRate channels channelLayout bitDepth",
  master: "volume normalize loudness truePeak limiter dither",
  audioTrack:
    "id asset bus start startMarker clipIn clipOut fadeIn fadeOut fadeCurve gain volume pan mute loop reverse speed preservePitch role language fitToDuration duckUnder duckAmount duckThreshold duckAttack duckRelease",
  bus: "id gain volume pan mute output duckUnder duckAmount duckThreshold duckAttack duckRelease",
  audioEffect:
    "id type enabled mix frequency gain threshold ratio attack release knee time feedback roomSize width semitones amount sidechain",
  band: "kind frequency gain q",
  captions: "",
  captionTrack:
    "id language label kind src format transcribe cache cacheSha256 mode preset style activeStyle activeColor maxWordsPerLine maxCharsPerLine maxLines x y width safeArea z profanityFilter",
  cue: "start end text speaker style position",
  word: "start end text emphasis",
  accessibility:
    "description audioDescription requireCaptions flashCheck contrastCheck minContrast",
  output:
    "id path codec container width height fps crf preset pixelFormat keyframeInterval captions burnCaptions variant audio audioCodec audioBitrate faststart",
  poster: "id path time marker width format quality",
  thumbnail: "id path time marker width format quality",
  markers: "",
  marker: "id time duration kind label color",
  beatGrid: "bpm offset beatsPerBar source",
  parameters: "",
  param:
    "id type default label description required min max maxLength pattern options",
  bind: "param target property map",
  data: "id src format sha256",
  variant: "id label",
  set: "param value",
  override: "target property value",
  animate:
    "property defaultInterpolation extrapolateBefore extrapolateAfter additive timeBase",
  key: "time value interpolation bezier easeIn easeOut spatialIn spatialOut roving steps stepPosition tension continuity bias stiffness damping mass marker",
  expression: "property seed enabled",
  motionPath:
    "progress path start end interpolation autoOrient orientOffset constantSpeed",
  link: "property source scale offset min max delay smoothing",
  metadata:
    "title author description keywords copyright revision created modified generator language",
  meta: "name value",
};
const affine =
  "parent matte matteMode matteVisible alignX alignY alignTo margin x y rotation scaleX scaleY anchorX anchorY skewX skewY blend effects";
for (const name of [
  "shape",
  "group",
  "layer",
  "sequence",
  "adjustment",
  "particleEmitter",
])
  /** @type {Record<string,string>} */ (supported)[name] =
    (supported[name] ?? common) + " " + affine;
for (const name of [
  "shape",
  "mask",
  "shapeModifier",
  "linearGradient",
  "radialGradient",
  "conicGradient",
  "meshGradient",
  "pattern",
  "stop",
  "point",
  "safeArea",
  "layout",
  "symbol",
]) {
  const types = { point: "meshPointType", pattern: "patternPaintType" };
  const type =
    /** @type {Record<string,string>} */ (types)[name] ?? name + "Type";
  const omitted = new Set([
    "motionBlur",
    "threeD",
    "zDepth",
    "rotationX",
    "rotationY",
  ]);
  /** @type {Record<string,string>} */ (supported)[name] = Object.keys(
    MODEL.complexTypes[type]?.attributes ?? {},
  )
    .filter((k) => !omitted.has(k))
    .join(" ");
}
supported.group +=
  " isolate collapse layout gap padding justify alignItems gridColumns";
/** @type {Record<string,string>} */ (supported).sequence =
  supported.group + " timeGap";
supported.layer +=
  " fit boxWidth boxHeight focusX focusY cropLeft cropTop cropRight cropBottom flipX flipY";
supported.project +=
  " safeArea motionBlur shutterAngle shutterPhase motionBlurSamples adaptiveMotionBlur";
for (const name of [
  "shape",
  "layer",
  "group",
  "sequence",
  "particleEmitter",
  "adjustment",
])
  supported[name] += " motionBlur";
supported.output += " layout";
for (const name of ["paints", "safeAreas", "layouts", "symbols"])
  /** @type {Record<string,string>} */ (supported)[name] = "";
supported.effect = Object.keys(
  MODEL.complexTypes.effectType?.attributes ?? {},
).join(" ");
supported.colorManagement = Object.keys(
  MODEL.complexTypes.colorManagementType?.attributes ?? {},
).join(" ");
supported.look = Object.keys(
  MODEL.complexTypes.lookType?.attributes ?? {},
).join(" ");
supported.project += " workingColorSpace";
supported.output += " colorSpace transfer";
supported.transition = Object.keys(
  MODEL.complexTypes.transitionType?.attributes ?? {},
).join(" ");
supported.lights = "";
supported.light = "id type color intensity exposure range x y z";
supported.materials = "";
supported.camera =
  "id name active start end x y z projection fov near far yaw pitch roll target focalLength sensorWidth orthoHeight exposure";
supported.material =
  "id baseColor emissive emissiveStrength opacity alphaMode alphaCutoff doubleSided unlit";
supported.object3D =
  "id name primitive material mesh depth width height segments x y z rotation rotationX rotationY scaleX scaleY scaleZ radius visible opacity start end condition parent castShadow receiveShadow";
for (const name of [
  "physics",
  "rigidBody",
  "softBody",
  "forceField",
  "constraint",
  "deform",
  "modifier",
  "pin",
  "skeleton",
  "bone",
  "burst",
  "transformConstraint",
  "tracking",
  "trackData",
  "scene360",
  "shake",
]) {
  const type = name === "pin" ? "puppetPinType" : name + "Type";
  supported[name] = Object.keys(
    MODEL.complexTypes[type]?.attributes ?? {},
  ).join(" ");
}
supported.particleEmitter = Object.keys(
  MODEL.complexTypes.particleEmitterType?.attributes ?? {},
)
  .filter((k) => !["threeD", "zDepth", "rotationX", "rotationY"].includes(k))
  .join(" ");
supported.material = Object.keys(
  MODEL.complexTypes.materialType?.attributes ?? {},
).join(" ");
supported.light = Object.keys(
  MODEL.complexTypes.lightType?.attributes ?? {},
).join(" ");
supported.camera = Object.keys(MODEL.complexTypes.cameraType?.attributes ?? {})
  .filter((k) => k !== "shutterAngle")
  .join(" ");
supported.object3D +=
  " text font path bevel instances animationClip animationSpeed animationOffset morphWeights materialVariant motionBlur";
supported.camera += " shutterAngle";
supported.project += " mode antialias3d quality";
for (const name of ["layer", "shape", "group", "sequence", "particleEmitter"])
  supported[name] += " threeD zDepth rotationX rotationY";
supported.layer += " stabilize stabilizeSmoothness";
const mediaNodes = [
  "image",
  "video",
  "imageSequence",
  "audio",
  "vector",
  "mesh",
  "lottie",
  "generator",
  "chart",
  "audiogram",
  "code",
  "formula",
  "generated",
];
for (const name of mediaNodes)
  supported[name] = Object.keys(
    MODEL.complexTypes[name + "AssetType"]?.attributes ?? {},
  ).join(" ");
for (const name of ["slot", "timeRemap", "representation"])
  supported[name] = Object.keys(
    MODEL.complexTypes[name + "Type"]?.attributes ?? {},
  ).join(" ");
supported.series = Object.keys(
  MODEL.complexTypes.chartSeriesType?.attributes ?? {},
).join(" ");
supported.layer +=
  " clipIn clipOut loop reverse speed timeStretch freezeAt frameBlend volume mute audioBus";
for (const name of ["text", "font"])
  supported[name] = Object.keys(
    MODEL.complexTypes[name + "AssetType"]?.attributes ?? {},
  ).join(" ");
for (const name of ["textStyle", "span", "textPath", "textAnimator"])
  supported[name] = Object.keys(
    MODEL.complexTypes[name + "Type"]?.attributes ?? {},
  ).join(" ");
for (const name of ["image", "video", "audio"])
  supported[name] +=
    " kind provider model prompt voice language seed cache cacheSha256";
for (const name of ["output", "destination"])
  supported[name] = Object.keys(
    MODEL.complexTypes[name + "Type"]?.attributes ?? {},
  ).join(" ");
supported.project += " timecodeStart pixelAspect";
/** Capability diagnostics run before any frame, encoder, or cache access. */
export function capabilities(/** @type {Node} */ scene) {
  /** @type {import('../diagnostics.js').Diagnostic[]} */ const out = [];
  const report = (/** @type {Node} */ n, /** @type {string} */ message) =>
    out.push(
      diagnostic(Codes.RUNTIME_CAPABILITY, "semantic", message, n.loc, n.path),
    );
  /** @param {Node} n */ const walk = (n) => {
    if (n.name === "symbols") return;
    if (n.type === "paramValueType") {
      if (!n.attributes.name || n.attributes.value === undefined)
        report(n, "param requires name and value");
      return;
    }
    const allow = Object.hasOwn(supported, n.name)
      ? /** @type {Record<string,string>} */ (supported)[n.name]
      : undefined;
    if (allow === undefined) {
      report(n, `<${n.name}> is not implemented by the render backend`);
      return;
    }
    const attrs = new Set(allow.split(" "));
    for (const [k, v] of Object.entries(n.attributes))
      if (!attrs.has(k)) {
        const cdef = Object.hasOwn(MODEL.complexTypes, n.type)
          ? MODEL.complexTypes[n.type]
          : undefined;
        const def = cdef && Object.hasOwn(cdef.attributes, k) ? cdef.attributes[k] : undefined;
        const parsed =
          def?.default === null || def?.default === undefined
            ? null
            : simple.check(def.type, def.default);
        if (parsed?.ok && String(parsed.value) === String(v)) continue;
        report(n, `${n.name}/@${k}="${String(v)}" is not implemented`);
      }
    const a = n.attributes;
    if (n.name === "object3D") {
      if (Number(a.instances ?? 1) > 4096)
        report(n, "3D instances must not exceed 4096");
      if (Number(a.segments) < 3 || Number(a.segments) > 256)
        report(n, "3D segments must be between 3 and 256");
      if (a.primitive === "mesh" && !a.mesh)
        report(n, "mesh primitive requires a mesh asset");
    }
    if (n.name === "camera") {
      if (Number(a.near) >= Number(a.far) || Number(a.fov) >= 180)
        report(n, "invalid camera clipping range or field of view");
    }
    if (
      n.name === "rigidBody" &&
      !["box", "circle", "capsule", "path", "polygon", "convex-hull"].includes(
        String(a.shape),
      )
    )
      report(n, "rigidBody shape is not implemented");
    if (
      n.name === "transformConstraint" &&
      a.type === "ik" &&
      !n.path.includes("skeleton")
    )
      report(n, "IK requires a skeleton two-bone chain");
    if (
      n.name === "scene360" &&
      ["cubemap", "eac"].includes(String(a.layout))
    ) {
      const w = Number(a.width) / (a.stereo === "left-right" ? 2 : 1),
        h = Number(a.height) / (a.stereo === "top-bottom" ? 2 : 1);
      if (w % 3 || h % 2 || w / 3 !== h / 2)
        report(
          n,
          "cubemap/EAC requires six square faces in a 3x2 atlas per eye",
        );
    }
    if (n.name === "softBody") {
      const dt = Number(
        scene.children.find((c) => c.name === "physics")?.attributes
          .fixedStep ?? 1 / 120,
      );
      const steps = Math.ceil(
        (dt *
          Math.sqrt(
            (Number(a.stiffness) * Number(a.rows) * Number(a.cols)) /
              Number(a.mass),
          )) /
          2,
      );
      if (steps > 4096) report(n, "softBody requires more than 4096 substeps");
    }
    if (n.name === "effect" && Number(a.samples ?? 16) > 256)
      report(n, "effect samples exceeds the 256-sample budget");
    if (n.name === "transition" && !transitionTypes.has(String(a.type)))
      report(
        n,
        `transition ${String(a.type)} requires the Batch 5 geometry backend`,
      );
    if (n.name === "shape" || n.name === "mask")
      try {
        shapePath(
          a,
          typeof a.width === "number" ? a.width : 1,
          typeof a.height === "number" ? a.height : 1,
        );
      } catch (e) {
        report(n, e instanceof Error ? e.message : String(e));
      }
    if (
      ["linearGradient", "radialGradient", "conicGradient"].includes(n.name) &&
      !n.children.some((c) => c.name === "stop")
    )
      report(n, "gradient requires color stops");
    if (n.name === "meshGradient") {
      const points = n.children.filter((c) => c.name === "point");
      const keys = new Set(
        points.map((c) => `${c.attributes.row}:${c.attributes.col}`),
      );
      if (
        keys.size !== Number(a.rows) * Number(a.cols) ||
        keys.size !== points.length ||
        points.some(
          (c) =>
            Number(c.attributes.row) >= Number(a.rows) ||
            Number(c.attributes.col) >= Number(a.cols),
        )
      )
        report(n, "mesh requires exactly one point per grid coordinate");
    }
    if (n.name === "safeArea")
      try {
        safeArea(a, 1, 1);
      } catch (e) {
        report(n, e instanceof Error ? e.message : String(e));
      }
    if (
      n.name === "layer" &&
      (Number(a.cropLeft ?? 0) + Number(a.cropRight ?? 0) >= 1 ||
        Number(a.cropTop ?? 0) + Number(a.cropBottom ?? 0) >= 1)
    )
      report(n, "crop leaves no source pixels");
    if (
      n.name === "pattern" &&
      (Number(a.scale ?? 1) === 0 ||
        Number(a.tileWidth ?? 1) <= 0 ||
        Number(a.tileHeight ?? 1) <= 0)
    )
      report(n, "pattern dimensions and scale must be nonzero");
    if (
      n.name === "shapeModifier" &&
      (Number(a.copies ?? 0) > 10000 || Number(a.detail ?? 10) <= 0)
    )
      report(n, "modifier exceeds geometry budget or has invalid detail");
    if (n.name === "project" && a.linearLight === false)
      report(n, "project/@linearLight=false is not implemented");
    if (n.name === "output")
      try {
        outputPlan({
          ...a,
          specifiedOutputAttributes: [
            ...(n.specifiedAttributes ?? Object.keys(a)),
          ],
        });
      } catch (e) {
        report(n, e instanceof Error ? e.message : String(e));
      }
    if (n.name === "effect" && !effectTypes.has(String(a.type)))
      report(n, `effect type="${String(a.type)}" is not implemented`);

    if (n.name === "shapeModifier" && a.mode !== undefined) {
      const modes = {
        merge: ["add", "subtract", "intersect", "exclude"],
        "zig-zag": ["corner", "smooth"],
        "offset-path": ["miter", "round", "bevel"],
      };
      const allowed = /** @type {Record<string,string[]>} */ (modes)[
        String(a.type)
      ];
      if (!allowed?.includes(String(a.mode)))
        report(n, "invalid shapeModifier mode");
    }
    for (const c of n.children) {
      if (
        c.name === "param" &&
        c.type === "paramValueType" &&
        a.type !== "shader" &&
        n.name !== "audioEffect"
      )
        report(c, "named uniforms require a shader effect or transition");
      if (c.name === "transition") {
        const a = c.attributes,
          ids = n.children.map((n) => n.attributes.id);
        if (
          n.children.some(
            (c) =>
              c.name === "object3D" &&
              (c.attributes.id === a.from || c.attributes.id === a.to),
          )
        )
          report(c, "transition endpoints must be 2D layers or groups");
        if (
          (!a.from && !a.to) ||
          (a.from && !ids.includes(a.from)) ||
          (a.to && !ids.includes(a.to)) ||
          (a.from && a.from === a.to)
        )
          report(c, "transition requires distinct sibling from/to endpoints");
      }
      if (
        c.name === "motionPath" &&
        c.attributes.autoOrient === true &&
        !attrs.has("rotation")
      )
        report(c, `${n.name}/@rotation is not implemented for autoOrient`);
      if (
        ["animate", "expression", "link"].includes(c.name) &&
        (!attrs.has(String(c.attributes.property)) ||
          [
            "id",
            "start",
            "end",
            "startMarker",
            "endMarker",
            "src",
            "type",
            "bus",
            "clipIn",
            "clipOut",
            "fadeIn",
            "fadeOut",
            "condition",
            "effects",
            "timeOffset",
            "timeScale",
          ].includes(String(c.attributes.property)) ||
          (["audioTrack", "bus", "master"].includes(n.name) &&
            !["gain", "volume", "pan"].includes(String(c.attributes.property))))
      )
        report(
          c,
          `${n.name}/@${String(c.attributes.property)} cannot be driven by this backend`,
        );
      walk(c);
    }
  };
  walk(scene);
  return out;
}

/** Machine-readable declarations, separate from evidence of rendered behavior.
 * Each context includes every schema attribute/enum; accepting a field is not certification. */
export function capabilityManifest() {
  /** @param {string} type @param {Set<string>} [seen] @returns {unknown[]} */
  const enums = (type, seen = new Set()) => {
    if (seen.has(type)) return [];
    seen.add(type);
    const s = MODEL.simpleTypes[type];
    if (!s || s.kind !== "restriction") return [];
    return s.facets.enumeration ?? enums(s.base, seen);
  };
  const contexts = [];
  const specifications = {
    ...MODEL.complexTypes,
    $document: {
      content: {
        kind: "elements",
        elementTypes: { [MODEL.root.name]: MODEL.root.type },
      },
    },
  };
  for (const [parent, spec] of Object.entries(specifications)) {
    if (spec.content.kind !== "elements") continue;
    for (const [element, type] of Object.entries(spec.content.elementTypes)) {
      const attributes = MODEL.complexTypes[type]?.attributes ?? {};
      const declared = new Set((supported[element] ?? "").split(/\s+/));
      contexts.push({
        parent,
        element,
        type,
        attributes: Object.entries(attributes).map(([name, a]) => ({
          key: `${type}/@${name}`,
          name,
          type: a.type,
          default: a.default,
          required: a.required,
          values: enums(a.type),
          runtime: declared.has(name)
            ? "declared-with-runtime-guards"
            : "default-only-or-rejected",
          certification: "requires-behavioral-evidence",
        })),
      });
    }
  }
  return {
    schemaVersion: MODEL.version,
    policy:
      "Declarations do not certify pixels, samples, containers or all combinations. See batch7-validation.md and test evidence.",
    contexts,
  };
}
