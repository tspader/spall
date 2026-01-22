import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".config", "spall", "spall.json");

export type ConfigSchema = {
  cacheDir: string;
  embeddingModel: string;
  rerankerModel: string;
};

const DEFAULTS: ConfigSchema = {
  cacheDir: join(homedir(), ".cache", "spall"),
  embeddingModel:
    "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf",
  rerankerModel:
    "hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf",
};

export namespace Config {
  let config: ConfigSchema | null = null;

  export function set(values: Partial<ConfigSchema>): void {
    config = { ...DEFAULTS, ...values };
  }

  export function load(): ConfigSchema {
    if (config) return config;

    let fileConfig: Partial<ConfigSchema> = {};
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
