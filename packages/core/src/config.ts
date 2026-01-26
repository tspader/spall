import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".config", "spall", "spall.json");

export type ConfigSchema = {
  dirs: {
    cache: string;
    data: string;
  };
  models: {
    embedding: string;
    reranker: string;
  };
};

export type PartialConfig = {
  dirs?: Partial<ConfigSchema["dirs"]>;
  models?: Partial<ConfigSchema["models"]>;
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
  };
}

export namespace Config {
  let config: ConfigSchema | null = null;

  export function set(values: PartialConfig): void {
    const defaults = getDefaults();
    config = {
      dirs: { ...defaults.dirs, ...values.dirs },
      models: { ...defaults.models, ...values.models },
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
