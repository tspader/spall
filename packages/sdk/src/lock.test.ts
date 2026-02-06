import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "@spall/core/config";
import { Lock, ensure } from "./lock";

let dir: string;
let originalSpawn: typeof Bun.spawn;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spall-lock-test-"));
  Config.set({
    dirs: {
      data: join(dir, "data"),
      cache: join(dir, "cache"),
    },
  });
  originalSpawn = Bun.spawn;
});

afterEach(() => {
  (Bun as any).spawn = originalSpawn;
  Lock.remove();
  Config.reset();
  rmSync(dir, { recursive: true, force: true });
});

test("ensure returns follower URL when lock points to healthy server", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/health")
        return new Response("ok", { status: 200 });
      return new Response("not found", { status: 404 });
    },
  });

  try {
    mkdirSync(Config.get().dirs.data, { recursive: true });
    writeFileSync(
      Lock.path(),
      JSON.stringify({ pid: process.pid, port: server.port }),
      "utf-8",
    );

    const url = await ensure();
    expect(url).toBe(`http://127.0.0.1:${server.port}`);
  } finally {
    server.stop();
  }
});

test("ensure reclaims stale startup lock (port null, dead pid)", async () => {
  (Bun as any).spawn = () => ({ unref() {} });

  mkdirSync(Config.get().dirs.data, { recursive: true });
  writeFileSync(
    Lock.path(),
    JSON.stringify({ pid: 99999999, port: null }),
    "utf-8",
  );

  await expect(ensure()).rejects.toThrow(
    /Claimed leader role, but timed out waiting for server to start/,
  );

  const lock = Lock.read();
  expect(lock).not.toBeNull();
  expect(lock!.pid).toBe(process.pid);
  expect(lock!.port).toBeNull();
});

test("ensure reclaims stale unhealthy lock (port set, dead pid)", async () => {
  (Bun as any).spawn = () => ({ unref() {} });

  mkdirSync(Config.get().dirs.data, { recursive: true });
  writeFileSync(
    Lock.path(),
    JSON.stringify({ pid: 99999999, port: 65534 }),
    "utf-8",
  );

  await expect(ensure()).rejects.toThrow(
    /Claimed leader role, but timed out waiting for server to start/,
  );

  const lock = Lock.read();
  expect(lock).not.toBeNull();
  expect(lock!.pid).toBe(process.pid);
  expect(lock!.port).toBeNull();
});
