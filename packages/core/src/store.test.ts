import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { Store } from "./store";
import { Sql } from "./sql";
import {
  withTempSpallEnv,
  count,
  stubModelForEmbedding,
  touch,
} from "./testHarness";
import { Io } from "./io";

describe("Store embeddings integration", () => {
  test("saveNoteEmbeddings stores vectors keyed by embedding id", () => {
    return withTempSpallEnv(({ db }) => {
      const inserted = db
        .prepare(Sql.INSERT_NOTE)
        .get(1, "hello.md", "hello", "hash", Date.now()) as { id: number };

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
        .get(1, "hello.md", "hello", "hash", Date.now()) as { id: number };

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
