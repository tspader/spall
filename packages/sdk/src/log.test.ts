import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "@spall/core/config";
import { ServerLog } from "./log";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spall-log-test-"));
  Config.set({
    dirs: {
      data: join(dir, "data"),
      cache: join(dir, "cache"),
    },
  });
});

afterEach(() => {
  Config.reset();
  rmSync(dir, { recursive: true, force: true });
});

test("log writes are best-effort when log directory disappears", () => {
  ServerLog.init(12345);
  const path = ServerLog.path();
  expect(path).not.toBeNull();
  rmSync(path!, { recursive: true, force: true });

  expect(() => ServerLog.event({ tag: "test.event" })).not.toThrow();
  expect(() => ServerLog.error(new Error("boom"))).not.toThrow();
  expect(() => ServerLog.appLog("GET /health", "200")).not.toThrow();
});
