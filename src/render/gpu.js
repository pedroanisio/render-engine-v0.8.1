/**
 * GPU frame tail: the full-frame point operations that end a frame (a final
 * adjustment layer's grades, grain and vignette), the display finish and the
 * 16-bit encode, fused into one WebGPU compute pass per frame.
 *
 * The CPU composites everything else and hands over one premultiplied float
 * frame; the GPU returns the encoded rgba64le bytes and, for a contrast check,
 * the finished float frame. Arithmetic follows the CPU code operation for
 * operation, in float32 rather than double: results are deterministic for a
 * given GPU and driver, and within float32 rounding of the CPU path. Film
 * grain uses the same integer hash, so its noise field is identical.
 *
 * WebGPU comes from the optional `webgpu` (Dawn) package over Vulkan; without
 * it, or without a GPU, `gpuDevice()` resolves to undefined and callers keep
 * the CPU path.
 */

/** Values per code: liftGammaGain [lift rgb, gain rgb, 1/gamma rgb]; colorGrade
 * [saturation, contrast, brightness]; exposure [gain]; grain [amount x 2 x
 * intensity, cell, frame, seed]; vignette [cx, cy, w/2, h/2, threshold,
 * softness, intensity, colour rgb].
 * @typedef {{code:number, values:number[]}} TailOp */
/**
 * @typedef {object} GpuPlan colour finish and encode parameters (ColorPipeline.gpuPlan)
 * @property {number} depth 0 none, 1 8-bit, 2 16-bit, 3 half float, 4 float
 * @property {number} exposureGain
 * @property {number[]|undefined} matrix linear sRGB to output primaries, as two row-major 3x3 steps
 * @property {Uint32Array} thresholds float32 bit pattern at which each 16-bit level starts
 * @property {boolean} preserveAlpha
 */

/** WebGPU flag values (fixed by the specification). */
const USAGE = {
    MAP_READ: 0x1,
    COPY_SRC: 0x4,
    COPY_DST: 0x8,
    UNIFORM: 0x40,
    STORAGE: 0x80,
  },
  MAP_READ = 0x1;
/** Operation codes shared with the shader. */
export const OP = {
  liftGammaGain: 1,
  colorGrade: 2,
  exposure: 3,
  grain: 4,
  vignette: 5,
};
const MAX_OPS = 8,
  OP_WORDS = 16;

