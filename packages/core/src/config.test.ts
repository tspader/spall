import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  Config,
  type ConfigSchema,
  ConfigSchemaZod,
  ProjectConfigSchemaZod,
} from "./config";
import { homedir } from "os";
import { join } from "path";

// Use a non-existent path for tests to ensure isolation from user config
const TEST_CONFIG_PATH = "/tmp/spall-test-config-does-not-exist.json";

describe("Config", () => {
  beforeEach(() => {
    // Isolate tests from user config by pointing to a non-existent file
    Config._setConfigPath(TEST_CONFIG_PATH);
  });

  afterEach(() => {
    Config.reset();
  });

  test("get() returns defaults when not configured", () => {
    const cfg = Config.get();

    expect(cfg.dirs.cache).toBe(join(homedir(), ".cache", "spall"));
    expect(cfg.dirs.data).toBe(join(homedir(), ".local", "share", "spall"));
    expect(cfg.models.embedding).toContain("embeddinggemma");
    expect(cfg.models.reranker).toContain("reranker");
    expect(cfg.embedding.poolSize).toBe(4);
    expect(cfg.server.idleTimeout).toBe(1);
  });

  test("set() overrides specific values", () => {
    Config.set({ dirs: { cache: "/tmp/custom" } });
    const cfg = Config.get();

    expect(cfg.dirs.cache).toBe("/tmp/custom");
    // Other values should be defaults
    expect(cfg.dirs.data).toBe(join(homedir(), ".local", "share", "spall"));
    expect(cfg.models.embedding).toContain("embeddinggemma");
    expect(cfg.embedding.poolSize).toBe(4);
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
      embedding: {
        poolSize: 8,
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

describe("ConfigSchemaZod", () => {
  test("validates a complete config", () => {
    const validConfig = {
      dirs: {
        cache: "/tmp/cache",
        data: "/tmp/data",
      },
      models: {
        embedding: "hf:model.gguf",
        reranker: "hf:reranker.gguf",
      },
      server: {
        idleTimeout: 5,
      },
      embedding: {
        poolSize: 4,
      },
    };

    const result = ConfigSchemaZod.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  test("rejects config with wrong types", () => {
    const invalidConfig = {
      dirs: {
        cache: 123, // should be string
        data: "/tmp/data",
      },
      models: {
        embedding: "hf:model.gguf",
        reranker: "hf:reranker.gguf",
      },
      server: {
        idleTimeout: 5,
      },
      embedding: {
        poolSize: 4,
      },
    };

    const result = ConfigSchemaZod.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  test("rejects config with missing required fields", () => {
    const incompleteConfig = {
      dirs: {
        cache: "/tmp/cache",
        // missing data
      },
      models: {
        embedding: "hf:model.gguf",
        reranker: "hf:reranker.gguf",
      },
      server: {
        idleTimeout: 5,
      },
      embedding: {
        poolSize: 4,
      },
    };

    const result = ConfigSchemaZod.safeParse(incompleteConfig);
    expect(result.success).toBe(false);
  });

  test("partial() allows partial top-level fields", () => {
    // Note: partial() only makes top-level fields optional
    // Nested objects within those fields must be complete
    const partialConfig = {
      dirs: {
        cache: "/tmp/custom",
        data: "/tmp/data",
      },
      // other top-level fields are missing, which is fine with partial()
    };

    const result = ConfigSchemaZod.partial().safeParse(partialConfig);
    expect(result.success).toBe(true);
  });

  test("deep partial config validation works in load()", () => {
    // The actual load() function handles partial configs by merging with defaults
    // This is the real-world use case
    Config.set({ dirs: { cache: "/tmp/override" } });
    const cfg = Config.get();

    expect(cfg.dirs.cache).toBe("/tmp/override");
    expect(cfg.dirs.data).toBe(join(homedir(), ".local", "share", "spall")); // default
  });
});

describe("ProjectConfigSchemaZod", () => {
  test("validates a complete project config", () => {
    const validConfig = {
      projects: ["project1", "project2"],
    };

    const result = ProjectConfigSchemaZod.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  test("rejects projects that are not an array", () => {
    const invalidConfig = {
      projects: "project1", // should be array
    };

    const result = ProjectConfigSchemaZod.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  test("rejects projects with non-string items", () => {
    const invalidConfig = {
      projects: ["project1", 123, "project3"],
    };

    const result = ProjectConfigSchemaZod.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  test("partial() allows partial project configs", () => {
    const emptyConfig = {};

    const result = ProjectConfigSchemaZod.partial().safeParse(emptyConfig);
    expect(result.success).toBe(true);
  });
});
