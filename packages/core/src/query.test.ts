import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Config } from "./config";
import { Store } from "./store";
import { Sql } from "./sql";
import { Note } from "./note";
import { Query } from "./query";
import { Corpus } from "./corpus";
import { Workspace } from "./workspace";
import { Model } from "./model";
import { Error as SpallError } from "./error";

const CORPUS_ID = Corpus.Id.parse(1);

describe("Query", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;
  let workspaceId: Workspace.Id;

  beforeEach(async () => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-query-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();

    // Ensure Model state doesn't leak between tests.
    await Model.dispose();

    workspaceId = (await Workspace.create({ name: "ws" })).id;

    originalChunk = Store.chunk;
    originalLoad = Model.load;
    (Store as any).chunk = async () => [];
    (Model as any).load = async () => {};
  });

  afterEach(() => {
    (Store as any).chunk = originalChunk;
    (Model as any).load = originalLoad;
    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  async function addNote(
    corpus: Corpus.Id,
    path: string,
    content: string,
  ): Promise<void> {
    await Note.add({ corpus, path, content, dupe: true });
  }

  test("create returns query with corpora and id", () => {
    const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
    expect(q.id).toBeDefined();
    expect(q.corpora).toEqual([CORPUS_ID]);
    expect(q.tracked).toBe(false);
    expect(q.createdAt).toBeGreaterThan(0);
  });

  test("get retrieves a created query", () => {
    const created = Query.create({
      viewer: workspaceId,
      corpora: [CORPUS_ID],
    });
    const fetched = Query.get({ id: created.id });
    expect(fetched.id).toEqual(created.id);
    expect(fetched.corpora).toEqual(created.corpora);
  });

  test("get throws for nonexistent query", () => {
    expect(() => Query.get({ id: Query.Id.parse(999) })).toThrow(/not found/i);
  });

  test("notes returns notes from a single corpus", async () => {
    await addNote(CORPUS_ID, "a.md", "alpha");
    await addNote(CORPUS_ID, "b.md", "beta");

    const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["a.md", "b.md"]);
  });

  test("notes aggregates across multiple corpora", async () => {
    const c2 = await Corpus.create({ name: "second" });

    await addNote(CORPUS_ID, "default.md", "from default");
    await addNote(c2.id, "second.md", "from second");

    const q = Query.create({
      viewer: workspaceId,
      corpora: [CORPUS_ID, c2.id],
    });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["default.md", "second.md"]);
  });

  test("notes excludes corpora not in the query", async () => {
    const c2 = await Corpus.create({ name: "second" });
    const c3 = await Corpus.create({ name: "third" });

    await addNote(CORPUS_ID, "a.md", "a");
    await addNote(c2.id, "b.md", "b");
    await addNote(c3.id, "c.md", "c");

    const q = Query.create({
      viewer: workspaceId,
      corpora: [CORPUS_ID, c2.id],
    });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["a.md", "b.md"]);
  });

  test("notes path glob filters results", async () => {
    await addNote(CORPUS_ID, "docs/a.md", "a");
    await addNote(CORPUS_ID, "docs/b.md", "b");
    await addNote(CORPUS_ID, "src/c.ts", "c");

    const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
    const page = Query.notes({ id: q.id, path: "docs/*" });

    expect(page.notes).toHaveLength(2);
    expect(page.notes.every((n) => n.path.startsWith("docs/"))).toBe(true);
  });

  describe("search", () => {
    test("finds notes by keyword and returns a snippet", async () => {
      await addNote(
        CORPUS_ID,
        "a.md",
        "We do not use foo.bar here. Always use baz_qux instead.",
      );
      await addNote(CORPUS_ID, "b.md", "unrelated");

      const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
      const res = Query.search({ id: q.id, q: "foo.bar" });

      expect(res.results).toHaveLength(1);
      expect(res.results[0]!.path).toBe("a.md");
      const snip = res.results[0]!.snippet.toLowerCase();
      expect(snip).toContain("foo");
      expect(snip).toContain("bar");
    });

    test("reflects updates", async () => {
      await addNote(CORPUS_ID, "a.md", "Always use old_name.");

      const note = Note.get({ corpus: CORPUS_ID, path: "a.md" });
      const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });

      expect(Query.search({ id: q.id, q: "old_name" }).results).toHaveLength(1);

      await Note.update({ id: note.id, content: "Always use new_name." });

      expect(Query.search({ id: q.id, q: "old_name" }).results).toHaveLength(0);
      expect(Query.search({ id: q.id, q: "new_name" }).results).toHaveLength(1);
    });

    test("fts mode accepts raw operators (plain does not)", async () => {
      await addNote(CORPUS_ID, "a.md", "Always use old_name.");
      await addNote(CORPUS_ID, "b.md", "Always use new_name.");

      const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });

      const plain = Query.search({ id: q.id, q: "old_name OR new_name" });
      expect(plain.results).toHaveLength(0);

      const fts = Query.search({
        id: q.id,
        q: "old_name OR new_name",
        mode: "fts",
      });
      expect(fts.results).toHaveLength(2);
    });
  });

  describe("tracking", () => {
    test("fetch records note_read in staging for tracked queries", async () => {
      await addNote(CORPUS_ID, "a.md", "alpha");
      const note = Note.get({ corpus: CORPUS_ID, path: "a.md" });

      const q = Query.create({
        viewer: workspaceId,
        tracked: true,
        corpora: [CORPUS_ID],
      });

      Query.fetch({ id: q.id, ids: [note.id] });

      const db = Store.get();
      const row = db.prepare("SELECT COUNT(*) as count FROM staging").get() as {
        count: number;
      };
      expect(row.count).toBe(1);

      const entry = db
        .prepare("SELECT note_id, query_id, kind FROM staging LIMIT 1")
        .get() as { note_id: number; query_id: number; kind: number };
      expect(entry.note_id).toBe(Number(note.id));
      expect(entry.query_id).toBe(Number(q.id));
      expect(entry.kind).toBe(1);
    });

    test("fetch does not record staging for untracked queries", async () => {
      await addNote(CORPUS_ID, "a.md", "alpha");
      const note = Note.get({ corpus: CORPUS_ID, path: "a.md" });

      const q = Query.create({
        viewer: workspaceId,
        corpora: [CORPUS_ID],
      });

      Query.fetch({ id: q.id, ids: [note.id] });

      const db = Store.get();
      const row = db.prepare("SELECT COUNT(*) as count FROM staging").get() as {
        count: number;
      };
      expect(row.count).toBe(0);
    });
  });

  describe("pagination", () => {
    test("limit restricts page size and returns cursor", async () => {
      await addNote(CORPUS_ID, "a.md", "a");
      await addNote(CORPUS_ID, "b.md", "b");
      await addNote(CORPUS_ID, "c.md", "c");

      const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
      const page1 = Query.notes({ id: q.id, limit: 2 });

      expect(page1.notes).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
    });

    test("after cursor returns next page", async () => {
      await addNote(CORPUS_ID, "a.md", "a");
      await addNote(CORPUS_ID, "b.md", "b");
      await addNote(CORPUS_ID, "c.md", "c");

      const q = Query.create({ viewer: workspaceId, corpora: [CORPUS_ID] });
      const page1 = Query.notes({ id: q.id, limit: 2 });
      const page2 = Query.notes({
        id: q.id,
        limit: 2,
        after: page1.nextCursor!,
      });

      expect(page2.notes).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      expect(page2.notes[0]!.path).toBe("c.md");
    });

    test("pagination works across multiple corpora", async () => {
      const c2 = await Corpus.create({ name: "second" });

      // notes sort by path globally: a.md, b.md, c.md, d.md
      await addNote(CORPUS_ID, "a.md", "a");
      await addNote(c2.id, "b.md", "b");
      await addNote(CORPUS_ID, "c.md", "c");
      await addNote(c2.id, "d.md", "d");

      const q = Query.create({
        viewer: workspaceId,
        corpora: [CORPUS_ID, c2.id],
      });

      const page1 = Query.notes({ id: q.id, limit: 2 });
      expect(page1.notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
      expect(page1.nextCursor).toBe("b.md");

      const page2 = Query.notes({
        id: q.id,
        limit: 2,
        after: page1.nextCursor!,
      });
      expect(page2.notes.map((n) => n.path)).toEqual(["c.md", "d.md"]);
      expect(page2.nextCursor).toBe("d.md");

      const page3 = Query.notes({
        id: q.id,
        limit: 2,
        after: page2.nextCursor!,
      });
      expect(page3.notes).toHaveLength(0);
      expect(page3.nextCursor).toBeNull();
    });

    test("full drain collects all notes", async () => {
      const c2 = await Corpus.create({ name: "second" });

      for (let i = 0; i < 5; i++) {
        await addNote(CORPUS_ID, `default-${i}.md`, `d${i}`);
        await addNote(c2.id, `second-${i}.md`, `s${i}`);
      }

      const q = Query.create({
        viewer: workspaceId,
        corpora: [CORPUS_ID, c2.id],
      });
      const all: Note.Info[] = [];
      let cursor: string | undefined;

      while (true) {
        const page = Query.notes({ id: q.id, limit: 3, after: cursor });
        all.push(...page.notes);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(all).toHaveLength(10);
      // verify sorted
      for (let i = 1; i < all.length; i++) {
        expect(all[i]!.path > all[i - 1]!.path).toBe(true);
      }
    });
  });
});

