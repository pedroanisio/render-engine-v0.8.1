/** Bounded stderr, backpressure, cancellation and process cleanup. */
import { spawn } from "node:child_process";
/** @param {string} command @param {string[]} args @param {{signal?:AbortSignal,frames?:Iterable<Uint8Array>|AsyncIterable<Uint8Array>,timeout?:number,graceful?:boolean,onStdout?:(text:string)=>void}} [options] */
export async function processRun(command, args, options = {}) {
  options.signal?.throwIfAborted();
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let error = "",
    stdout = "";
  child.stdout.on("data", (b) => {
    stdout = (stdout + String(b)).slice(-65536);
    options.onStdout?.(String(b));
  });
  child.stderr.on("data", (b) => {
    error = (error + String(b)).slice(-65536);
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(undefined)
        : reject(new Error(`${command} exited ${code}: ${error}`)),
    );
  });
  // Mark rejection handled while producing frames; await the original promise below.
  void done.catch(() => {});
  child.stdin.on("error", () => {});
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let escalation;
  let stopped = false;
  const kill = (/** @type {NodeJS.Signals} */ signal) => {
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (e) {
        if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ESRCH") throw e;
      }
    } else child.kill(signal);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    kill(options.graceful ? "SIGTERM" : "SIGKILL");
    if (options.graceful) escalation = setTimeout(() => kill("SIGKILL"), 2000);
  };
  options.signal?.addEventListener("abort", stop, { once: true });
  // No implicit deadline: long shards and encodes run until they finish or are cancelled.
  const timer =
    options.timeout === undefined
      ? undefined
      : setTimeout(stop, options.timeout);
  try {
    for await (const frame of options.frames ?? []) {
      options.signal?.throwIfAborted();
      if (!child.stdin.write(frame))
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            child.stdin.off("drain", drain);
            child.stdin.off("error", fail);
            child.off("close", closed);
          };
          const drain = () => {
            cleanup();
            resolve(undefined);
          };
          const fail = (/** @type {Error} */ e) => {
            cleanup();
            reject(e);
          };
          const closed = () =>
            fail(new Error(`${command} closed pipe: ${error}`));
          child.stdin.once("drain", drain);
          child.stdin.once("error", fail);
          child.once("close", closed);
        });
    }
    child.stdin.end();
    await done;
    options.signal?.throwIfAborted();
    return stdout;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
    child.stdin.destroy();
    if (child.exitCode === null) {
      stop();
      await done.catch(() => {});
    }
    clearTimeout(escalation);
  }
}
