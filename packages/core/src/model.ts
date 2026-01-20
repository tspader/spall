import {
  getLlama,
  createModelDownloader,
  LlamaLogLevel,
  type Llama,
  type LlamaModel,
  type LlamaEmbeddingContext,
  type ModelDownloader,
} from "node-llama-cpp";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
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
    path: string | null;
    status: Status;
    model: LlamaModel | null;
  };

  export type Embedder = {
    instance: Instance;
    context: LlamaEmbeddingContext | null;
  };

  export type Reranker = {
    instance: Instance;
  };

  let config: Config | null = null;
  let embedder: Embedder | null = null;
  let reranker!: Reranker;
  let llama: Llama | null = null;

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

  async function createDownloader(modelUri: string): Promise<ModelDownloader> {
    ensureCacheDir();
    return createModelDownloader({
      modelUri,
      dirPath: MODEL_CACHE_DIR,
    });
  }

  export function init(cfg?: Partial<Config>): void {
    if (config) return;

    config = {
      embeddingModel: cfg?.embeddingModel ?? DEFAULT_EMBED_MODEL,
      rerankerModel: cfg?.rerankerModel ?? DEFAULT_RERANK_MODEL,
    };

    embedder = {
      instance: { name: "", path: null, status: "pending", model: null },
      context: null,
    };
    reranker = {
      instance: { name: "", path: null, status: "pending", model: null },
    };
  }

  export async function download(): Promise<void> {
    // Download embedding model
    const embedDownloader = await createDownloader(config!.embeddingModel);
    const embedName = embedDownloader.entrypointFilename;
    embedder!.instance.name = embedName;

    if (embedDownloader.downloadedSize < embedDownloader.totalSize) {
      Event.emit({ tag: "model", action: "download", model: embedName });
    }
    embedder!.instance.path = await embedDownloader.download();
    embedder!.instance.status = "downloaded";
    Event.emit({ tag: "model", action: "ready", model: embedName });

    // Download reranker model
    const rerankDownloader = await createDownloader(config!.rerankerModel);
    const rerankName = rerankDownloader.entrypointFilename;
    reranker.instance.name = rerankName;

    if (rerankDownloader.downloadedSize < rerankDownloader.totalSize) {
      Event.emit({ tag: "model", action: "download", model: rerankName });
    }
    reranker.instance.path = await rerankDownloader.download();
    reranker.instance.status = "downloaded";
    Event.emit({ tag: "model", action: "ready", model: rerankName });
  }

  export async function load(): Promise<void> {
    if (!embedder!.instance.path) {
      throw new Error("Model not downloaded. Call Model.download() first.");
    }
    if (!embedder!.instance.model) {
      const l = await ensureLlama();
      embedder!.instance.model = await l.loadModel({
        modelPath: embedder!.instance.path,
      });
    }
    if (!embedder!.context) {
      embedder!.context =
        await embedder!.instance.model.createEmbeddingContext();
    }
  }

  export async function embed(text: string): Promise<number[]> {
    const result = await embedder!.context!.getEmbeddingFor(text);
    return Array.from(result.vector);
  }

  export async function embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(async (text) => {
        const result = await embedder!.context!.getEmbeddingFor(text);
        return Array.from(result.vector);
      }),
    );
    return embeddings;
  }

  export async function dispose(): Promise<void> {
    if (embedder?.context) {
      await embedder.context.dispose();
      embedder.context = null;
    }
    if (embedder?.instance.model) {
      await embedder.instance.model.dispose();
      embedder.instance.model = null;
    }
    if (reranker?.instance?.model) {
      await reranker.instance.model.dispose();
      reranker.instance.model = null;
    }
    if (llama) {
      await llama.dispose();
      llama = null;
    }
    config = null;
    embedder = null;
    reranker = undefined!;
  }
}
