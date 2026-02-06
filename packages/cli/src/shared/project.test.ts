import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

import consola from "consola";
import { WorkspaceConfig } from "@spall/core";
import { resolveScope, createQuery } from "./workspace";

type Call = { method: string; args: any };

function ok<T>(data: T) {
  return { data, error: undefined } as const;
}

function mockClient(calls: Call[], opts?: { viewerId?: number }) {
  const viewerId = opts?.viewerId ?? 1;
  return {
    workspace: {
      create(params: any) {
        calls.push({ method: "workspace.create", args: params });
        return Promise.resolve(
          ok({
            id: viewerId,
            name: String(params?.name ?? ""),
            createdAt: 0,
            updatedAt: 0,
          }),
        );
      },
    },
    corpus: {
      list() {
        calls.push({ method: "corpus.list", args: {} });
        return Promise.resolve(
          ok([
            { id: 1, name: "default" },
            { id: 2, name: "docs" },
            { id: 3, name: "other" },
          ]),
        );
      },
    },
    query: {
      create(params: any) {
        calls.push({ method: "query.create", args: params });
        return Promise.resolve(ok({ id: 42, ...params }));
      },
    },
  } as any;
}

describe("cli workspace scope", () => {
  let dir: string;
  let calls: Call[];

  const originalExit = process.exit;
  const originalConsolaError = consola.error;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spall-cli-scope-test-"));
    calls = [];
    WorkspaceConfig.reset();
  });

  afterEach(() => {
    (process as any).exit = originalExit;
    (consola as any).error = originalConsolaError;
    WorkspaceConfig.reset();
    rmSync(dir, { recursive: true, force: true });
  });

  test("defaults to read scope from config when no --corpus override", async () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify({
        workspace: { name: "repo" },
        scope: { read: ["default", "docs"], write: "docs" },
      }),
    );

    const scope = await resolveScope({
      client: mockClient(calls),
      cwd: dir,
    });

    expect(scope.viewer.id).toBe(1);
    expect(scope.viewer.name).toBe("default");
    expect(scope.names).toEqual(["default", "docs"]);
    expect(scope.ids).toEqual([1, 2]);

    const wsCreates = calls.filter((c) => c.method === "workspace.create");
    expect(wsCreates).toHaveLength(0);
  });

  test("--corpus override selects a single corpus", async () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify({
        workspace: { name: "repo" },
        scope: { read: ["default", "docs"], write: "docs" },
      }),
    );

    const scope = await resolveScope({
      client: mockClient(calls),
      cwd: dir,
      corpus: "other",
    });

    expect(scope.names).toEqual(["other"]);
    expect(scope.ids).toEqual([3]);

    const wsCreates = calls.filter((c) => c.method === "workspace.create");
    expect(wsCreates).toHaveLength(0);
  });

  test("patches cached workspace id when config is located and differs", async () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 999 },
          scope: { read: ["default"], write: "default" },
        },
        null,
        2,
      ),
    );

    await resolveScope({
      client: mockClient(calls, { viewerId: 1 }),
      cwd: dir,
      tracked: true,
    });

    const raw = JSON.parse(
      readFileSync(join(dir, ".spall", "spall.json"), "utf-8"),
    );
    expect(raw.workspace.id).toBe(1);
    expect(raw.workspace.name).toBe("repo");
  });

  test("createQuery forwards viewer + corpora", async () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify({
        workspace: { name: "repo" },
        scope: { read: ["default", "docs"], write: "default" },
      }),
    );

    const res = await createQuery({
      client: mockClient(calls),
      cwd: dir,
      tracked: true,
    });

    const createCalls = calls.filter((c) => c.method === "query.create");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]!.args.viewer).toBe(1);
    expect(createCalls[0]!.args.corpora).toEqual([1, 2]);
    expect(res.query.id).toBe(42);
  });

  test("fails fast when an included corpus name is missing", async () => {
    (process as any).exit = (code: number) => {
      throw new Error(`exit:${code}`);
    };
    (consola as any).error = () => {};

    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify({
        workspace: { name: "repo" },
        scope: { read: ["missing"], write: "missing" },
      }),
    );

    await expect(
      resolveScope({ client: mockClient(calls), cwd: dir }),
    ).rejects.toThrow(/exit:1/);
  });
});
