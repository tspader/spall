import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Config } from "./config";
import { Store } from "./store";
import { Note } from "./note";
import { Model } from "./model";
import { Project } from "./project";

const PROJECT_ID = Project.Id.parse(1);

describe("Note duplication rules", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-note-test-"));
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

  test("add rejects duplicate content without dupe", async () => {
    await Note.add({
      project: PROJECT_ID,
      path: "a.md",
      content: "same content",
    });

    await expect(
      Note.add({
        project: PROJECT_ID,
        path: "b.md",
        content: "same content",
      }),
    ).rejects.toThrow(/Duplicate content/);
  });

  test("add allows duplicates with dupe but not same path", async () => {
    await Note.add({
      project: PROJECT_ID,
      path: "a.md",
      content: "same content",
    });

    await Note.add({
      project: PROJECT_ID,
      path: "b.md",
      content: "same content",
      dupe: true,
    });

    await expect(
      Note.add({
        project: PROJECT_ID,
        path: "a.md",
        content: "same content",
        dupe: true,
      }),
    ).rejects.toThrow(/already exists/);
  });

  test("update requires dupe when matching another note", async () => {
    await Note.add({
      project: PROJECT_ID,
      path: "a.md",
      content: "content a",
    });
    await Note.add({
      project: PROJECT_ID,
      path: "b.md",
      content: "content b",
    });

    const noteA = Note.get({ project: PROJECT_ID, path: "a.md" });
    const noteB = Note.get({ project: PROJECT_ID, path: "b.md" });

    await expect(
      Note.update({ id: noteB.id, content: noteA.content }),
    ).rejects.toThrow(/Duplicate content/);

    await Note.update({
      id: noteB.id,
      content: noteA.content,
      dupe: true,
    });
  });

  test("upsert respects dupe rule on inserts", async () => {
    await Note.add({
      project: PROJECT_ID,
      path: "a.md",
      content: "content a",
    });

    await expect(
      Note.upsert({
        project: PROJECT_ID,
        path: "c.md",
        content: "content a",
      }),
    ).rejects.toThrow(/Duplicate content/);

    await Note.upsert({
      project: PROJECT_ID,
      path: "c.md",
      content: "content a",
      dupe: true,
    });
  });
});
