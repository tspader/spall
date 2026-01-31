import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from "fs";
import { join, normalize } from "path";
import { tmpdir } from "os";
import { Config } from "./config";
import { Store } from "./store";
import { Note } from "./note";
import { Model } from "./model";
import { Project } from "./project";
import { Sql } from "./sql";

const PROJECT_ID = Project.Id.parse(1);

function toPrefix(dir: string): string {
  let prefix = normalize(dir).replace(/\\/g, "/");
  prefix = prefix.replace(/\/+$/, "").replace(/^\.\//, "").replace(/^\//, "");
  return prefix === "." ? "" : prefix;
}

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

describe("Note.listByPath defaults", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-listbypath-test-"));
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

  test("listByPath with no path returns all notes", async () => {
    await Note.add({
      project: PROJECT_ID,
      path: "a.md",
      content: "alpha",
      dupe: true,
    });
    await Note.add({
      project: PROJECT_ID,
      path: "b.md",
      content: "beta",
      dupe: true,
    });

    const page = Note.listByPath({ project: PROJECT_ID });
    expect(page.notes).toHaveLength(2);
  });
});

describe("Note index", () => {
  let tmpDir: string;
  let originalChunk: typeof Store.chunk;
  let originalLoad: typeof Model.load;
  let originalEmbedBatch: typeof Model.embedBatch;
  let originalTokenize: typeof Model.tokenize;
  let originalDetokenize: typeof Model.detokenize;

  beforeEach(() => {
    Config.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-index-test-"));
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

  test("index adds notes with prefixed paths and respects glob", async () => {
    const root = join(tmpDir, "import");
    const source = join(root, "foo");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "a.md"), "alpha");
    writeFileSync(join(source, "b.txt"), "beta");

    await Note.sync({
      directory: source,
      glob: "**/*.md",
      project: PROJECT_ID,
    });

    const prefix = toPrefix(source);
    const note = Note.get({ project: PROJECT_ID, path: `${prefix}/a.md` });
    expect(note.content).toBe("alpha");
    expect(() =>
      Note.get({ project: PROJECT_ID, path: `${prefix}/b.txt` }),
    ).toThrow(/not found/i);
  });

  test("sync deletes missing files only under prefix", async () => {
    const root = join(tmpDir, "import");
    const source = join(root, "foo", "bar");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "a.md"), "alpha");
    writeFileSync(join(source, "b.md"), "beta");

    await Note.sync({ directory: source, project: PROJECT_ID });

    await Note.add({
      project: PROJECT_ID,
      path: "outside.md",
      content: "outside",
      dupe: true,
    });

    writeFileSync(join(source, "a.md"), "alpha updated");
    const bump = new Date(Date.now() + 2000);
    utimesSync(join(source, "a.md"), bump, bump);
    rmSync(join(source, "b.md"));
    writeFileSync(join(source, "c.md"), "gamma");

    await Note.sync({ directory: source, project: PROJECT_ID });

    const prefix = toPrefix(source);
    expect(
      Note.get({ project: PROJECT_ID, path: `${prefix}/a.md` }).content,
    ).toBe("alpha updated");
    expect(() =>
      Note.get({ project: PROJECT_ID, path: `${prefix}/b.md` }),
    ).toThrow(/not found/i);
    expect(
      Note.get({ project: PROJECT_ID, path: `${prefix}/c.md` }).content,
    ).toBe("gamma");
    expect(Note.get({ project: PROJECT_ID, path: "outside.md" }).content).toBe(
      "outside",
    );
  });
});
