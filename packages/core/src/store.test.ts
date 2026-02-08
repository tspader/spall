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
import { Bus } from "./event";

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

describe("scan progress events", () => {
  type ScanEvent = { tag: string; [k: string]: any };

  function collectEvents(fn: () => Promise<void>): Promise<ScanEvent[]> {
    return new Promise(async (resolve) => {
      const events: ScanEvent[] = [];
      const unsub = Bus.subscribe((e) => {
        const ev = e as ScanEvent;
        if (ev.tag?.startsWith("scan.")) events.push(ev);
      });
      try {
        await fn();
      } finally {
        unsub();
      }
      resolve(events);
    });
  }

  test("scan.progress is emitted for every file including unchanged", async () => {
    await withTempSpallEnv(async ({ tmpDir }) => {
      const sourceDir = join(tmpDir, "source");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "a.md"), "alpha");
      writeFileSync(join(sourceDir, "b.md"), "beta");

      // First scan — both files are new
      await Store.scan(sourceDir, "**/*.md", 1, "prefix");

      Io.clear();

      // Second scan — both files unchanged
      const events = await collectEvents(() =>
        Store.scan(sourceDir, "**/*.md", 1, "prefix").then(() => {}),
      );

      const start = events.find((e) => e.tag === "scan.start");
      expect(start).toBeDefined();
      expect(start!.numFiles).toBe(2);

      const progress = events.filter((e) => e.tag === "scan.progress");
      expect(progress).toHaveLength(2);
      expect(progress.every((e) => e.status === "ok")).toBe(true);

      const done = events.find((e) => e.tag === "scan.done");
      expect(done).toBeDefined();
      expect(done!.ok).toBe(2);
      expect(done!.added).toBe(0);
    });
  });

  test("scan.done includes accurate counts for all statuses", async () => {
    await withTempSpallEnv(async ({ tmpDir }) => {
      const sourceDir = join(tmpDir, "source");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "a.md"), "alpha");
      writeFileSync(join(sourceDir, "b.md"), "beta");
      writeFileSync(join(sourceDir, "c.md"), "gamma");

      await Store.scan(sourceDir, "**/*.md", 1, "prefix");
      Io.clear();

      // Modify b, delete c, keep a unchanged
      writeFileSync(join(sourceDir, "b.md"), "beta-modified");
      const bump = new Date(Date.now() + 2000);
      require("fs").utimesSync(join(sourceDir, "b.md"), bump, bump);
      rmSync(join(sourceDir, "c.md"));
      Io.clear();

      const events = await collectEvents(() =>
        Store.scan(sourceDir, "**/*.md", 1, "prefix").then(() => {}),
      );

      const done = events.find((e) => e.tag === "scan.done");
      expect(done).toBeDefined();
      expect(done!.added).toBe(0);
      expect(done!.modified).toBe(1);
      expect(done!.removed).toBe(1);
      expect(done!.ok).toBe(1);
    });
  });

  test("orphan removal does not emit scan.progress", async () => {
    await withTempSpallEnv(async ({ tmpDir }) => {
      const sourceDir = join(tmpDir, "source");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "a.md"), "alpha");
      writeFileSync(join(sourceDir, "b.md"), "beta");
      writeFileSync(join(sourceDir, "c.md"), "gamma");

      // Scan and index all three
      await Store.scan(sourceDir, "**/*.md", 1, "prefix");
      Io.clear();

      // Delete b and c from disk — creates two orphans
      rmSync(join(sourceDir, "b.md"));
      rmSync(join(sourceDir, "c.md"));
      Io.clear();

      const events = await collectEvents(() =>
        Store.scan(sourceDir, "**/*.md", 1, "prefix").then(() => {}),
      );

      const start = events.find((e) => e.tag === "scan.start");
      const progress = events.filter((e) => e.tag === "scan.progress");

      // scan.start should report 1 (only the file on disk)
      expect(start!.numFiles).toBe(1);

      // There should be exactly 1 progress event (for a.md on disk),
      // NOT 3 (which would happen if orphan removals also emitted progress).
      expect(progress).toHaveLength(1);
      expect(progress[0]!.status).toBe("ok");
    });
  });
});

