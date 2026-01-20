import {
  getLlama,
  resolveModelFile,
  LlamaLogLevel,
  type Llama,
  type LlamaModel,
  type LlamaEmbeddingContext,
} from "node-llama-cpp";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { Event } from "./event";

export namespace Model {
  const DEFAULT_EMBED_MODEL =
    "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";
  const DEFAULT_RERANK_MODEL =
    "hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf";
  const MODEL_CACHE_DIR = join(homedir(), ".cache", "spall", "models");

  export type Config = {
    embeddingModel: string;
    rerankerModel: string;
  };

  export type Status = "pending" | "downloaded";

  export type Instance = {
    name: string;
    friendlyName: string;
    url: string;
    path: string | null;
    status: Status;
  };

  type ParsedUri = {
    file: string;
    friendlyName: string;
    url: string;
    localPath: string;
  };

  let config: Config | null = null;
  let embeddingInstance: Instance | null = null;
  let rerankerInstance: Instance | null = null;
  let llama: Llama | null = null;
  let embedModel: LlamaModel | null = null;
  let embedContext: LlamaEmbeddingContext | null = null;

  function ensureCacheDir(): void {
    if (!existsSync(MODEL_CACHE_DIR)) {
      mkdirSync(MODEL_CACHE_DIR, { recursive: true });
    }
  }

  async function ensureLlama(): Promise<Llama> {
    if (!llama) {
      llama = await getLlama({ logLevel: LlamaLogLevel.error });
    }
    return llama;
  }

  function parseUri(uri: string): ParsedUri {
    if (uri.startsWith("hf:")) {
      const parts = uri.slice(3).split("/");
      const file = parts[parts.length - 1] ?? "unknown";
      return {
        file,
        friendlyName: file.replace(".gguf", ""),
        url: `https://huggingface.co/${parts[0]}/${parts[1]}/resolve/main/${file}`,
        localPath: join(MODEL_CACHE_DIR, file),
      };
    }
    return {
      file: uri.split("/").pop() ?? uri,
      friendlyName: uri,
      url: uri,
      localPath: uri,
    };
  }

  function createInstance(uri: string): Instance {
    const parsed = parseUri(uri);
    const localPath = existsSync(parsed.localPath) ? parsed.localPath : null;

    return {
      name: parsed.file,
      friendlyName: parsed.friendlyName,
      url: parsed.url,
      path: localPath,
      status: localPath ? "downloaded" : "pending",
    };
  }

  export function init(cfg?: Partial<Config>): void {
    if (config) return;

    config = {
      embeddingModel: cfg?.embeddingModel ?? DEFAULT_EMBED_MODEL,
      rerankerModel: cfg?.rerankerModel ?? DEFAULT_RERANK_MODEL,
    };

    embeddingInstance = createInstance(config.embeddingModel);
    rerankerInstance = createInstance(config.rerankerModel);
  }

  export function embedding(): Instance {
    if (!embeddingInstance) {
      init();
    }
    return embeddingInstance!;
  }

  export function reranker(): Instance {
    if (!rerankerInstance) {
      init();
    }
    return rerankerInstance!;
  }

  export async function ensureEmbedding(): Promise<string> {
    if (!config) init();
    ensureCacheDir();
    Event.emit({
      tag: "model",
      action: "download",
      model: embeddingInstance!.friendlyName,
    });
    const path = await resolveModelFile(
      config!.embeddingModel,
      MODEL_CACHE_DIR,
    );
    embeddingInstance!.path = path;
    embeddingInstance!.status = "downloaded";
    Event.emit({
      tag: "model",
      action: "ready",
      model: embeddingInstance!.friendlyName,
    });
    return path;
  }

  export async function ensureReranker(): Promise<string> {
    if (!config) init();
    ensureCacheDir();
    Event.emit({
      tag: "model",
      action: "download",
      model: rerankerInstance!.friendlyName,
    });
    const path = await resolveModelFile(config!.rerankerModel, MODEL_CACHE_DIR);
    rerankerInstance!.path = path;
    rerankerInstance!.status = "downloaded";
    Event.emit({
      tag: "model",
      action: "ready",
      model: rerankerInstance!.friendlyName,
    });
    return path;
  }

  export async function embed(text: string): Promise<number[]> {
    if (!embedModel) {
      const path = await ensureEmbedding();
      const l = await ensureLlama();
      embedModel = await l.loadModel({ modelPath: path });
    }
    if (!embedContext) {
      embedContext = await embedModel.createEmbeddingContext();
    }

    const result = await embedContext.getEmbeddingFor(text);
    return Array.from(result.vector);
  }

  export async function dispose(): Promise<void> {
    if (embedContext) {
      await embedContext.dispose();
      embedContext = null;
    }
    if (embedModel) {
      await embedModel.dispose();
      embedModel = null;
    }
    if (llama) {
      await llama.dispose();
      llama = null;
    }
    config = null;
    embeddingInstance = null;
    rerankerInstance = null;
  }
}
