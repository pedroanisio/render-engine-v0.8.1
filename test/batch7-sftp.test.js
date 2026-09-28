import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { destinationPlan, deliver } from "../src/render/delivery.js";

test("SFTP transfers real bytes atomically with verified host keys and rejects wrong credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sftp-")),
    host = join(dir, "host"),
    key = join(dir, "identity");
  for (const file of [host, key])
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", file]);
  const python =
    process.env.SCENE_RENDER_TEST_PYTHON ??
    (existsSync(".venv-test/bin/python") ? ".venv-test/bin/python" : "python3");
  const server = spawn(
    python,
    [fileURLToPath(new URL("./fixtures/sftp-server.py", import.meta.url)), dir],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let errors = "";
  server.stderr.on("data", (d) => (errors += d));
  try {
    const port = await new Promise((resolve, reject) => {
      server.stdout.once("data", (d) => resolve(Number(String(d).trim())));
      server.once("exit", (code) =>
        reject(
          new Error(
            `SFTP fixture exited ${code}: ${errors}. Install requirements-test.txt.`,
          ),
        ),
      );
      server.once("error", reject);
    });
    const known = join(dir, "known_hosts");
    writeFileSync(
      known,
      `[127.0.0.1]:${port} ${readFileSync(host + ".pub", "utf8")}`,
    );
    const local = join(dir, "source [1] 'data'.bin"),
      target = join(dir, "remote [1] 'data'.bin");
    const bytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
    writeFileSync(local, bytes);
    const uri = `sftp://${userInfo().username}@127.0.0.1:${port}${encodeURI(target)}`;
    const node = {
      name: "destination",
      attributes: { kind: "sftp", uri, credentials: "test" },
      children: [],
    };
    const env = {
      SCENE_RENDER_PROFILE_test: JSON.stringify({
        keyFile: key,
        knownHostsFile: known,
      }),
    };
    await deliver(destinationPlan(node, env), local, dir);
    assert.deepEqual(readFileSync(target), bytes);
    assert.ok(!readdirSync(dir).some((p) => p.includes(".upload-")));
    const wrong = join(dir, "wrong_hosts");
    writeFileSync(
      wrong,
      `[127.0.0.1]:${port} ${readFileSync(key + ".pub", "utf8")}`,
    );
    await assert.rejects(
      deliver(
        destinationPlan(node, {
          SCENE_RENDER_PROFILE_test: JSON.stringify({
            keyFile: key,
            knownHostsFile: wrong,
          }),
        }),
        local,
        dir,
      ),
      /HOST IDENTIFICATION|Host key verification/i,
    );
    assert.deepEqual(readFileSync(target), bytes);
  } catch (e) {
    throw new Error(String(e) + "\nsshd: " + errors);
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("close", r));
    }
  }
});

test("malformed credential profiles fail without echoing secret values", () => {
  const node = {
    name: "destination",
    attributes: {
      kind: "http-put",
      uri: "https://example.invalid/upload",
      credentials: "local",
    },
    children: [],
  };
  for (const value of [
    "secret-token",
    "42",
    "[]",
    JSON.stringify({ headers: { authorization: "secret-token\n" } }),
    JSON.stringify({ headers: null }),
  ]) {
    assert.throws(
      () => destinationPlan(node, { SCENE_RENDER_PROFILE_local: value }),
      (error) =>
        /Invalid destination credential profile local/.test(error.message) &&
        !error.message.includes("secret-token"),
    );
  }
});
