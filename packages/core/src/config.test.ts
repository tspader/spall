import { describe, test, expect, afterEach } from "bun:test";
import { Config, type ConfigSchema } from "./config";
import { homedir } from "os";
import { join } from "path";

describe("Config", () => {
  afterEach(() => {
    Config.reset();
  });

  test("get() returns defaults when not configured", () => {
    const cfg = Config.get();

    expect(cfg.cacheDir).toBe(join(homedir(), ".cache", "spall"));
    expect(cfg.embeddingModel).toContain("embeddinggemma");
    expect(cfg.rerankerModel).toContain("reranker");
  });

  test("set() overrides specific values", () => {
    Config.set({ cacheDir: "/tmp/custom" });
    const cfg = Config.get();

    expect(cfg.cacheDir).toBe("/tmp/custom");
    // Other values should be defaults
    expect(cfg.embeddingModel).toContain("embeddinggemma");
  });

  test("set() can override all values", () => {
    const custom: ConfigSchema = {
      cacheDir: "/tmp/cache",
      embeddingModel: "custom-embed",
      rerankerModel: "custom-rerank",
    };

    Config.set(custom);
    const cfg = Config.get();

    expect(cfg).toEqual(custom);
  });

  test("reset() clears config", () => {
    Config.set({ cacheDir: "/tmp/custom" });
    expect(Config.get().cacheDir).toBe("/tmp/custom");

    Config.reset();

    // Should return to defaults
    expect(Config.get().cacheDir).toBe(join(homedir(), ".cache", "spall"));
  });

  test("get() is idempotent", () => {
    const cfg1 = Config.get();
    const cfg2 = Config.get();

    expect(cfg1).toBe(cfg2); // Same reference
  });

  test("load() reads config and caches it", () => {
    const cfg1 = Config.load();
    const cfg2 = Config.load();

    expect(cfg1).toBe(cfg2); // Same reference, not re-read
  });
});
