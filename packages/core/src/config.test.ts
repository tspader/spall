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

    expect(cfg.dirs.cache).toBe(join(homedir(), ".cache", "spall"));
    expect(cfg.dirs.data).toBe(join(homedir(), ".local", "share", "spall"));
    expect(cfg.models.embedding).toContain("embeddinggemma");
    expect(cfg.models.reranker).toContain("reranker");
  });

  test("set() overrides specific values", () => {
    Config.set({ dirs: { cache: "/tmp/custom" } });
    const cfg = Config.get();

    expect(cfg.dirs.cache).toBe("/tmp/custom");
    // Other values should be defaults
    expect(cfg.dirs.data).toBe(join(homedir(), ".local", "share", "spall"));
    expect(cfg.models.embedding).toContain("embeddinggemma");
  });

  test("set() can override all values", () => {
    const custom: ConfigSchema = {
      dirs: {
        cache: "/tmp/cache",
        data: "/tmp/data",
      },
      models: {
        embedding: "custom-embed",
        reranker: "custom-rerank",
      },
      server: {
        idleTimeout: 30,
      },
    };

    Config.set(custom);
    const cfg = Config.get();

    expect(cfg).toEqual(custom);
  });

  test("reset() clears config", () => {
    Config.set({
      dirs: {
        cache: "/tmp/custom",
        data: "",
      },
      models: {
        embedding: "",
        reranker: "",
      },
    });

    expect(Config.get().dirs.cache).toBe("/tmp/custom");

    Config.reset();

    // Should return to defaults
    expect(Config.get().dirs.cache).toBe(join(homedir(), ".cache", "spall"));
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
