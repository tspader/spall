import { test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";

import { Config, Model, Store } from "@spall/core";
import { Bus } from "@spall/core/event";
import { Server, Lock } from "./server";

let dir: string;
let originalChunk: typeof Store.chunk;
let originalLoad: typeof Model.load;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spall-server-lifecycle-"));
  Config.set({
    dirs: {
      cache: join(dir, "cache"),
      data: join(dir, "data"),
    },
  });

  originalChunk = Store.chunk;
  originalLoad = Model.load;
  (Store as any).chunk = async () => [];
  (Model as any).load = async () => {};
});

afterEach(() => {
  Server.stop();
  Lock.remove();
  (Store as any).chunk = originalChunk;
  (Model as any).load = originalLoad;
  Config.reset();
  rmSync(dir, { recursive: true, force: true });
});

test("repeated start/stop does not leak event or process handlers", async () => {
  const baseline = {
    bus: Bus.subscriptionCount(),
    sigint: process.listenerCount("SIGINT"),
    sigterm: process.listenerCount("SIGTERM"),
    uncaught: process.listenerCount("uncaughtException"),
    rejection: process.listenerCount("unhandledRejection"),
  };

  for (let i = 0; i < 12; i++) {
    const started = await Server.start({ persist: true });
    Server.stop();
    await started.stopped;

    expect(Bus.subscriptionCount()).toBe(baseline.bus);
  }

  expect(process.listenerCount("SIGINT")).toBe(baseline.sigint + 1);
  expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm + 1);
  expect(process.listenerCount("uncaughtException")).toBe(
    baseline.uncaught + 1,
  );
  expect(process.listenerCount("unhandledRejection")).toBe(
    baseline.rejection + 1,
  );
  expect(Lock.read()).toBeNull();
});
