/**
 * In-process frame parallelism: worker threads each hold a renderer and
 * encode frames; the pool hands them back in order. Every frame is computed
 * by the same code regardless of the thread, so output is identical to a
 * serial render.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism, freemem } from "node:os";

/** @typedef {import('./pipeline.js').RenderOptions} RenderOptions */
/** @typedef {{bytes:ArrayBuffer,byteOffset:number,length:number,unsupported:string[],warnings:string[],contrast?:Array<[string,number]>}} FrameResult */

/** Threads for a render that did not ask: half the cores (the other half
 * encodes), at most four, or every core, at most sixteen, when a GPU encodes;
 * and only as many renderers as free memory comfortably holds.
 * @param {boolean} [gpuEncoding] */
export function defaultThreads(gpuEncoding = false) {
  const cores = gpuEncoding
    ? availableParallelism()
    : Math.floor(availableParallelism() / 2);
  const footprint = Math.max(process.memoryUsage().rss * 1.5, 512 << 20);
  const byMemory = Math.floor(freemem() / footprint);
  return Math.max(1, Math.min(gpuEncoding ? 16 : 4, cores, byMemory));
}

export class FramePool {
  /**
   * @param {RenderOptions} o @param {number} threads
   * @param {import('./setup.js').SceneSnapshot} [snapshot] scene bytes and text inputs
   * the pipeline hashed; workers build from these instead of re-reading the disk
   */
  constructor(o, threads, snapshot) {
    // Functions and signals cannot cross threads; shards render serially.
    const { signal, log, jobs, shard, ...rest } = o;
    void log;
    void jobs;
    void shard;
    this.options = { ...rest, threads: 1 };
    this.snapshot = snapshot;
    this.signal = signal;
    this.threads = threads;
    /** @type {Worker[]} */ this.workers = [];
    /** @type {Worker[]} */ this.idle = [];
    /** @type {Map<number,{resolve:(r:FrameResult)=>void,reject:(e:Error)=>void}>} */
    this.waiters = new Map();
    /** @type {Map<number,FrameResult>} */ this.results = new Map();
    /** @type {Error|undefined} */ this.failure = undefined;
    this.closed = false;
    /** Workers held by a segment; their frames never return them to `idle`.
     * @type {Set<Worker>} */ this.reserved = new Set();
    /** @type {Array<{resolve:(w:Worker)=>void,reject:(e:Error)=>void}>} */
    this.queue = [];
  }
  /** One worker for the caller's exclusive use, once one is free.
   * @returns {Promise<Worker>} */
  acquire() {
    if (this.failure) return Promise.reject(this.failure);
    const worker = this.idle.pop();
    if (worker) {
      this.reserved.add(worker);
      return Promise.resolve(worker);
    }
    return new Promise((resolve, reject) =>
      this.queue.push({ resolve, reject }),
    );
  }
  /** @param {Worker} worker */
  release(worker) {
    const next = this.queue.shift();
    if (next) next.resolve(worker);
    else {
      this.reserved.delete(worker);
      this.idle.push(worker);
    }
  }
  /**
   * Encoded frames f0..f1-1 of one segment, rendered in order by one worker so
   * that consecutive frames share its layer cache. Segments may run
   * concurrently, one worker each; the worker's media caches are dropped at the
   * end, as the serial path does per segment.
   * @param {number} f0 @param {number} f1 @param {number} fps
   * @param {{unsupported:Set<string>,warnings:Set<string>}} renderer
   * @param {(frame:number, contrast:Array<[string,number]>)=>void} [onContrast]
   *   when given, each frame's text contrast is measured as it renders
   */
  async *segment(f0, f1, fps, renderer, onContrast) {
    const worker = await this.acquire();
    try {
      let sent = f0;
      for (let f = f0; f < f1; f++) {
        this.signal?.throwIfAborted();
        // Two frames in flight: the worker renders the next while this one encodes.
        while (sent < f1 && sent < f + 2) {
          worker.postMessage({
            type: "render",
            id: sent,
            time: sent / fps,
            contrast: !!onContrast,
          });
          sent++;
        }
        const r = await this.take(f);
        for (const u of r.unsupported) renderer.unsupported.add(u);
        for (const w of r.warnings) renderer.warnings.add(w);
        if (onContrast) onContrast(f, r.contrast ?? []);
        yield Buffer.from(r.bytes, r.byteOffset, r.length);
      }
    } finally {
      if (!this.closed) {
        worker.postMessage({ type: "clear" });
        this.release(worker);
      }
    }
  }
  /** Spawns the workers and waits until each has built its renderer. */
  async start() {
    const url = new URL("./frame-worker.js", import.meta.url);
    /** @type {Promise<void>[]} */ const ready = [];
    for (let i = 0; i < this.threads; i++) {
      const worker = new Worker(url, {
        workerData: { options: this.options, snapshot: this.snapshot },
      });
      this.workers.push(worker);
      ready.push(
        new Promise((resolve, reject) => {
          worker.on("message", (m) => {
            if (m.type === "ready") {
              this.idle.push(worker);
              resolve();
            } else if (m.type === "frame") this.receive(worker, m);
            else if (m.type === "error") {
              const error = new Error(m.message);
              reject(error);
              this.fail(error);
            }
          });
          worker.on("error", (error) => {
            reject(error);
            this.fail(error);
          });
          worker.on("exit", (code) => {
            if (code !== 0 && !this.closed) {
              const error = new Error(`frame worker exited with code ${code}`);
              reject(error);
              this.fail(error);
            }
          });
        }),
      );
    }
    this.signal?.addEventListener(
      "abort",
      () => this.fail(new Error("render aborted")),
      { once: true },
    );
    try {
      await Promise.all(ready);
    } catch (error) {
      this.close();
      throw error;
    }
    return this;
  }
  /** @param {Worker} worker @param {any} m */
  receive(worker, m) {
    if (!this.reserved.has(worker)) this.idle.push(worker);
    const waiter = this.waiters.get(m.id);
    if (waiter) {
      this.waiters.delete(m.id);
      waiter.resolve(m);
    } else this.results.set(m.id, m);
  }
  /** @param {Error} error */
  fail(error) {
    this.failure ??= error;
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
    for (const waiter of this.queue.splice(0)) waiter.reject(error);
  }
  /** @param {number} id @returns {Promise<FrameResult>} */
  take(id) {
    const hit = this.results.get(id);
    if (hit) {
      this.results.delete(id);
      return Promise.resolve(hit);
    }
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) =>
      this.waiters.set(id, { resolve, reject }),
    );
  }
  /**
   * Encoded frames f0..f1-1 in order, rendered concurrently; unsupported
   * features and warnings are merged into the pipeline's renderer.
   * @param {number} f0 @param {number} f1 @param {number} fps
   * @param {{unsupported:Set<string>,warnings:Set<string>}} renderer
   */
  async *frames(f0, f1, fps, renderer) {
    let dispatched = f0;
    const dispatch = () => {
      while (dispatched < f1 && this.idle.length && !this.failure) {
        const worker = /** @type {Worker} */ (this.idle.pop());
        worker.postMessage({
          type: "render",
          id: dispatched,
          time: dispatched / fps,
        });
        dispatched++;
      }
    };
    for (let f = f0; f < f1; f++) {
      this.signal?.throwIfAborted();
      dispatch();
      const r = await this.take(f);
      for (const u of r.unsupported) renderer.unsupported.add(u);
      for (const w of r.warnings) renderer.warnings.add(w);
      dispatch();
      yield Buffer.from(r.bytes, r.byteOffset, r.length);
    }
  }
  /** Drops per-segment pixel caches, as the serial path does. */
  clear() {
    for (const worker of this.workers) worker.postMessage({ type: "clear" });
  }
  close() {
    this.closed = true;
    for (const worker of this.workers) void worker.terminate();
    this.workers = [];
    this.idle = [];
  }
}
