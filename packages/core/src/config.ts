import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join, resolve } from "path";
import { z } from "zod";

const CONFIG_PATH = join(homedir(), ".config", "spall", "spall.json");
const WORKSPACE_CONFIG_NAME = ".spall/spall.json";

export const ConfigSchemaZod = z.object({
  dirs: z.object({
    cache: z
      .string()
      .describe("Directory for cached data like downloaded models"),
    data: z.string().describe("Directory for persistent data like databases"),
  }),
  models: z.object({
    embedding: z
      .string()
      .describe(
        "Model URI for embeddings (e.g., hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf)",
      ),
    reranker: z
      .string()
      .describe(
        "Model URI for reranking (e.g., hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf)",
      ),
  }),
  server: z.object({
    idleTimeout: z
      .number()
      .describe(
        "Minutes to wait after last client disconnects before shutting down",
      ),
  }),
  embedding: z.object({
    poolSize: z.number().describe("Number of concurrent embedding operations"),
  }),
});

export const WorkspaceConfigSchemaZod = z.object({
  workspace: z.object({
    name: z.string().describe("Workspace name"),
    id: z.number().int().positive().optional().describe("Cached workspace ID"),
  }),
  scope: z.object({
    read: z.array(z.string()).describe("List of corpora used for reads"),
    write: z.string().describe("Default corpus used for writes"),
  }),
});

// TypeScript types inferred from Zod schemas
export type ConfigSchema = z.infer<typeof ConfigSchemaZod>;
export type WorkspaceConfigSchema = z.infer<typeof WorkspaceConfigSchemaZod>;

// Partial types for the set() functions
export type PartialConfig = {
  dirs?: Partial<ConfigSchema["dirs"]>;
  models?: Partial<ConfigSchema["models"]>;
  server?: Partial<ConfigSchema["server"]>;
  embedding?: Partial<ConfigSchema["embedding"]>;
};

export type PartialWorkspaceConfig = {
  workspace?: {
    name?: string;
    id?: number;
  };
  scope?: {
    read?: string[];
    write?: string;
  };
};

type PartialWorkspaceFileConfig = PartialWorkspaceConfig & {
  include?: string[];
};

function getDefaults(): ConfigSchema {
  return {
    dirs: {
      cache: process.env.SPALL_CACHE_DIR ?? join(homedir(), ".cache", "spall"),
      data:
        process.env.SPALL_DATA_DIR ??
        join(homedir(), ".local", "share", "spall"),
    },
    models: {
      embedding:
        "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf",
      reranker:
        "hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf",
    },
    server: {
      idleTimeout: 1,
    },
    embedding: {
      poolSize: 4,
    },
  };
}

function getWorkspaceDefaults(): WorkspaceConfigSchema {
  return {
    workspace: {
      name: "default",
      id: undefined,
    },
    scope: {
      read: ["default"],
      write: "default",
    },
  };
}

export namespace Config {
  let config: ConfigSchema | null = null;
  let customConfigPath: string | null = null;

  // For testing only - allows overriding the config file path
  export function _setConfigPath(path: string | null): void {
    customConfigPath = path;
  }

  function getConfigPath(): string {
    return customConfigPath ?? CONFIG_PATH;
  }

  export function set(values: PartialConfig): void {
    const defaults = getDefaults();
    config = {
      dirs: { ...defaults.dirs, ...values.dirs },
      models: { ...defaults.models, ...values.models },
      server: { ...defaults.server, ...values.server },
      embedding: { ...defaults.embedding, ...values.embedding },
    };
  }

  export function load(): ConfigSchema {
    if (config) return config;

    let fileConfig: PartialConfig = {};
    try {
      const rawConfig = JSON.parse(readFileSync(getConfigPath(), "utf-8"));
      // Validate the config file using Zod
      fileConfig = ConfigSchemaZod.partial().parse(rawConfig);
    } catch {
      // File doesn't exist, invalid JSON, or validation failed - use defaults
    }

    set(fileConfig);
    return config!;
  }

  export function get(): ConfigSchema {
    return load();
  }

  export function reset(): void {
    config = null;
    customConfigPath = null;
  }
}

export namespace WorkspaceConfig {
  let config: WorkspaceConfigSchema | null = null;
  let loadedFrom: string | null = null;

  export type Located = {
    root: string;
    path: string;
  };

  export function path(root: string): string {
    return join(root, WORKSPACE_CONFIG_NAME);
  }

  export function findRoot(start: string): string | null {
    let dir = resolve(start);
    while (true) {
      // prefer an explicit workspace config file, but allow a bare `.spall/` dir
      // so callers can create `.spall/spall.json` on-demand.
      if (existsSync(path(dir)) || existsSync(join(dir, ".spall"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  export function locate(start: string): Located | null {
    const root = findRoot(start);
    if (!root) return null;
    return { root, path: path(root) };
  }

  export function write(root: string, next: WorkspaceConfigSchema): void {
    const configPath = path(root);
    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  }

  export function patch(root: string, values: PartialWorkspaceConfig): void {
    const current = load(root);
    const next: WorkspaceConfigSchema = {
      workspace: {
        name: values.workspace?.name ?? current.workspace.name,
        id: values.workspace?.id ?? current.workspace.id,
      },
      scope: {
        read: values.scope?.read ?? current.scope.read,
        write: values.scope?.write ?? current.scope.write,
      },
    };
    write(root, next);
    // keep cache coherent
    config = next;
    loadedFrom = root;
  }

  export function load(start: string): WorkspaceConfigSchema {
    const located = locate(start);
    const root = located?.root ?? resolve(start);
    if (config && loadedFrom === root) return config;

    const defaults = getWorkspaceDefaults();

    // No workspace found (no `.spall/` found). Use defaults and don't try to
    // infer names from arbitrary directories.
    if (!located) {
      config = defaults;
      loadedFrom = root;
      return config;
    }

    const configPath = path(root);

    try {
      if (existsSync(configPath)) {
        const rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
        // Validate using Zod. Accept legacy `include` shape for backwards compatibility.
        const fileConfig: PartialWorkspaceFileConfig = z
          .object({
            workspace: WorkspaceConfigSchemaZod.shape.workspace
              .partial()
              .optional(),
            scope: WorkspaceConfigSchemaZod.shape.scope.partial().optional(),
            include: z.array(z.string()).optional(),
          })
          .partial()
          .parse(rawConfig);

        const read =
          fileConfig.scope?.read ?? fileConfig.include ?? defaults.scope.read;
        const write =
          fileConfig.scope?.write ?? read[0] ?? defaults.scope.write;

        config = {
          workspace: {
            name:
              fileConfig.workspace?.name ??
              basename(root) ??
              defaults.workspace.name,
            id: fileConfig.workspace?.id,
          },
          scope: { read, write },
        };
      } else {
        config = {
          workspace: {
            name: basename(root) ?? defaults.workspace.name,
            id: undefined,
          },
          scope: defaults.scope,
        };
      }
    } catch {
      config = {
        workspace: {
          name: basename(root) ?? defaults.workspace.name,
          id: undefined,
        },
        scope: defaults.scope,
      };
    }

    loadedFrom = root;
    return config;
  }

  export function get(start: string): WorkspaceConfigSchema {
    return load(start);
  }

  export function reset(): void {
    config = null;
    loadedFrom = null;
  }
}
