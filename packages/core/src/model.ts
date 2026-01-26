import {
  getLlama,
  createModelDownloader,
  LlamaLogLevel,
  type Llama,
  type LlamaModel,
  type LlamaEmbeddingContext,
  type Token,
} from "node-llama-cpp";

import z from "zod";

export type { Token };
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { Bus } from "./event";
import { Config } from "./config";


export namespace Model {
  export const Info = z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
  });
  export type Info = z.infer<typeof Info>;

  export const Event = {
    Download: Bus.define("model.download", {
      info: Info,
    }),
    Progress: Bus.define("model.progress", {
      info: Info,
      downloaded: z.number(),
      total: z.number(),
    }),
    Downloaded: Bus.define("model.downloaded", {
      info: Info,
    }),
    Load: Bus.define("model.load", {
      info: Info,
    }),
  };

  function modelCacheDir(): string {
    return join(Config.get().dirs.cache, "models");
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

  export const fakeDownload = async () => {
    const totalTime = 3;
    const numIter = 50;
    const timePerIter = (totalTime * 1000) / numIter;

    await Bus.publish({
      tag: "model.download",
      info: {
        id: 0,
        name: `${totalTime}s_download_model.gguf`,
        path: "/foo/bar",
      },
    });

    for (let i = 0; i < numIter; i++) {
      await Bus.publish({
        tag: "model.progress",
        info: {
          id: 0,
          name: `${totalTime}s_download_model.gguf`,
          path: "/foo/bar",
        },
        downloaded: i * timePerIter,
        total: totalTime * 1000,
      });

      await Bun.sleep(timePerIter);
    }

    await Bus.publish({
      tag: "model.downloaded",
      info: {
        id: 0,
        name: `${totalTime}s_download_model.gguf`,
        path: "/foo/bar",
      },
    });
  };

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

  export async function download(): Promise<void> {
    if (!initialized) {
      initialized = true;
      embedder = {
        instance: { name: "", path: null, status: "pending", model: null },
        context: null,
      };
      reranker = {
        instance: { name: "", path: null, status: "pending", model: null },
      };
    }

    // Already downloaded
    if (embedder.instance.path) return;

    ensureCacheDir();

    type DownloadWork = {
      instance: Instance;
      uri: string;
    };

    const config = Config.get();

    const work: DownloadWork[] = [
      {
        instance: embedder.instance,
        uri: config.models.embedding,
      },
      {
        instance: reranker.instance,
        uri: config.models.reranker,
      },
    ];

    for (const { instance, uri } of work) {
      instance.name = uri.split("/").pop()!;

      const downloader = await createModelDownloader({
        modelUri: uri,
        dirPath: modelCacheDir(),
        onProgress: ({ totalSize, downloadedSize }) => {
          if (totalSize != downloadedSize) {
            Bus.publish({
              tag: "model.progress",
              info: {
                id: 0,
                name: instance.name,
                path: instance.path!,
              },
              downloaded: downloadedSize,
              total: totalSize,
            });
          }
        },
      });

      const needDownload = downloader.downloadedSize < downloader.totalSize;
      if (needDownload) {
        await Bus.publish({
          tag: "model.download",
          info: {
            id: 0,
            name: instance.name,
            path: instance.path!,
          },
        });
      }

      instance.path = await downloader.download();
      instance.status = "downloaded";

      if (needDownload) {
        await Bus.publish({
          tag: "model.downloaded",
          info: {
            id: 0,
            name: instance.name,
            path: instance.path!,
          },
        });
      }
    }
  }

  export async function load(): Promise<void> {
    await download();

    if (!embedder.instance.path) {
      throw new Error("Model not downloaded");
    }

    if (!embedder.instance.model) {
      await Bus.publish({
        tag: "model.load",
        info: {
          id: 0,
          name: embedder.instance.name,
          path: embedder.instance.path!,
        },
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