describe("Corpus.remove", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;
  let originalEmbedBatch: typeof Model.embedBatch;
  let originalTokenize: typeof Model.tokenize;
  let originalDetokenize: typeof Model.detokenize;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-corpus-rm-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();

    originalChunk = Store.chunk;
    originalLoad = Model.load;
    originalEmbedBatch = Model.embedBatch;
    originalTokenize = Model.tokenize;
    originalDetokenize = Model.detokenize;

    (Store as any).chunk = async (text: string) => [{ text, pos: 0 }];
    (Model as any).load = async () => {};
    (Model as any).embedBatch = async (texts: string[]) =>
      texts.map(() => new Array(Sql.EMBEDDING_DIMS).fill(0));
    (Model as any).tokenize = async () => [0];
    (Model as any).detokenize = async () => "";
  });

  afterEach(() => {
    (Store as any).chunk = originalChunk;
    (Model as any).load = originalLoad;
    (Model as any).embedBatch = originalEmbedBatch;
    (Model as any).tokenize = originalTokenize;
    (Model as any).detokenize = originalDetokenize;

    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("deletes corpus with notes, embeddings, and vectors", async () => {
    const c = await Corpus.create({ name: "deleteme" });
    await Note.add({ corpus: c.id, path: "a.md", content: "alpha" });
    await Note.add({ corpus: c.id, path: "b.md", content: "beta" });

    const db = Store.get();
    const notesBefore = db
      .prepare("SELECT COUNT(*) as c FROM notes WHERE corpus_id = ?")
      .get(c.id) as { c: number };
    expect(notesBefore.c).toBe(2);

    await Corpus.remove({ id: c.id });

    const notesAfter = db
      .prepare("SELECT COUNT(*) as c FROM notes WHERE corpus_id = ?")
      .get(c.id) as { c: number };
    expect(notesAfter.c).toBe(0);

    const embeddingsAfter = db
      .prepare("SELECT COUNT(*) as c FROM embeddings")
      .get() as { c: number };
    expect(embeddingsAfter.c).toBe(0);

    const vectorsAfter = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorsAfter.c).toBe(0);

    expect(() => Corpus.get({ id: c.id })).toThrow(/not found/i);
  });

  test("NotFoundError has error code for Error.from()", () => {
    try {
      Corpus.get({ id: Corpus.Id.parse(999) });
      expect.unreachable("should have thrown");
    } catch (e) {
      const info = SpallError.from(e);
      expect(info.code).toBe("corpus.not_found");
    }
  });

  test("does not affect other corpora", async () => {
    const c1 = await Corpus.create({ name: "keep" });
    const c2 = await Corpus.create({ name: "remove" });

    await Note.add({ corpus: c1.id, path: "keep.md", content: "keep this" });
    await Note.add({
      corpus: c2.id,
      path: "remove.md",
      content: "remove this",
    });

    await Corpus.remove({ id: c2.id });

    const kept = Note.get({ corpus: c1.id, path: "keep.md" });
    expect(kept.content).toBe("keep this");
    expect(() => Corpus.get({ id: c2.id })).toThrow(/not found/i);
  });
});

