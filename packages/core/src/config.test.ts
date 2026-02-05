import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import {
  Config,
  type ConfigSchema,
  ConfigSchemaZod,
  WorkspaceConfigSchemaZod,
  WorkspaceConfig,
} from "./config";

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

describe("WorkspaceConfigSchemaZod", () => {
  test("validates a complete workspace config", () => {
    const validConfig = {
      workspace: { name: "repo", id: 123 },
      scope: { read: ["default", "docs"], write: "docs" },
    };

    const result = WorkspaceConfigSchemaZod.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  test("allows omitting cached workspace id", () => {
    const validConfig = {
      workspace: { name: "repo" },
      scope: { read: ["default"], write: "default" },
    };

    const result = WorkspaceConfigSchemaZod.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  test("rejects scope.read that is not an array", () => {
    const invalidConfig = {
      workspace: { name: "repo" },
      scope: { read: "default", write: "default" },
    };

    const result = WorkspaceConfigSchemaZod.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  test("rejects scope.read with non-string items", () => {
    const invalidConfig = {
      workspace: { name: "repo" },
      scope: { read: ["default", 123, "docs"], write: "default" },
    };

    const result = WorkspaceConfigSchemaZod.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  test("partial() allows partial workspace configs", () => {
    const emptyConfig = {};

    const result = WorkspaceConfigSchemaZod.partial().safeParse(emptyConfig);
    expect(result.success).toBe(true);
  });
});

describe("WorkspaceConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spall-workspace-config-test-"));
    WorkspaceConfig.reset();
  });

  afterEach(() => {
    WorkspaceConfig.reset();
    rmSync(dir, { recursive: true, force: true });
  });

  test("locate() finds repo root containing .spall", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    mkdirSync(join(dir, "a", "b"), { recursive: true });

    const located = WorkspaceConfig.locate(join(dir, "a", "b"));
    expect(located).not.toBeNull();
    expect(located!.root).toBe(dir);
    expect(located!.path).toBe(join(dir, ".spall", "spall.json"));
  });

  test("load() reads workspace identity and scope", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 123 },
          scope: { read: ["default", "docs"], write: "docs" },
        },
        null,
        2,
      ),
    );

    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("repo");
    expect(cfg.workspace.id).toBe(123);
    expect(cfg.scope.read).toEqual(["default", "docs"]);
    expect(cfg.scope.write).toBe("docs");
  });

  test("patch() updates file and cache coherently", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 111 },
          scope: { read: ["default"], write: "default" },
        },
        null,
        2,
      ),
    );

    WorkspaceConfig.patch(dir, { workspace: { id: 222 } });
    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("repo");
    expect(cfg.workspace.id).toBe(222);
    expect(cfg.scope.read).toEqual(["default"]);
    expect(cfg.scope.write).toBe("default");
  });

  test("load() uses defaults when no workspace found", () => {
    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("default");
    expect(cfg.workspace.id).toBeUndefined();
    expect(cfg.scope.read).toEqual(["default"]);
    expect(cfg.scope.write).toBe("default");
  });

  test("load() maps legacy include to scope.read and scope.write", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 123 },
          include: ["default", "docs"],
        },
        null,
        2,
      ),
    );

    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.scope.read).toEqual(["default", "docs"]);
    expect(cfg.scope.write).toBe("default");
  });
});
