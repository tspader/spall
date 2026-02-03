import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import type { Database } from "bun:sqlite";

import { Config } from "./config";
import { Store } from "./store";
import { Sql } from "./sql";
import { Model } from "./model";

export type Patch = () => void;

export function patch<TObj extends object, K extends keyof TObj>(
  obj: TObj,
  key: K,
  value: TObj[K],
): Patch {
  const original = obj[key];
  obj[key] = value;
  return () => {
    obj[key] = original;
  };
}

export function stubModelForEmbedding(options?: {
  dims?: number;
  tokenize?: typeof Model.tokenize;
  detokenize?: typeof Model.detokenize;
  embedBatch?: typeof Model.embedBatch;
}): Patch {
  const unpatches: Patch[] = [];

  unpatches.push(patch(Model as any, "load", async () => {}));

  unpatches.push(
    patch(
      Model as any,
      "embedBatch",
      options?.embedBatch ??
        (async (texts: string[]) =>
          texts.map(() =>
            new Array(options?.dims ?? Sql.EMBEDDING_DIMS).fill(0),
          )),
    ),
  );

  // Default to a single chunk from Store.chunk()
  unpatches.push(
    patch(Model as any, "tokenize", options?.tokenize ?? (async () => [0])),
  );
  unpatches.push(
    patch(
      Model as any,
      "detokenize",
      options?.detokenize ?? (async () => "text"),
    ),
  );

  return () => {
    for (const unpatch of unpatches.reverse()) unpatch();
  };
}

export async function withTempSpallEnv<T>(
  fn: (ctx: { tmpDir: string; db: Database }) => Promise<T> | T,
): Promise<T> {
  const tmpDir = mkdtempSync(join(tmpdir(), "spall-test-"));
  Config.reset();
  Config.set({
    dirs: { cache: tmpDir, data: tmpDir },
    models: { embedding: "", reranker: "" },
  });
  Store.ensure();

  try {
    return await fn({ tmpDir, db: Store.get() });
  } finally {
    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  }
}

export function writeFiles(
  baseDir: string,
  files: Record<string, string>,
): void {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(baseDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
}

export function touch(absPath: string, mtimeMs: number): void {
  const d = new Date(mtimeMs);
  utimesSync(absPath, d, d);
}

export function count(db: Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as {
    c: number;
  };
  return row.c;
}
