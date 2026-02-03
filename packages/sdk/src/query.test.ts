import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { Config, Store, Model } from "@spall/core";
import { Server } from "./server";
import { Lock } from "./lock";
import { Client } from "./client";

let testDir: string;
let port: number;
let originalChunk: typeof Store.chunk;
let originalLoad: typeof Model.load;

beforeAll(async () => {
  testDir = mkdtempSync(join(tmpdir(), "spall-query-integ-"));
  Config.set({
    dirs: {
      cache: join(import.meta.dir, "../../../..", ".cache"),
      data: join(testDir, "data"),
    },
  });

  originalChunk = Store.chunk;
  originalLoad = Model.load;
  (Store as any).chunk = async () => [];
  (Model as any).load = async () => {};

  const result = await Server.start({ persist: true });
  port = result.port;
});

afterAll(() => {
  Server.stop();
  (Store as any).chunk = originalChunk;
  (Model as any).load = originalLoad;
  Config.reset();
  rmSync(testDir, { recursive: true, force: true });
});

function attach(p?: number) {
  return Client.attach(`http://127.0.0.1:${p ?? port}`);
}

async function seedCorpus(name: string): Promise<number> {
  const client = attach();
  const corpus = await client.corpus.create({ name }).then(Client.unwrap);
  return corpus.id;
}

describe("query routes", () => {
  let defaultId: number;
  let docsId: number;
  let workspaceId: number;

  beforeAll(async () => {
    const client = attach();
    workspaceId = (
      await client.workspace.create({ name: "ws" }).then(Client.unwrap)
    ).id;
    defaultId = (
      await client.corpus.get({ name: "default" }).then(Client.unwrap)
    ).id;
    docsId = await seedCorpus("docs");

    for (const [path, content, corpus] of [
      ["alpha.md", "a", defaultId],
      ["beta.md", "b", defaultId],
      ["gamma.md", "g", defaultId],
      ["doc-a.md", "da", docsId],
      ["doc-b.md", "db", docsId],
    ] as const) {
      await client.note.add({ corpus, path, content }).then(Client.unwrap);
    }
  });

  test("create + get query via HTTP", async () => {
    const client = attach();
    const created = await client.query
      .create({ viewer: workspaceId, corpora: [defaultId, docsId] })
      .then(Client.unwrap);

    expect(created.id).toBeDefined();
    expect(created.corpora).toEqual([defaultId, docsId]);

    const fetched = await client.query
      .get({ id: String(created.id) })
      .then(Client.unwrap);
    expect(fetched.id).toEqual(created.id);
  });

  test("query notes returns results from all corpora", async () => {
    const client = attach();
    const q = await client.query
      .create({ viewer: workspaceId, corpora: [defaultId, docsId] })
      .then(Client.unwrap);

    const page = await client.query
      .notes({ id: String(q.id) })
      .then(Client.unwrap);

    expect(page.notes).toHaveLength(5);
  });

  test("query notes excludes other corpora", async () => {
    const client = attach();
    const q = await client.query
      .create({ viewer: workspaceId, corpora: [docsId] })
      .then(Client.unwrap);

    const page = await client.query
      .notes({ id: String(q.id) })
      .then(Client.unwrap);

    expect(page.notes).toHaveLength(2);
    expect(page.notes.every((n: any) => n.path.startsWith("doc-"))).toBe(true);
  });

  test("pagination via HTTP", async () => {
    const client = attach();
    const q = await client.query
      .create({ viewer: workspaceId, corpora: [defaultId, docsId] })
      .then(Client.unwrap);

    const page1 = await client.query
      .notes({ id: String(q.id), limit: 3 })
      .then(Client.unwrap);
    expect(page1.notes).toHaveLength(3);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await client.query
      .notes({ id: String(q.id), limit: 3, after: page1.nextCursor! })
      .then(Client.unwrap);
    expect(page2.notes).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    const allPaths = [
      ...page1.notes.map((n: any) => n.path),
      ...page2.notes.map((n: any) => n.path),
    ];
    expect(allPaths).toHaveLength(5);
    for (let i = 1; i < allPaths.length; i++) {
      expect(allPaths[i]! > allPaths[i - 1]!).toBe(true);
    }
  });
});

describe("query survives server restart", () => {
  let queryId: number;
  let corpusIds: number[];
  let workspaceId: number;

  beforeAll(async () => {
    const client = attach();
    workspaceId = (
      await client.workspace.create({ name: "ws-restart" }).then(Client.unwrap)
    ).id;

    const defaultCorpus = await client.corpus
      .get({ name: "default" })
      .then(Client.unwrap);
    corpusIds = [defaultCorpus.id];

    const q = await client.query
      .create({ viewer: workspaceId, corpora: corpusIds })
      .then(Client.unwrap);
    queryId = q.id;

    const page = await client.query
      .notes({ id: String(queryId) })
      .then(Client.unwrap);
    expect(page.notes.length).toBeGreaterThan(0);
  });

  test("query persists across server stop/start", async () => {
    const oldPort = port;

    // kill the in-process server
    Server.stop();
    Lock.remove();
    await Bun.sleep(100);

    // spawn a real subprocess server (same data dir, new process)
    const script = join(import.meta.dir, "serve.ts");
    const child = Bun.spawn([process.execPath, script], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_DATA_DIR: Config.get().dirs.data,
        SPALL_CACHE_DIR: Config.get().dirs.cache,
        SPALL_SERVER_PERSIST: "1",
      },
    });

    // poll lock file for the new port
    let newPort: number | null = null;
    for (let i = 0; i < 80; i++) {
      await Bun.sleep(50);
      const lock = Lock.read();
      if (lock && lock.port !== null) {
        newPort = lock.port;
        break;
      }
    }

    expect(newPort).not.toBeNull();
    expect(newPort).not.toBe(oldPort);

    const client = attach(newPort!);

    // query still exists on the new server
    const fetched = await client.query
      .get({ id: String(queryId) })
      .then(Client.unwrap);
    expect(fetched.id).toBe(queryId);
    expect(fetched.corpora).toEqual(corpusIds);

    // query still returns notes
    const page = await client.query
      .notes({ id: String(queryId) })
      .then(Client.unwrap);
    expect(page.notes.length).toBeGreaterThan(0);

    // clean up subprocess
    child.kill();
    Lock.remove();
  });
});
