import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".config", "spall", "spall.json");
const PROJECT_CONFIG_NAME = ".spall/spall.json";

export type ConfigSchema = {
  dirs: {
    cache: string;
    data: string;
  };
  models: {
    embedding: string;
    reranker: string;
  };
  server: {
    idleTimeout: number;
  };
};

export type PartialConfig = {
  dirs?: Partial<ConfigSchema["dirs"]>;
  models?: Partial<ConfigSchema["models"]>;
  server?: Partial<ConfigSchema["server"]>;
};

export type ProjectConfigSchema = {
  projects: string[];
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
  };
}

function getProjectDefaults(): ProjectConfigSchema {
  return {
    projects: ["default"],
  };
}

export namespace Config {
  let config: ConfigSchema | null = null;

  export function set(values: PartialConfig): void {
    const defaults = getDefaults();
    config = {
      dirs: { ...defaults.dirs, ...values.dirs },
      models: { ...defaults.models, ...values.models },
      server: { ...defaults.server, ...values.server },
    };
  }

  export function load(): ConfigSchema {
    if (config) return config;

    let fileConfig: PartialConfig = {};
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      // File doesn't exist or invalid JSON - use defaults
    }

    set(fileConfig);
    return config!;
  }

  export function get(): ConfigSchema {
    return load();
  }

  export function reset(): void {
    config = null;
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
        const fileConfig: PartialProjectConfig = JSON.parse(
          readFileSync(configPath, "utf-8"),
        );
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
