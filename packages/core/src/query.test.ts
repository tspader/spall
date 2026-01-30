import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Config } from "./config";
import { Store } from "./store";
import { Note } from "./note";
import { Query } from "./query";
import { Project } from "./project";
import { Model } from "./model";

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
    expect(() => Query.get({ id: Query.Id.parse(999) })).toThrow(
      /not found/i,
    );
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
    const p2 = await Project.create({ dir: tmpDir, name: "second" });

    await addNote(PROJECT_ID, "default.md", "from default");
    await addNote(p2.id, "second.md", "from second");

    const q = Query.create({ projects: [PROJECT_ID, p2.id] });
    const page = Query.notes({ id: q.id });

    expect(page.notes).toHaveLength(2);
    const paths = page.notes.map((n) => n.path).sort();
    expect(paths).toEqual(["default.md", "second.md"]);
  });

  test("notes excludes projects not in the query", async () => {
    const p2 = await Project.create({ dir: tmpDir, name: "second" });
    const p3 = await Project.create({ dir: tmpDir, name: "third" });

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
      const p2 = await Project.create({ dir: tmpDir, name: "second" });

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
      const p2 = await Project.create({ dir: tmpDir, name: "second" });

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
