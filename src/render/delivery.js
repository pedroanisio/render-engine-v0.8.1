import { fileURLToPath } from "node:url";
/** Delivery credentials are named environment profiles, never XML secrets. */
import {
  createReadStream,
  copyFileSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { processRun } from "./process.js";
import { publishFile } from "./output-lock.js";
import { randomUUID } from "node:crypto";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {Node} n @param {NodeJS.ProcessEnv} [env] */
export function destinationPlan(n, env = process.env) {
  const a = n.attributes,
    kind = String(a.kind),
    uri = String(a.uri);
  let profile;
  try {
    profile = a.credentials
      ? JSON.parse(
          env[
            `SCENE_RENDER_PROFILE_${String(a.credentials).replace(/[^A-Za-z0-9_]/g, "_")}`
          ] ?? "null",
        )
      : {};
  } catch {
    throw new Error(`Invalid destination credential profile ${a.credentials}`);
  }
  if (profile === null)
    throw new Error(`Missing destination credential profile ${a.credentials}`);
  if (
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    (profile.headers !== undefined &&
      (typeof profile.headers !== "object" ||
        profile.headers === null ||
        Array.isArray(profile.headers) ||
        Object.entries(profile.headers).some(
          ([key, value]) =>
            typeof value !== "string" || /[\r\n]/.test(key + value),
        )))
  )
    throw new Error(`Invalid destination credential profile ${a.credentials}`);
  if (kind === "file") return { kind, uri, profile };
  if (kind === "sftp") {
    const url = new URL(uri);
    if (
      url.protocol !== "sftp:" ||
      url.password ||
      /[\r\n"]/u.test(decodeURIComponent(url.pathname))
    )
      throw new Error("Invalid SFTP URI");
    try {
      execFileSync("sftp", ["-h"], { stdio: "ignore" });
    } catch (e) {
      if (/** @type {{code?:string}} */ (e).code === "ENOENT")
        throw new Error("SFTP backend is unavailable");
    }
  }
  const endpoint = String(profile.url ?? uri);
  if (
    profile.url &&
    endpoint.split("?")[0] !== uri.split("?")[0] &&
    profile.resource !== uri
  )
    throw new Error(
      "Credential profile must explicitly bind its upload URL to the requested resource URI",
    );
  if (kind !== "sftp") {
    const url = new URL(endpoint);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        "Remote destination requires HTTP(S) URI or signed URL in environment profile",
      );
    if (["s3", "gcs", "azure-blob"].includes(kind) && !profile.url)
      throw new Error(
        `${kind} requires a signed upload URL in its environment profile`,
      );
  }
  return { kind, uri: kind === "sftp" ? uri : endpoint, profile };
}
/** @param {ReturnType<typeof destinationPlan>} p @param {string} file @param {string} base @param {AbortSignal} [signal] */
export async function deliver(p, file, base, signal) {
  signal?.throwIfAborted();
  if (p.kind === "file") {
    const target = p.uri.startsWith("file:")
      ? fileURLToPath(p.uri)
      : resolve(base, p.uri);
    if (resolve(target) === resolve(file)) return;
    publishFile(file, target);
    return;
  }
  if (p.kind === "sftp") {
    const url = new URL(p.uri),
      path = decodeURIComponent(url.pathname);
    const args = [
      "-oBatchMode=yes",
      "-oStrictHostKeyChecking=yes",
      ...(p.profile.knownHostsFile
        ? [`-oUserKnownHostsFile=${String(p.profile.knownHostsFile)}`]
        : []),
      ...(p.profile.keyFile ? ["-oIdentitiesOnly=yes"] : []),
      "-P",
      url.port || "22",
      ...(p.profile.keyFile ? ["-i", String(p.profile.keyFile)] : []),
      "-b",
      "-",
      `${url.username ? url.username + "@" : ""}${url.hostname}`,
    ];
    if (/[\r\n"]/u.test(file)) throw new Error("Unsafe SFTP local path");
    // Quote paths as one batch argument; OpenSSH quotes glob characters itself.
    const escaped = (/** @type {string} */ value) =>
      value.replace(/\\/g, "\\\\");
    const temporary = `${path}.upload-${randomUUID()}`;
    await processRun("sftp", args, {
      signal,
      frames: [
        Buffer.from(
          `put "${escaped(file)}" "${escaped(temporary)}"\nrename "${escaped(temporary)}" "${escaped(path)}"\n`,
        ),
      ],
    });
    return;
  }
  const webhook = p.kind === "webhook";
  const body = webhook
    ? JSON.stringify({
        file: file.split("/").at(-1),
        bytes: statSync(file).size,
      })
    : createReadStream(file);
  try {
    const response = await fetch(
      p.uri,
      /** @type {RequestInit} */ ({
        method: webhook ? "POST" : "PUT",
        headers: {
          ...(webhook
            ? { "content-type": "application/json" }
            : { "content-length": String(statSync(file).size) }),
          ...(p.kind === "azure-blob" ? { "x-ms-blob-type": "BlockBlob" } : {}),
          ...p.profile.headers,
        },
        body,
        duplex: "half",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
          : AbortSignal.timeout(60000),
        redirect: "error",
      }),
    );
    await response.body?.cancel();
    if (!response.ok)
      throw new Error(`Destination ${p.kind} returned HTTP ${response.status}`);
  } finally {
    if (typeof body !== "string") body.destroy();
  }
}