describe("Query.vsearch", () => {
  let tmpDir: string;
  let restoreModel: () => void;
  let workspaceId: Workspace.Id;

  const DEFAULT_CORPUS_ID = Corpus.Id.parse(1);

  const CORPUS = [
    { path: "auth.md", content: "JWT tokens login password authentication" },
    { path: "database.md", content: "PostgreSQL SQL migrations Prisma" },
    { path: "caching.md", content: "Redis cache TTL invalidation" },
    { path: "errors.md", content: "exceptions stack traces error handling" },
    { path: "uploads.md", content: "S3 presigned URL file upload multipart" },
    { path: "ratelimit.md", content: "rate limit 429 throttle requests" },
  ];

  function hashEmbed(text: string): number[] {
    const vec = new Array(Sql.EMBEDDING_DIMS).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      let h = 0;
      for (let i = 0; i < word.length; i++) {
        h = (h * 31 + word.charCodeAt(i)) >>> 0;
      }
      vec[h % Sql.EMBEDDING_DIMS] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  beforeEach(async () => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-vsearch-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();

    workspaceId = (await Workspace.create({ name: "ws" })).id;

    const origLoad = Model.load;
    const origEmbed = Model.embed;
    const origEmbedBatch = Model.embedBatch;
    const origTokenize = Model.tokenize;
    const origDetokenize = Model.detokenize;

    (Model as any).load = async () => {};
    (Model as any).embed = async (t: string) => hashEmbed(t);
    (Model as any).embedBatch = async (ts: string[]) => ts.map(hashEmbed);
    (Model as any).tokenize = async () => [0];
    (Model as any).detokenize = async () => "";

    restoreModel = () => {
      (Model as any).load = origLoad;
      (Model as any).embed = origEmbed;
      (Model as any).embedBatch = origEmbedBatch;
      (Model as any).tokenize = origTokenize;
      (Model as any).detokenize = origDetokenize;
    };

    for (const note of CORPUS) {
      await Note.add({
        corpus: DEFAULT_CORPUS_ID,
        path: note.path,
        content: note.content,
      });
    }

    // Sanity check: notes should have produced vectors.
    const db = Store.get();
    const vecCount = db.prepare("SELECT COUNT(*) as c FROM vectors").get() as {
      c: number;
    };
    expect(vecCount.c).toBeGreaterThan(0);
  });

  afterEach(async () => {
    restoreModel();
    await Model.dispose();
    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("returns auth note for login query", async () => {
    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({ id: q.id, q: "login password" });

    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.path).toBe("auth.md");
    expect(res.results[0]!.score).toBeGreaterThan(0);
  });

  test("returns database note for SQL query", async () => {
    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({ id: q.id, q: "PostgreSQL migrations" });

    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.path).toBe("database.md");
  });

  test("returns uploads note for S3 query", async () => {
    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({ id: q.id, q: "S3 file upload" });

    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.path).toBe("uploads.md");
  });

  test("respects limit parameter", async () => {
    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({ id: q.id, q: "API", limit: 2 });

    expect(res.results).toHaveLength(2);
  });

  test("filters by path glob", async () => {
    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({
      id: q.id,
      q: "tokens authentication",
      path: "rate*",
    });

    expect(res.results.every((r) => r.path.startsWith("rate"))).toBe(true);
  });

  test("filters by corpus scope", async () => {
    const c2 = await Corpus.create({ name: "other" });
    await Note.add({
      corpus: c2.id,
      path: "other-auth.md",
      content: "JWT tokens authentication login",
    });

    const q = Query.create({
      viewer: workspaceId,
      corpora: [DEFAULT_CORPUS_ID],
    });
    const res = await Query.vsearch({ id: q.id, q: "JWT tokens" });

    expect(res.results.every((r) => r.path !== "other-auth.md")).toBe(true);
  });
});
