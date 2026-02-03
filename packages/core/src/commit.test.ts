import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "./config";
import { Store } from "./store";
import { Note } from "./note";
import { Query } from "./query";
import { Project } from "./project";
import { Commit } from "./commit";
import { Model } from "./model";

const PROJECT_ID = Project.Id.parse(1);

describe("Commit", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-commit-test-"));
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

  test("moves staging rows to committed", async () => {
    await Note.add({ project: PROJECT_ID, path: "a.md", content: "alpha" });
    const note = Note.get({ project: PROJECT_ID, path: "a.md" });

    const q = Query.create({
      viewer: PROJECT_ID,
      tracked: true,
      projects: [PROJECT_ID],
    });

    Query.fetch({ id: q.id, ids: [note.id] });

    const db = Store.get();
    const before = db
      .prepare("SELECT COUNT(*) as count FROM staging")
      .get() as {
      count: number;
    };
    expect(before.count).toBe(1);

    const res = Commit.run({});
    expect(res.moved).toBe(1);
    expect(res.committedAt).toBeGreaterThan(0);

    const afterStaging = db
      .prepare("SELECT COUNT(*) as count FROM staging")
      .get() as { count: number };
    expect(afterStaging.count).toBe(0);

    const afterCommitted = db
      .prepare("SELECT COUNT(*) as count FROM committed")
      .get() as { count: number };
    expect(afterCommitted.count).toBe(1);

    const row = db
      .prepare(
        "SELECT note_id, query_id, kind, committed_at FROM committed LIMIT 1",
      )
      .get() as {
      note_id: number;
      query_id: number;
      kind: number;
      committed_at: number;
    };
    expect(row.note_id).toBe(Number(note.id));
    expect(row.query_id).toBe(Number(q.id));
    expect(row.kind).toBe(1);
    expect(row.committed_at).toBe(res.committedAt);
  });
});
