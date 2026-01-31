import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

const CONFIG_PATH = join(homedir(), ".config", "spall", "spall.json");
const PROJECT_CONFIG_NAME = ".spall/spall.json";

// Zod schemas for runtime validation
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

export const ProjectConfigSchemaZod = z.object({
  projects: z.array(z.string()).describe("List of project names"),
});

// TypeScript types inferred from Zod schemas
export type ConfigSchema = z.infer<typeof ConfigSchemaZod>;
export type ProjectConfigSchema = z.infer<typeof ProjectConfigSchemaZod>;

// Partial types for the set() functions
export type PartialConfig = {
  dirs?: Partial<ConfigSchema["dirs"]>;
  models?: Partial<ConfigSchema["models"]>;
  server?: Partial<ConfigSchema["server"]>;
  embedding?: Partial<ConfigSchema["embedding"]>;
};

export type PartialProjectConfig = {
  projects?: string[];
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

function getProjectDefaults(): ProjectConfigSchema {
  return {
    projects: ["default"],
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

export namespace ProjectConfig {
  let config: ProjectConfigSchema | null = null;
  let loadedFrom: string | null = null;

  export function path(root: string): string {
    return join(root, PROJECT_CONFIG_NAME);
  }

  export function load(root: string): ProjectConfigSchema {
    if (config && loadedFrom === root) return config;

    const defaults = getProjectDefaults();
    const configPath = path(root);

    try {
      if (existsSync(configPath)) {
        const rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
        // Validate using Zod
        const fileConfig: PartialProjectConfig =
          ProjectConfigSchemaZod.partial().parse(rawConfig);
        config = {
          projects: fileConfig.projects ?? defaults.projects,
        };
      } else {
        config = defaults;
      }
    } catch {
      config = defaults;
    }

    loadedFrom = root;
    return config;
  }

  export function get(root: string): ProjectConfigSchema {
    return load(root);
  }

  export function reset(): void {
    config = null;
    loadedFrom = null;
  }
}
