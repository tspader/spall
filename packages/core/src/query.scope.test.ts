import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "./config";
import { Store } from "./store";
import { Workspace } from "./workspace";
import { Corpus } from "./corpus";
import { Note } from "./note";
import { Query } from "./query";
import { Error as SpallError } from "./error";
import { Model } from "./model";

describe("Query viewer and corpus scope", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-query-scope-test-"));
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
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("viewer workspace must exist", async () => {
    const c = Corpus.get({ name: "default" });
    try {
      Query.create({
        viewer: Workspace.Id.parse(999),
        corpora: [c.id],
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(SpallError.from(e).code).toBe("workspace.not_found");
    }
  });

  test("corpora must exist", async () => {
    const ws = await Workspace.create({ name: "ws" });
    try {
      Query.create({
        viewer: ws.id,
        corpora: [Corpus.Id.parse(999)],
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(SpallError.from(e).code).toBe("corpus.not_found");
    }
  });

  test("query scope filters notes by corpus", async () => {
    const ws = await Workspace.create({ name: "ws" });
    const c1 = Corpus.get({ name: "default" });
    const c2 = await Corpus.create({ name: "docs" });

    await Note.add({ corpus: c1.id, path: "a.md", content: "a", dupe: true });
    await Note.add({ corpus: c2.id, path: "b.md", content: "b", dupe: true });

    const q = Query.create({ viewer: ws.id, corpora: [c1.id] });
    const page = Query.notes({ id: q.id });
    expect(page.notes.map((n) => n.path)).toEqual(["a.md"]);
  });
});