describe("scan glob scoping", () => {
  test("syncing one subdirectory glob does not delete notes from sibling subdirectory", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      // Single parent dir with two subdirectories, shared prefix
      const parentDir = join(tmpDir, "docs");
      mkdirSync(join(parentDir, "watchkit"), { recursive: true });
      mkdirSync(join(parentDir, "appkit"), { recursive: true });

      writeFileSync(join(parentDir, "watchkit", "a.md"), "watchkit alpha");
      writeFileSync(join(parentDir, "watchkit", "b.md"), "watchkit beta");
      writeFileSync(join(parentDir, "appkit", "x.md"), "appkit x");

      // First sync: import watchkit via glob filter on shared parent
      await Store.scan(parentDir, "watchkit/**/*.md", 1, "docs");
      expect(count(db, "notes")).toBe(2);

      Io.clear();

      // Second sync: import appkit via glob filter on same parent + prefix
      // This must NOT delete the watchkit notes
      await Store.scan(parentDir, "appkit/**/*.md", 1, "docs");
      expect(count(db, "notes")).toBe(3);

      const paths = db
        .prepare("SELECT path FROM notes WHERE corpus_id = 1 ORDER BY path")
        .all() as { path: string }[];
      expect(paths.map((r) => r.path)).toEqual([
        "docs/appkit/x.md",
        "docs/watchkit/a.md",
        "docs/watchkit/b.md",
      ]);
    });
  });

  test("syncing parent dir with glob filter does not delete notes outside glob", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const parentDir = join(tmpDir, "apple");
      mkdirSync(join(parentDir, "watchkit"), { recursive: true });
      mkdirSync(join(parentDir, "appkit"), { recursive: true });

      writeFileSync(join(parentDir, "watchkit", "a.md"), "watchkit alpha");
      writeFileSync(join(parentDir, "appkit", "x.md"), "appkit x");

      // Sync all docs under "apple" prefix first
      await Store.scan(parentDir, "**/*.md", 1, "apple");
      expect(count(db, "notes")).toBe(2);

      Io.clear();

      // Now re-sync with a glob that only matches watchkit
      const result = await Store.scan(
        parentDir,
        "watchkit/**/*.md",
        1,
        "apple",
      );

      // appkit notes must NOT be deleted even though they're under "apple" prefix
      expect(count(db, "notes")).toBe(2);
      expect(result.removed).toHaveLength(0);

      const paths = db
        .prepare("SELECT path FROM notes WHERE corpus_id = 1 ORDER BY path")
        .all() as { path: string }[];
      expect(paths.map((r) => r.path)).toEqual([
        "apple/appkit/x.md",
        "apple/watchkit/a.md",
      ]);
    });
  });

  test("orphan deletion still works within glob scope", async () => {
    await withTempSpallEnv(async ({ tmpDir, db }) => {
      const parentDir = join(tmpDir, "apple");
      mkdirSync(join(parentDir, "watchkit"), { recursive: true });
      mkdirSync(join(parentDir, "appkit"), { recursive: true });

      writeFileSync(join(parentDir, "watchkit", "a.md"), "watchkit alpha");
      writeFileSync(join(parentDir, "watchkit", "b.md"), "watchkit beta");
      writeFileSync(join(parentDir, "appkit", "x.md"), "appkit x");

      // Sync everything
      await Store.scan(parentDir, "**/*.md", 1, "apple");
      expect(count(db, "notes")).toBe(3);

      // Delete a watchkit file from disk
      rmSync(join(parentDir, "watchkit", "b.md"));
      Io.clear();

      // Re-sync with watchkit-only glob — b.md should be removed, appkit untouched
      const result = await Store.scan(
        parentDir,
        "watchkit/**/*.md",
        1,
        "apple",
      );

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toBe("apple/watchkit/b.md");
      expect(count(db, "notes")).toBe(2);

      const paths = db
        .prepare("SELECT path FROM notes WHERE corpus_id = 1 ORDER BY path")
        .all() as { path: string }[];
      expect(paths.map((r) => r.path)).toEqual([
        "apple/appkit/x.md",
        "apple/watchkit/a.md",
      ]);
    });
  });

  test("re-syncing unchanged files reports correct ok count", async () => {
    await withTempSpallEnv(async ({ tmpDir }) => {
      const sourceDir = join(tmpDir, "source");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "a.md"), "alpha");
      writeFileSync(join(sourceDir, "b.md"), "beta");
      writeFileSync(join(sourceDir, "c.md"), "gamma");

      const first = await Store.scan(sourceDir, "**/*.md", 1, "docs");
      expect(first.added).toHaveLength(3);

      Io.clear();

      const second = await Store.scan(sourceDir, "**/*.md", 1, "docs");
      expect(second.added).toHaveLength(0);
      expect(second.modified).toHaveLength(0);
      expect(second.removed).toHaveLength(0);

      // Verify via events that ok count is correct
      const events = await (async () => {
        const evts: { tag: string; [k: string]: any }[] = [];
        const unsub = Bus.subscribe((e) => {
          evts.push(e as any);
        });

        Io.clear();
        await Store.scan(sourceDir, "**/*.md", 1, "docs");

        unsub();
        return evts;
      })();

      const done = events.find((e) => e.tag === "scan.done");
      expect(done!.ok).toBe(3);
    });
  });
});
