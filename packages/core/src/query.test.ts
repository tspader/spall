import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Config } from "./config";
import { Store } from "./store";
import { Sql } from "./sql";
import { Note } from "./note";
import { Query } from "./query";
import { Project } from "./project";
import { Model } from "./model";
import { Error as SpallError } from "./error";

const PROJECT_ID = Project.Id.parse(1);

describe("Query", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-query-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();

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
    project: Project.Id,
    path: string,
    content: string,
  ): Promise<void> {
    await Note.add({ project, path, content, dupe: true });
  }

  test("create returns query with projects and id", () => {
    const q = Query.create({ projects: [PROJECT_ID] });
    expect(q.id).toBeDefined();
    expect(q.projects).toEqual([PROJECT_ID]);
    expect(q.createdAt).toBeGreaterThan(0);
  });

  test("get retrieves a created query", () => {
    const created = Query.create({ projects: [PROJECT_ID] });
    const fetched = Query.get({ id: created.id });
    expect(fetched.id).toEqual(created.id);
    expect(fetched.projects).toEqual(created.projects);
  });

  test("get throws for nonexistent query", () => {
    expect(() => Query.get({ id: Query.Id.parse(999) })).toThrow(/not found/i);
  });

  test("notes returns notes from a single project", async () => {
    await addNote(PROJECT_ID, "a.md", "alpha");
    await addNote(PROJECT_ID, "b.md", "beta");

    const q = Query.create({ projects: [PROJECT_ID] });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["a.md", "b.md"]);
  });

  test("notes aggregates across multiple projects", async () => {
    const p2 = await Project.create({ name: "second" });

    await addNote(PROJECT_ID, "default.md", "from default");
    await addNote(p2.id, "second.md", "from second");

    const q = Query.create({ projects: [PROJECT_ID, p2.id] });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["default.md", "second.md"]);
  });

  test("notes excludes projects not in the query", async () => {
    const p2 = await Project.create({ name: "second" });
    const p3 = await Project.create({ name: "third" });

    await addNote(PROJECT_ID, "a.md", "a");
    await addNote(p2.id, "b.md", "b");
    await addNote(p3.id, "c.md", "c");

    const q = Query.create({ projects: [PROJECT_ID, p2.id] });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["a.md", "b.md"]);
  });

  test("notes path glob filters results", async () => {
    await addNote(PROJECT_ID, "docs/a.md", "a");
    await addNote(PROJECT_ID, "docs/b.md", "b");
    await addNote(PROJECT_ID, "src/c.ts", "c");

    const q = Query.create({ projects: [PROJECT_ID] });
    const page = Query.notes({ id: q.id, path: "docs/*" });

    expect(page.notes).toHaveLength(2);
    expect(page.notes.every((n) => n.path.startsWith("docs/"))).toBe(true);
  });

  describe("pagination", () => {
    test("limit restricts page size and returns cursor", async () => {
      await addNote(PROJECT_ID, "a.md", "a");
      await addNote(PROJECT_ID, "b.md", "b");
      await addNote(PROJECT_ID, "c.md", "c");

      const q = Query.create({ projects: [PROJECT_ID] });
      const page1 = Query.notes({ id: q.id, limit: 2 });

      expect(page1.notes).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
    });

    test("after cursor returns next page", async () => {
      await addNote(PROJECT_ID, "a.md", "a");
      await addNote(PROJECT_ID, "b.md", "b");
      await addNote(PROJECT_ID, "c.md", "c");

      const q = Query.create({ projects: [PROJECT_ID] });
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

    test("pagination works across multiple projects", async () => {
      const p2 = await Project.create({ name: "second" });

      // notes sort by path globally: a.md, b.md, c.md, d.md
      await addNote(PROJECT_ID, "a.md", "a");
      await addNote(p2.id, "b.md", "b");
      await addNote(PROJECT_ID, "c.md", "c");
      await addNote(p2.id, "d.md", "d");

      const q = Query.create({ projects: [PROJECT_ID, p2.id] });

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
      const p2 = await Project.create({ name: "second" });

      for (let i = 0; i < 5; i++) {
        await addNote(PROJECT_ID, `default-${i}.md`, `d${i}`);
        await addNote(p2.id, `second-${i}.md`, `s${i}`);
      }

      const q = Query.create({ projects: [PROJECT_ID, p2.id] });
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

describe("Project.remove", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;
  let originalEmbedBatch: typeof Model.embedBatch;
  let originalTokenize: typeof Model.tokenize;
  let originalDetokenize: typeof Model.detokenize;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-project-rm-test-"));
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

  test("deletes project with notes, embeddings, and vectors", async () => {
    const p = await Project.create({ name: "deleteme" });
    await Note.add({ project: p.id, path: "a.md", content: "alpha" });
    await Note.add({ project: p.id, path: "b.md", content: "beta" });

    const db = Store.get();
    const notesBefore = db
      .prepare("SELECT COUNT(*) as c FROM notes WHERE project_id = ?")
      .get(p.id) as { c: number };
    expect(notesBefore.c).toBe(2);

    await Project.remove({ id: p.id });

    const notesAfter = db
      .prepare("SELECT COUNT(*) as c FROM notes WHERE project_id = ?")
      .get(p.id) as { c: number };
    expect(notesAfter.c).toBe(0);

    const embeddingsAfter = db
      .prepare("SELECT COUNT(*) as c FROM embeddings")
      .get() as { c: number };
    expect(embeddingsAfter.c).toBe(0);

    const vectorsAfter = db
      .prepare("SELECT COUNT(*) as c FROM vectors")
      .get() as { c: number };
    expect(vectorsAfter.c).toBe(0);

    expect(() => Project.get({ id: p.id })).toThrow(/not found/i);
  });

  test("NotFoundError has error code for Error.from()", () => {
    try {
      Project.get({ id: Project.Id.parse(999) });
      expect.unreachable("should have thrown");
    } catch (e) {
      const info = SpallError.from(e);
      expect(info.code).toBe("project.not_found");
    }
  });

  test("does not affect other projects", async () => {
    const p1 = await Project.create({ name: "keep" });
    const p2 = await Project.create({ name: "remove" });

    await Note.add({ project: p1.id, path: "keep.md", content: "keep this" });
    await Note.add({
      project: p2.id,
      path: "remove.md",
      content: "remove this",
    });

    await Project.remove({ id: p2.id });

    const kept = Note.get({ project: p1.id, path: "keep.md" });
    expect(kept.content).toBe("keep this");
    expect(() => Project.get({ id: p2.id })).toThrow(/not found/i);
  });
});
