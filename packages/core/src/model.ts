import {
  getLlama,
  createModelDownloader,
  LlamaLogLevel,
  type Llama,
  type LlamaModel,
  type LlamaEmbeddingContext,
  type ModelDownloader,
  type Token,
} from "node-llama-cpp";

export type { Token };
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { Event } from "./event";
import { Config } from "./config";

export namespace Model {
  function modelCacheDir(): string {
    return join(Config.get().cacheDir, "models");
  }

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

  let initialized = false;
  let embedder: Embedder;
  let reranker!: Reranker;
  let llama: Llama | null = null;

  function ensureCacheDir(): void {
    const dir = modelCacheDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
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
      dirPath: modelCacheDir(),
    });
  }

  export function init(): void {
    if (initialized) return;
    initialized = true;

    embedder = {
      instance: { name: "", path: null, status: "pending", model: null },
      context: null,
    };
    reranker = {
      instance: { name: "", path: null, status: "pending", model: null },
    };
  }

  export async function download(): Promise<void> {
    type DownloadWork = {
      instance: Instance;
      downloader: ModelDownloader;
      uri: string;
    };

    const cfg = Config.get();
    const work: DownloadWork[] = [
      {
        instance: embedder.instance,
        downloader: await createDownloader(cfg.embeddingModel),
        uri: cfg.embeddingModel,
      },
      {
        instance: reranker.instance,
        downloader: await createDownloader(cfg.rerankerModel),
        uri: cfg.rerankerModel,
      },
    ];

    for (const { instance, downloader, uri } of work) {
      instance.name = uri.split("/").pop()!;

      const needDownload = downloader.downloadedSize < downloader.totalSize;
      if (needDownload) {
        Event.emit({ tag: "model", action: "download", model: instance.name });
      }

      instance.path = await downloader.download();
      instance.status = "downloaded";

      Event.emit({ tag: "model", action: "ready", model: instance.name });
    }
  }

  export async function load(): Promise<void> {
    if (!embedder.instance.path) {
      throw new Error("Model not downloaded. Call Model.download() first.");
    }

    if (!embedder.instance.model) {
      Event.emit({
        tag: "model",
        action: "load",
        model: embedder.instance.name,
        path: embedder.instance.path,
      });
      const llama = await ensureLlama();
      embedder.instance.model = await llama.loadModel({
        modelPath: embedder.instance.path,
      });
    }

    if (!embedder.context) {
      embedder.context = await embedder.instance.model.createEmbeddingContext();
    }
  }

  export async function embed(text: string): Promise<number[]> {
    const result = await embedder.context!.getEmbeddingFor(text);
    return Array.from(result.vector);
  }

  export async function embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(async (text) => {
        const result = await embedder.context!.getEmbeddingFor(text);
        return Array.from(result.vector);
      }),
    );
    return embeddings;
  }

  export async function tokenize(text: string): Promise<Token[]> {
    if (!embedder?.instance.model) {
      throw new Error("Model not loaded. Call Model.load() first.");
    }
    return [...embedder.instance.model.tokenize(text)];
  }

  export async function detokenize(tokens: Token[]): Promise<string> {
    if (!embedder?.instance.model) {
      throw new Error("Model not loaded. Call Model.load() first.");
    }
    return embedder.instance.model.detokenize(tokens);
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
    initialized = false;
    embedder = undefined!;
    reranker = undefined!;
  }
}