const SHADER = /* wgsl */ `
struct Frame {
  width: u32, height: u32, opCount: u32, depth: u32,
  exposureGain: f32, hasMatrix: u32, preserveAlpha: u32, encode: u32,
  m: array<vec4<f32>, 6>,
};
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> frame: Frame;
@group(0) @binding(2) var<storage, read> ops: array<vec4<f32>, ${MAX_OPS * (OP_WORDS / 4)}>;
@group(0) @binding(3) var<storage, read> thresholds: array<u32>;
@group(0) @binding(4) var<storage, read_write> encoded: array<vec2<u32>>;
@group(0) @binding(5) var<storage, read_write> finished: array<vec4<f32>>;
// Grain cell of each column, then each row: Math.floor(x / cell) in double
// precision, which float32 division does not reproduce at cell edges.
@group(0) @binding(6) var<storage, read> cells: array<u32>;

fn word(op: u32, k: u32) -> f32 { return ops[op * ${OP_WORDS / 4}u + k / 4u][k % 4u]; }
fn bits(op: u32, k: u32) -> u32 { return bitcast<u32>(word(op, k)); }

// effects.js hash01, in the same 32-bit integer arithmetic.
fn hash01(a: u32, b: u32, c: u32, d: u32) -> f32 {
  var h = (a ^ 0x9e3779b9u) * 0x85ebca6bu;
  h = (h ^ (h >> 13u) ^ (b * 0xc2b2ae35u)) * 0x27d4eb2fu;
  h = (h ^ (h >> 15u) ^ (c * 0x165667b1u)) * 0x9e3779b1u;
  h = (h ^ (h >> 16u) ^ (d * 0x85ebca77u)) * 0xc2b2ae3du;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}
// Math.round for non-negative values (WGSL round() ties to even).
fn roundUp(x: f32) -> f32 { return floor(x + 0.5); }
// Round to nearest even binary16, saturating at 65504, as color-management's half().
fn half(v: f32) -> f32 {
  if (v == 0.0) { return v; }
  let x = min(abs(v), 65504.0);
  let e = i32((bitcast<u32>(x) >> 23u) & 0xffu) - 127;
  let step = exp2(f32(max(-24, e - 10)));
  let q = x / step;
  let n = floor(q);
  var r = floor(q + 0.5);
  if (q - n == 0.5) { r = select(n + 1.0, n, (u32(n) & 1u) == 0u); }
  return sign(v) * r * step;
}
fn quantize(v0: f32) -> f32 {
  let v = v0 * frame.exposureGain;
  switch frame.depth {
    case 1u: { return roundUp(clamp(v, 0.0, 1.0) * 255.0) / 255.0; }
    case 2u: { return roundUp(clamp(v, 0.0, 1.0) * 65535.0) / 65535.0; }
    case 3u: { return half(v); }
    default: { return v; }
  }
}
fn unpremultiply(p: vec4<f32>) -> vec3<f32> {
  if (p.a == 1.0) { return p.rgb; }
  if (p.a == 0.0) { return vec3<f32>(0.0); }
  return p.rgb / p.a;
}
// encode-lut level(): the largest level whose threshold is at or below x.
fn level(x: f32) -> u32 {
  if (!(x > 0.0)) { return 0u; }
  if (x > 1.0) { return 65535u; }
  let b = bitcast<u32>(x);
  var lo = 0u;
  var hi = 65535u;
  while (lo < hi) {
    let mid = (lo + hi + 1u) / 2u;
    if (thresholds[mid] <= b) { lo = mid; } else { hi = mid - 1u; }
  }
  return lo;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= frame.width || id.y >= frame.height) { return; }
  let i = id.y * frame.width + id.x;
  let x = f32(id.x);
  let y = f32(id.y);
  var p = src[i];
  for (var o = 0u; o < frame.opCount; o++) {
    let code = u32(word(o, 0u));
    if (code == ${OP.grain}u) {
      // film-grain works on premultiplied values and skips empty pixels.
      if (p.a > 0.0) {
        let n = (hash01(cells[id.x], cells[frame.width + id.y], bits(o, 3u), bits(o, 4u)) - 0.5) * word(o, 1u) * p.a;
        p = vec4<f32>(max(vec3<f32>(0.0), p.rgb + vec3<f32>(n)), p.a);
      }
      continue;
    }
    let c = unpremultiply(p);
    let alpha = clamp(p.a, 0.0, 1.0);
    var q = c;
    if (code == ${OP.liftGammaGain}u) {
      let lift = vec3<f32>(word(o, 1u), word(o, 2u), word(o, 3u));
      let gain = vec3<f32>(word(o, 4u), word(o, 5u), word(o, 6u));
      let inv = vec3<f32>(word(o, 7u), word(o, 8u), word(o, 9u));
      let b = max(vec3<f32>(0.0), (c + (vec3<f32>(1.0) - c) * lift) * gain);
      for (var k = 0u; k < 3u; k++) {
        if (inv[k] != 1.0) { q[k] = select(pow(b[k], inv[k]), 0.0, b[k] <= 0.0); } else { q[k] = b[k]; }
      }
    } else if (code == ${OP.colorGrade}u) {
      let l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      q = (vec3<f32>(l) + (c - vec3<f32>(l)) * word(o, 1u) - vec3<f32>(0.18)) * word(o, 2u) + vec3<f32>(0.18) + vec3<f32>(word(o, 3u));
    } else if (code == ${OP.exposure}u) {
      q = c * word(o, 1u);
    } else if (code == ${OP.vignette}u) {
      let d = length(vec2<f32>((x - word(o, 1u)) / word(o, 3u), (y - word(o, 2u)) / word(o, 4u)));
      let v = clamp((d - word(o, 5u)) / word(o, 6u), 0.0, 1.0) * word(o, 7u);
      q = c * (1.0 - v) + vec3<f32>(word(o, 8u), word(o, 9u), word(o, 10u)) * v;
      p = vec4<f32>(q * alpha, alpha);
      continue;
    }
    p = vec4<f32>(select(q * alpha, q, p.a == 1.0), alpha);
  }
  // ColorPipeline.finish
  if (frame.depth != 0u) {
    let c = unpremultiply(p);
    let alpha = clamp(p.a, 0.0, 1.0);
    let q = vec3<f32>(quantize(c.r), quantize(c.g), quantize(c.b));
    p = vec4<f32>(select(q * alpha, q, p.a == 1.0), alpha);
  }
  finished[i] = p;
  if (frame.encode == 0u) { return; }
  // ColorPipeline.encode16
  var c = select(vec3<f32>(0.0), p.rgb / p.a, p.a != 0.0);
  if (frame.hasMatrix != 0u) {
    let r1 = vec3<f32>(dot(frame.m[0].xyz, c), dot(frame.m[1].xyz, c), dot(frame.m[2].xyz, c));
    c = vec3<f32>(dot(frame.m[3].xyz, r1), dot(frame.m[4].xyz, r1), dot(frame.m[5].xyz, r1));
  }
  let alpha = clamp(p.a, 0.0, 1.0);
  let div = select(1.0, alpha, frame.preserveAlpha != 0u);
  let e = select(vec3<f32>(0.0), (c * alpha) / div, alpha > 0.0);
  let a16 = u32(roundUp(select(1.0, alpha, frame.preserveAlpha != 0u) * 65535.0));
  encoded[i] = vec2<u32>(level(e.r) | (level(e.g) << 16u), level(e.b) | (a16 << 16u));
}
`;

