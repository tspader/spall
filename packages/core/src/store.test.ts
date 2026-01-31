import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Store } from "./store";
import { Config } from "./config";
import { Model } from "./model";
import { Sql } from "./sql";

describe("Store embeddings integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();
  });

  afterEach(() => {
    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("saveNoteEmbeddings stores vectors keyed by embedding id", () => {
    const db = Store.get();

    const inserted = db
      .prepare(Sql.INSERT_NOTE)
      .get(1, "hello.md", "hello", "hash", Date.now()) as { id: number };

    const vectors = [
      new Array(Sql.EMBEDDING_DIMS).fill(0.1),
      new Array(Sql.EMBEDDING_DIMS).fill(0.2),
    ];

    Store.saveNoteEmbeddings(
      inserted.id,
      [
        { text: "chunk a", pos: 0 },
        { text: "chunk b", pos: 10 },
      ],
      vectors,
    );

    const chunks = db
      .prepare(
        "SELECT id, note_id, seq, pos FROM embeddings WHERE note_id = ? ORDER BY seq",
      )
      .all(inserted.id) as {
      id: number;
      note_id: number;
      seq: number;
      pos: number;
    }[];

    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.seq)).toEqual([0, 1]);
    expect(chunks.map((c) => c.pos)).toEqual([0, 10]);

    for (const chunk of chunks) {
      const count = db
        .prepare("SELECT COUNT(*) as c FROM vectors WHERE key = ?")
        .get(String(chunk.id)) as { c: number };
      expect(count.c).toBe(1);
    }
  });

  test("saveNoteEmbeddings clears old vectors", () => {
    const db = Store.get();

    const inserted = db
      .prepare(Sql.INSERT_NOTE)
      .get(1, "hello.md", "hello", "hash", Date.now()) as { id: number };

    Store.saveNoteEmbeddings(
      inserted.id,
      [
        { text: "chunk a", pos: 0 },
        { text: "chunk b", pos: 10 },
      ],
      [
        new Array(Sql.EMBEDDING_DIMS).fill(0.1),
        new Array(Sql.EMBEDDING_DIMS).fill(0.2),
      ],
    );

    Store.saveNoteEmbeddings(
      inserted.id,
      [{ text: "chunk c", pos: 99 }],
      [new Array(Sql.EMBEDDING_DIMS).fill(0.3)],
    );

    const embeddingCount = db
      .prepare("SELECT COUNT(*) as c FROM embeddings WHERE note_id = ?")
      .get(inserted.id) as { c: number };
    expect(embeddingCount.c).toBe(1);

    const vectorCount = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorCount.c).toBe(1);
  });

  test("clearNoteEmbeddings removes embeddings and vectors", () => {
    const db = Store.get();

    const inserted = db
      .prepare(Sql.INSERT_NOTE)
      .get(1, "hello.md", "hello", "hash", Date.now()) as { id: number };

    Store.saveNoteEmbeddings(
      inserted.id,
      [{ text: "chunk a", pos: 0 }],
      [new Array(Sql.EMBEDDING_DIMS).fill(0.1)],
    );

    Store.clearNoteEmbeddings(inserted.id);

    const embeddingCount = db
      .prepare("SELECT COUNT(*) as c FROM embeddings WHERE note_id = ?")
      .get(inserted.id) as { c: number };
    expect(embeddingCount.c).toBe(0);

    const vectorCount = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorCount.c).toBe(0);
  });
});

describe("embedFiles clears old vectors on re-embed", () => {
  let tmpDir: string;
  let sourceDir: string;
  let originalLoad: typeof Model.load;
  let originalEmbedBatch: typeof Model.embedBatch;
  let originalTokenize: typeof Model.tokenize;
  let originalDetokenize: typeof Model.detokenize;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-embedfiles-test-"));
    sourceDir = join(tmpDir, "source");
    mkdirSync(sourceDir, { recursive: true });
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();

    originalLoad = Model.load;
    originalEmbedBatch = Model.embedBatch;
    originalTokenize = Model.tokenize;
    originalDetokenize = Model.detokenize;

    (Model as any).load = async () => {};
    (Model as any).embedBatch = async (texts: string[]) =>
      texts.map(() => new Array(Sql.EMBEDDING_DIMS).fill(0));
    // Return a short token array so chunk() produces a single chunk
    (Model as any).tokenize = async () => [0];
    (Model as any).detokenize = async () => "text";
  });

  afterEach(() => {
    (Model as any).load = originalLoad;
    (Model as any).embedBatch = originalEmbedBatch;
    (Model as any).tokenize = originalTokenize;
    (Model as any).detokenize = originalDetokenize;

    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("re-embedding a file replaces old vectors without leaking", async () => {
    const db = Store.get();

    writeFileSync(join(sourceDir, "a.md"), "original content");

    // First embed
    await Store.embedFiles(sourceDir, 1, ["a.md"], "");

    const vectorsBefore = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorsBefore.c).toBe(1);

    // Re-embed same file (simulates modified content)
    writeFileSync(join(sourceDir, "a.md"), "updated content");
    await Store.embedFiles(sourceDir, 1, ["a.md"], "");

    const vectorsAfter = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorsAfter.c).toBe(1);

    const embeddingsAfter = db
      .prepare("SELECT COUNT(*) as c FROM embeddings")
      .get() as { c: number };
    expect(embeddingsAfter.c).toBe(1);
  });
});
