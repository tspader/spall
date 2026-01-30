import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Store } from "./store";
import { Config } from "./config";
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