/** @type {Promise<{device:any, instance:any, identity:string}|undefined>|undefined} */
let opening;
/**
 * The WebGPU device of this thread, or undefined without a usable GPU.
 * `SCENE_RENDER_GPU=off` disables it.
 * @returns {Promise<{device:any, instance:any, identity:string}|undefined>}
 */
export function gpuDevice() {
  opening ??= (async () => {
    if (process.env.SCENE_RENDER_GPU === "off") return undefined;
    try {
      const webgpu = /** @type {any} */ (
        await import(/** @type {string} */ ("webgpu"))
      );
      Object.assign(globalThis, webgpu.globals);
      // The instance must outlive the device: collecting it tears down state
      // the device still uses.
      const instance = webgpu.create([]);
      const adapter = await instance.requestAdapter({
        powerPreference: "high-performance",
      });
      if (!adapter || adapter.info?.isFallbackAdapter) return undefined;
      const device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize:
            adapter.limits.maxStorageBufferBindingSize,
          maxBufferSize: adapter.limits.maxBufferSize,
        },
      });
      const info = adapter.info ?? {};
      return {
        device,
        instance,
        identity: `webgpu ${info.vendor} ${info.architecture} ${info.device} ${info.description}`,
      };
    } catch {
      return undefined;
    }
  })();
  return opening;
}

/** Per-device pipeline and per-frame-size buffer sets (one per frame in flight). */
/** @type {WeakMap<object, {pipeline:any, thresholds:Map<Uint32Array,any>, free:Map<string,any[]>}>} */
const states = new WeakMap();

/** @param {any} device */
function stateOf(device) {
  let s = states.get(device);
  if (!s) {
    const module = device.createShaderModule({ code: SHADER });
    s = {
      pipeline: device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" },
      }),
      thresholds: new Map(),
      free: new Map(),
    };
    states.set(device, s);
  }
  return s;
}

/**
 * Runs the tail, finish and encode on the GPU.
 * @param {{device:any}} gpu
 * @param {import('./surface.js').Surface} surface composited premultiplied frame
 * @param {TailOp[]} tail adjustment operations, in order
 * @param {GpuPlan} plan
 * @param {{encode:boolean, floats:boolean}} want
 * @returns {Promise<{encoded?:Buffer, finished?:Float32Array}>}
 */
