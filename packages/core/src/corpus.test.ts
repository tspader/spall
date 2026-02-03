import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { Config } from "./config";
import { Store } from "./store";
import { Workspace } from "./workspace";
import { Corpus } from "./corpus";
import { Note } from "./note";
import { Model } from "./model";

describe("Corpus invariants", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-corpus-test-"));
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

  test("corpus does not belong to a workspace", async () => {
    const ws = await Workspace.create({ name: "repo" });
    const c = await Corpus.create({ name: "docs" });

    await Note.add({
      corpus: c.id,
      path: "a.md",
      content: "alpha",
      dupe: true,
    });

    await Corpus.remove({ id: c.id });

    // Workspace remains.
    expect(Workspace.get({ id: ws.id }).id).toBe(ws.id);
  });
});
