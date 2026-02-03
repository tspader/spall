import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Model } from "./model";
import { Bus } from "./event";
import { Config } from "./config";

describe("Model", () => {
  let tmpDir: string;

  beforeEach(async () => {
    await Model.dispose();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-model-test-"));
    Config.reset();
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      // Empty model URIs should fail deterministically without network.
      models: { embedding: "", reranker: "" },
    });
  });

  afterEach(async () => {
    await Model.dispose();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("publishes model.failed when model file does not exist", async () => {
    const events: { tag: string; error?: string }[] = [];
    const unsub = Bus.subscribe((e) => {
      events.push(e as { tag: string; error?: string });
    });

    await expect(Model.load()).rejects.toThrow();

    unsub();

    const failed = events.find((e) => e.tag === "model.failed");
    expect(failed).toBeDefined();
    expect(failed?.error).toBeDefined();
  });
});
