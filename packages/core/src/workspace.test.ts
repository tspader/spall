import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "./config";
import { Store } from "./store";
import { Workspace } from "./workspace";
import { Corpus } from "./corpus";
import { Query } from "./query";

describe("Workspace invariants", () => {
  let tmpDir: string;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-workspace-test-"));
    Config.set({
      dirs: { cache: tmpDir, data: tmpDir },
      models: { embedding: "", reranker: "" },
    });
    Store.ensure();
  });

  afterEach(() => {
    Store.close();
    Config.reset();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creating a workspace does not create corpora", async () => {
    const db = Store.get();
    const before = db.prepare("SELECT COUNT(*) as c FROM corpora").get() as {
      c: number;
    };

    await Workspace.create({ name: "repo" });

    const after = db.prepare("SELECT COUNT(*) as c FROM corpora").get() as {
      c: number;
    };

    expect(after.c).toBe(before.c);
  });

  test("deleting a workspace deletes its queries but not corpora", async () => {
    const ws = await Workspace.create({ name: "repo" });
    const c = await Corpus.get({ name: "default" });

    const q = Query.create({ viewer: ws.id, corpora: [c.id], tracked: false });
    expect(Query.get({ id: q.id }).id).toBe(q.id);

    await Workspace.remove({ id: ws.id });

    expect(() => Query.get({ id: q.id })).toThrow(/not found/i);
    expect(Corpus.get({ id: c.id }).id).toBe(c.id);
  });
});
