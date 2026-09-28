/**
 * In-process frame parallelism: worker threads each hold a renderer and
 * encode frames; the pool hands them back in order. Every frame is computed
 * by the same code regardless of the thread, so output is identical to a
 * serial render.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism, freemem } from "node:os";

/** @typedef {import('./pipeline.js').RenderOptions} RenderOptions */
/** @typedef {{bytes:ArrayBuffer,byteOffset:number,length:number,unsupported:string[],warnings:string[]}} FrameResult */

/** Threads for a render that did not ask: half the cores, at most four, and
 * only as many extra renderers as free memory comfortably holds. */
export function defaultThreads() {
  const cores = Math.floor(availableParallelism() / 2);
  const footprint = Math.max(process.memoryUsage().rss * 1.5, 512 << 20);
  const byMemory = Math.floor(freemem() / footprint);
  return Math.max(1, Math.min(4, cores, byMemory));
}

export class FramePool {
  /** @param {RenderOptions} o @param {number} threads */
  constructor(o, threads) {
    // Functions and signals cannot cross threads; shards render serially.
    const { signal, log, jobs, shard, ...rest } = o;
    void log;
    void jobs;
    void shard;
    this.options = { ...rest, threads: 1 };
    this.signal = signal;
    this.threads = threads;
    /** @type {Worker[]} */ this.workers = [];
    /** @type {Worker[]} */ this.idle = [];
    /** @type {Map<number,{resolve:(r:FrameResult)=>void,reject:(e:Error)=>void}>} */
    this.waiters = new Map();
    /** @type {Map<number,FrameResult>} */ this.results = new Map();
    /** @type {Error|undefined} */ this.failure = undefined;
    this.closed = false;
  }
  /** Spawns the workers and waits until each has built its renderer. */
  async start() {
    const url = new URL("./frame-worker.js", import.meta.url);
    /** @type {Promise<void>[]} */ const ready = [];
    for (let i = 0; i < this.threads; i++) {
      const worker = new Worker(url, {
        workerData: { options: this.options },
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
    this.idle.push(worker);
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
