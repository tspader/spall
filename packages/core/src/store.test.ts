import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Config } from "./config";
import { Store } from "./store";
import { Sql } from "./sql";
import {
  withTempSpallEnv,
  count,
  stubModelForEmbedding,
  touch,
} from "./harness";
import { Io } from "./io";

describe("Store schema migration", () => {
  test("ensure adds notes.size and backfills existing rows", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "spall-migrate-test-"));
    Config.reset();
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });

    const dbPath = join(tmpDir, "spall.db");
    const legacy = new Database(dbPath);
    legacy.run(`
      CREATE TABLE corpora (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    legacy.run(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        corpus_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        FOREIGN KEY (corpus_id) REFERENCES corpora(id),
        UNIQUE (corpus_id, path)
      )
    `);
    legacy.run(
      "INSERT INTO corpora (id, name, created_at, updated_at) VALUES (1, 'default', 0, 0)",
    );
    legacy.run(
      "INSERT INTO notes (corpus_id, path, content, content_hash, mtime) VALUES (1, 'a.md', 'alpha', 'hash', 0)",
    );
    legacy.close();

    try {
      Store.ensure();
      const db = Store.get();
      const row = db
        .prepare("SELECT size FROM notes WHERE path = ?")
        .get("a.md") as {
        size: number;
      };
      expect(row.size).toBe(5);
    } finally {
      Store.close();
      Config.reset();
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("Store embeddings integration", () => {
  test("saveNoteEmbeddings stores vectors keyed by embedding id", () => {
    return withTempSpallEnv(({ db }) => {
      const inserted = db
        .prepare(Sql.INSERT_NOTE)
        .get(1, "hello.md", "hello", 5, "hash", Date.now()) as { id: number };

      const vectors = [
        new Array(Sql.EMBEDDING_DIMS).fill(0.1),
        new Array(Sql.EMBEDDING_DIMS).fill(0.2),
      ];

      Store.saveEmbeddings(
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
        const row = db
          .prepare("SELECT COUNT(*) as c FROM vectors WHERE key = ?")
          .get(String(chunk.id)) as { c: number };
        expect(row.c).toBe(1);
      }
    });
  });

  test("saveNoteEmbeddings clears old vectors", () => {
    return withTempSpallEnv(({ db }) => {
      const inserted = db
        .prepare(Sql.INSERT_NOTE)
        .get(1, "hello.md", "hello", 5, "hash", Date.now()) as { id: number };

      Store.saveEmbeddings(
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

      Store.saveEmbeddings(
        inserted.id,
        [{ text: "chunk c", pos: 99 }],
        [new Array(Sql.EMBEDDING_DIMS).fill(0.3)],
      );

      const embeddingCount = db
        .prepare("SELECT COUNT(*) as c FROM embeddings WHERE note_id = ?")
        .get(inserted.id) as { c: number };
      expect(embeddingCount.c).toBe(1);

      expect(count(db, "vectors")).toBe(1);
    });
  });
});

describe("embedFiles clears old vectors on re-embed", () => {
  test("re-embedding a file replaces old vectors without leaking", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const unpatchModel = stubModelForEmbedding();
      try {
        const sourceDir = join(tmpDir, "source");
        mkdirSync(sourceDir, { recursive: true });

        writeFileSync(join(sourceDir, "a.md"), "original content");

        // First scan + embed
        const firstScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        await Store.embedFiles(firstScan.unembedded);

        expect(count(db, "vectors")).toBe(1);

        // Re-embed same file (simulates modified content)
        writeFileSync(join(sourceDir, "a.md"), "updated content");
        const secondScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        await Store.embedFiles(secondScan.unembedded);

        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);
      } finally {
        unpatchModel();
      }
    });
  });

  test("scan updates mtime even when content unchanged", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const sourceDir = join(tmpDir, "source");
      mkdirSync(sourceDir, { recursive: true });

      const abs = join(sourceDir, "a.md");
      writeFileSync(abs, "same content");

      const firstScan = await Store.scan(sourceDir, "**/*.md", 1, "");
      expect(firstScan.added).toHaveLength(1);
      expect(firstScan.modified).toHaveLength(0);
      expect(firstScan.removed).toHaveLength(0);

      const noteId = firstScan.unembedded[0]!;
      const before = db.prepare(Sql.GET_NOTE).get(noteId) as {
        id: number;
        mtime: number;
        content_hash: string;
      };

      // Touch file without changing contents
      const bumped = before.mtime + 2000;
      touch(abs, bumped);
      Io.clear();

      const secondScan = await Store.scan(sourceDir, "**/*.md", 1, "");
      expect(secondScan.added).toHaveLength(0);
      expect(secondScan.modified).toHaveLength(0);
      expect(secondScan.removed).toHaveLength(0);

      const after = db.prepare(Sql.GET_NOTE).get(noteId) as {
        id: number;
        mtime: number;
        content_hash: string;
      };

      expect(after.content_hash).toBe(before.content_hash);
      expect(after.mtime).toBeGreaterThan(before.mtime);
    });
  });

  test("touching a file does not clear embeddings or requeue", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const unpatchModel = stubModelForEmbedding();
      try {
        const sourceDir = join(tmpDir, "source");
        mkdirSync(sourceDir, { recursive: true });

        const abs = join(sourceDir, "a.md");
        writeFileSync(abs, "same content");

        const firstScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        await Store.embedFiles(firstScan.unembedded);

        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);

        const noteId = firstScan.unembedded[0]!;
        const before = db.prepare(Sql.GET_NOTE).get(noteId) as {
          mtime: number;
        };

        touch(abs, before.mtime + 2000);
        Io.clear();

        const secondScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        expect(secondScan.unembedded).toHaveLength(0);
        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);
      } finally {
        unpatchModel();
      }
    });
  });

  test("modifying a file clears old embeddings and returns note id", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const unpatchModel = stubModelForEmbedding();
      try {
        const sourceDir = join(tmpDir, "source");
        mkdirSync(sourceDir, { recursive: true });

        const abs = join(sourceDir, "a.md");
        writeFileSync(abs, "v1");

        const firstScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        expect(firstScan.unembedded).toHaveLength(1);
        const noteId = firstScan.unembedded[0]!;
        await Store.embedFiles(firstScan.unembedded);
        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);

        const before = db.prepare(Sql.GET_NOTE).get(noteId) as {
          mtime: number;
        };

        writeFileSync(abs, "v2");
        touch(abs, before.mtime + 2000);
        Io.clear();

        const secondScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        expect(secondScan.unembedded).toEqual([noteId]);
        expect(secondScan.modified).toHaveLength(1);
        expect(count(db, "vectors")).toBe(0);
        expect(count(db, "embeddings")).toBe(0);

        await Store.embedFiles(secondScan.unembedded);
        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);
      } finally {
        unpatchModel();
      }
    });
  });

  test("removing a file deletes the note and clears embeddings", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const unpatchModel = stubModelForEmbedding();
      try {
        const sourceDir = join(tmpDir, "source");
        mkdirSync(sourceDir, { recursive: true });

        const abs = join(sourceDir, "a.md");
        writeFileSync(abs, "content");

        const firstScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        const noteId = firstScan.unembedded[0]!;
        await Store.embedFiles(firstScan.unembedded);

        expect(count(db, "vectors")).toBe(1);
        expect(count(db, "embeddings")).toBe(1);

        rmSync(abs);
        Io.clear();

        const secondScan = await Store.scan(sourceDir, "**/*.md", 1, "");
        expect(secondScan.removed).toHaveLength(1);

        const noteRow = db.prepare(Sql.GET_NOTE).get(noteId);
        expect(noteRow).toBeNull();

        expect(count(db, "vectors")).toBe(0);
        expect(count(db, "embeddings")).toBe(0);
      } finally {
        unpatchModel();
      }
    });
  });
});