export async function gpuFinish(gpu, surface, tail, plan, want) {
  const { device } = gpu,
    state = stateOf(device),
    W = surface.width,
    H = surface.height,
    n = W * H;
  if (tail.length > MAX_OPS)
    throw new Error("GPU tail supports at most 8 operations");
  const grainCells = new Set(
    tail.filter((op) => op.code === OP.grain).map((op) => op.values[1]),
  );
  if (grainCells.size > 1)
    throw new Error("GPU tail supports one film-grain cell size per frame");
  const sizeKey = `${W}x${H}`;
  const set = state.free.get(sizeKey)?.pop() ?? {
    src: device.createBuffer({
      size: n * 16,
      usage: USAGE.STORAGE | USAGE.COPY_DST,
    }),
    frame: device.createBuffer({
      size: 128,
      usage: USAGE.UNIFORM | USAGE.COPY_DST,
    }),
    ops: device.createBuffer({
      size: MAX_OPS * OP_WORDS * 4,
      usage: USAGE.STORAGE | USAGE.COPY_DST,
    }),
    encoded: device.createBuffer({
      size: n * 8,
      usage: USAGE.STORAGE | USAGE.COPY_SRC,
    }),
    finished: device.createBuffer({
      size: n * 16,
      usage: USAGE.STORAGE | USAGE.COPY_SRC,
    }),
    readEncoded: device.createBuffer({
      size: n * 8,
      usage: USAGE.MAP_READ | USAGE.COPY_DST,
    }),
    cells: device.createBuffer({
      size: (W + H) * 4,
      usage: USAGE.STORAGE | USAGE.COPY_DST,
    }),
    cellSize: NaN,
    readFinished: device.createBuffer({
      size: n * 16,
      usage: USAGE.MAP_READ | USAGE.COPY_DST,
    }),
    groups: new Map(),
  };
  try {
    let thresholds = state.thresholds.get(plan.thresholds);
    if (!thresholds) {
      thresholds = device.createBuffer({
        size: plan.thresholds.byteLength,
        usage: USAGE.STORAGE | USAGE.COPY_DST,
      });
      device.queue.writeBuffer(thresholds, 0, plan.thresholds);
      state.thresholds.set(plan.thresholds, thresholds);
    }
    let group = set.groups.get(thresholds);
    if (!group) {
      group = device.createBindGroup({
        layout: state.pipeline.getBindGroupLayout(0),
        entries: [
          set.src,
          set.frame,
          set.ops,
          thresholds,
          set.encoded,
          set.finished,
          set.cells,
        ].map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      set.groups.set(thresholds, group);
    }
    const header = new ArrayBuffer(128),
      u = new Uint32Array(header),
      f = new Float32Array(header);
    u[0] = W;
    u[1] = H;
    u[2] = tail.length;
    u[3] = plan.depth;
    f[4] = plan.exposureGain;
    u[5] = plan.matrix ? 1 : 0;
    u[6] = plan.preserveAlpha ? 1 : 0;
    u[7] = want.encode ? 1 : 0;
    if (plan.matrix)
      for (let r = 0; r < 6; r++)
        for (let k = 0; k < 3; k++)
          f[8 + r * 4 + k] = /** @type {number} */ (plan.matrix[r * 3 + k]);
    const words = new Float32Array(MAX_OPS * OP_WORDS),
      wordBits = new Uint32Array(words.buffer);
    tail.forEach((op, o) => {
      words[o * OP_WORDS] = op.code;
      op.values.forEach((v, k) => {
        // Grain's frame and seed (values 2 and 3) travel as raw 32-bit words.
        if (op.code === OP.grain && k >= 2)
          wordBits[o * OP_WORDS + 1 + k] = v >>> 0;
        else words[o * OP_WORDS + 1 + k] = v;
      });
    });
    // Typed arrays only: this Dawn build mishandles ArrayBuffer sources.
    device.queue.writeBuffer(set.frame, 0, u);
    device.queue.writeBuffer(set.ops, 0, words);
    const cell = [...grainCells][0] ?? 1;
    if (cell !== set.cellSize) {
      const table = new Uint32Array(W + H);
      for (let x = 0; x < W; x++) table[x] = Math.floor(x / cell);
      for (let y = 0; y < H; y++) table[W + y] = Math.floor(y / cell);
      device.queue.writeBuffer(set.cells, 0, table);
      set.cellSize = cell;
    }
    device.queue.writeBuffer(
      set.src,
      0,
      surface.data.length === n * 4
        ? surface.data
        : surface.data.subarray(0, n * 4),
    );
    const encoder = device.createCommandEncoder(),
      pass = encoder.beginComputePass();
    pass.setPipeline(state.pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16));
    pass.end();
    if (want.encode)
      encoder.copyBufferToBuffer(set.encoded, 0, set.readEncoded, 0, n * 8);
    if (want.floats)
      encoder.copyBufferToBuffer(set.finished, 0, set.readFinished, 0, n * 16);
    device.queue.submit([encoder.finish()]);
    /** @type {{encoded?:Buffer, finished?:Float32Array}} */ const result = {};
    // One mapping at a time: concurrent maps crash this Dawn build.
    if (want.encode) {
      await set.readEncoded.mapAsync(MAP_READ);
      result.encoded = Buffer.from(set.readEncoded.getMappedRange().slice(0));
      set.readEncoded.unmap();
    }
    if (want.floats) {
      await set.readFinished.mapAsync(MAP_READ);
      result.finished = new Float32Array(
        set.readFinished.getMappedRange().slice(0),
      );
      set.readFinished.unmap();
    }
    return result;
  } finally {
    const free = state.free.get(sizeKey) ?? [];
    free.push(set);
    state.free.set(sizeKey, free);
  }
}

/**
 * One exported frame through the GPU tail: its rgba64le bytes and, with
 * `measure`, each drawn text layer's contrast (as accessibility.contrastFrame
 * measures it, on the GPU-finished pictures). Undefined when the frame needs
 * the CPU path.
 * @param {import('./frame.js').FrameRenderer} renderer @param {{device:any}} gpu
 * @param {number} time @param {boolean} preserveAlpha @param {boolean} measure
 * @returns {Promise<{bytes: Buffer, contrast?: Array<[string, number]>}|undefined>}
 */
export async function gpuFrame(renderer, gpu, time, preserveAlpha, measure) {
  renderer.contrastChecks = [];
  renderer.captureContrast = measure;
  let picture;
  try {
    picture = renderer.renderDeferred(time, preserveAlpha);
  } finally {
    renderer.captureContrast = false;
  }
  if (!picture) return undefined;
  // Later frames may render while this one is on the GPU; keep this frame's masks.
  const masks = renderer.contrastChecks,
    floats = measure && masks.length > 0;
  const shown = await gpuFinish(
    gpu,
    picture.surface,
    picture.tail,
    picture.plan,
    {
      encode: true,
      floats,
    },
  );
  /** @type {Array<[string, number]>|undefined} */
  const contrast = measure ? [] : undefined;
  if (floats && contrast) {
    renderer.suppressText = true;
    let background;
    try {
      background = renderer.renderDeferred(time, preserveAlpha);
    } finally {
      renderer.suppressText = false;
    }
    if (!background) return undefined;
    const behind = await gpuFinish(
      gpu,
      background.surface,
      background.tail,
      background.plan,
      { encode: false, floats: true },
    );
    const x = /** @type {Float32Array} */ (shown.finished),
      y = /** @type {Float32Array} */ (behind.finished);
    for (const c of masks) {
      let ratio = Infinity;
      for (const i of c.pixels) {
        const lx =
            0.2126 * Number(x[i]) +
            0.7152 * Number(x[i + 1]) +
            0.0722 * Number(x[i + 2]),
          ly =
            0.2126 * Number(y[i]) +
            0.7152 * Number(y[i + 1]) +
            0.0722 * Number(y[i + 2]);
        ratio = Math.min(
          ratio,
          (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05),
        );
      }
      contrast.push([c.id, ratio]);
    }
  }
  return { bytes: /** @type {Buffer} */ (shown.encoded), contrast };
}
