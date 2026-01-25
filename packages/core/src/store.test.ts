import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Store } from "./store";
import { Io } from "./io";

describe("Store integration", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    Io.clear();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-test-"));
    dbPath = join(tmpDir, "test.db");
    Store.ensure();
  });

  afterEach(() => {
    Store.close();
    rmSync(tmpDir, { recursive: true });
  });

  describe("upsertFile", () => {
    test("inserts file record", () => {
      Store.upsertFile("readme.md", 1000);
      expect(Store.getFile("readme.md")).toEqual({
        mtime: 1000,
        embedded: false,
      });
    });

    test("upsert updates mtime but preserves embedded flag", () => {
      Store.upsertFile("a.md", 1000);
      expect(Store.getFile("a.md")).toEqual({ mtime: 1000, embedded: false });
      Store.markEmbedded("a.md");
      expect(Store.getFile("a.md")).toEqual({ mtime: 1000, embedded: true });
      Store.upsertFile("a.md", 2000);
      expect(Store.getFile("a.md")).toEqual({ mtime: 2000, embedded: true });
    });

    test("markUnembedded resets embedded flag", () => {
      Store.upsertFile("a.md", 1000);
      Store.markEmbedded("a.md");
      expect(Store.getFile("a.md")).toEqual({ mtime: 1000, embedded: true });
      Store.markUnembedded("a.md");
      expect(Store.getFile("a.md")).toEqual({ mtime: 1000, embedded: false });
    });
  });

  describe("removeFile", () => {
    test("removes file record", () => {
      Store.upsertFile("a.md", 1000);
      Store.removeFile("a.md");
      expect(Store.getFile("a.md")).toBeNull();
    });

    test("removing non-existent file is no-op", () => {
      Store.upsertFile("a.md", 1000);
      Store.removeFile("nonexistent.md");
      expect(Store.getFile("a.md")).toEqual({ mtime: 1000, embedded: false });
    });
  });

  describe("listAllFiles", () => {
    test("lists all indexed files", () => {
      Store.upsertFile("a.md", 1000);
      Store.upsertFile("b/c.md", 1000);
      Store.upsertFile("b/d.md", 1000);
      expect(Store.listAllFiles().sort()).toEqual(["a.md", "b/c.md", "b/d.md"]);
    });

    test("returns empty for no files", () => {
      expect(Store.listAllFiles()).toEqual([]);
    });
  });

  describe("clearEmbeddings", () => {
    test("removes embeddings for a file", () => {
      Store.upsertFile("a.md", 1000);
      Store.embed("a.md", 0, 0, new Array(768).fill(0.1));
      Store.embed("a.md", 1, 100, new Array(768).fill(0.2));

      const db = Store.get();
      let count = db
        .prepare("SELECT COUNT(*) as c FROM embeddings WHERE key = ?")
        .get("a.md") as { c: number };
      expect(count.c).toBe(2);

      Store.clearEmbeddings("a.md");

      count = db
        .prepare("SELECT COUNT(*) as c FROM embeddings WHERE key = ?")
        .get("a.md") as { c: number };
      expect(count.c).toBe(0);
    });
  });

  // Note: chunk() is now async and requires the model to be loaded.
  // Token-based chunking is tested via integration tests (spall index).
});

describe("Store.scan", () => {
  let tmpDir: string;
  let dbPath: string;
  let notesDir: string;

  beforeEach(() => {
    Io.clear();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-scan-test-"));
    dbPath = join(tmpDir, "test.db");
    notesDir = join(tmpDir, "notes");
    mkdirSync(notesDir, { recursive: true });
    Store.ensure();
  });

  afterEach(() => {
    Store.close();
    rmSync(tmpDir, { recursive: true });
  });

  test("detects new files", async () => {
    writeFileSync(join(notesDir, "a.md"), "content a");
    writeFileSync(join(notesDir, "b.md"), "content b");

    const result = await Store.scan(notesDir);

    expect(result.added.sort()).toEqual(["a.md", "b.md"]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unembedded.sort()).toEqual(["a.md", "b.md"]);
    expect(Store.listAllFiles().sort()).toEqual(["a.md", "b.md"]);
  });

  test("detects modified files", async () => {
    writeFileSync(join(notesDir, "a.md"), "original");
    await Store.scan(notesDir);
    // Mark as embedded to simulate completed indexing
    Store.markEmbedded("a.md");

    // Modify file (need to wait a bit for mtime to change)
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(notesDir, "a.md"), "modified content");
    Io.clear();

    const result = await Store.scan(notesDir);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual(["a.md"]);
    expect(result.removed).toEqual([]);
    expect(result.unembedded).toEqual(["a.md"]);
  });

  test("detects removed files", async () => {
    writeFileSync(join(notesDir, "a.md"), "content");
    await Store.scan(notesDir);
    Store.markEmbedded("a.md");
    expect(Store.listAllFiles()).toEqual(["a.md"]);

    // Remove file
    rmSync(join(notesDir, "a.md"));
    Io.clear();

    const result = await Store.scan(notesDir);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual(["a.md"]);
    expect(Store.listAllFiles()).toEqual([]);
  });

  test("handles nested directories", async () => {
    mkdirSync(join(notesDir, "sub"), { recursive: true });
    writeFileSync(join(notesDir, "root.md"), "root");
    writeFileSync(join(notesDir, "sub/nested.md"), "nested");

    const result = await Store.scan(notesDir);

    expect(result.added.sort()).toEqual(["root.md", "sub/nested.md"]);
  });

  test("ignores non-md files", async () => {
    writeFileSync(join(notesDir, "note.md"), "markdown");
    writeFileSync(join(notesDir, "other.txt"), "text");
    writeFileSync(join(notesDir, "data.json"), "{}");

    const result = await Store.scan(notesDir);

    expect(result.added).toEqual(["note.md"]);
  });

  test("reports up to date when no changes", async () => {
    writeFileSync(join(notesDir, "a.md"), "content");
    await Store.scan(notesDir);
    Store.markEmbedded("a.md");

    const result = await Store.scan(notesDir);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unembedded).toEqual([]);
  });
});
