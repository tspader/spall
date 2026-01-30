import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ProjectConfig } from "@spall/core";
import { Client } from "@spall/sdk/client";
import { get } from "./get";

type Call = { method: string; args: any };
type NoteInfo = {
  id: number;
  project: number;
  path: string;
  content: string;
  contentHash: string;
};

function makeNotes(n: number): NoteInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    project: 1,
    path: `note-${String(i).padStart(3, "0")}.md`,
    content: `c${i}`,
    contentHash: `h${i}`,
  }));
}

function mockClient(calls: Call[], allNotes: NoteInfo[] = makeNotes(1)) {
  const ok = (data: any) => ({ data, error: undefined });

  return {
    project: {
      get(params: any) {
        calls.push({ method: "project.get", args: params });
        const name = params.name ?? "default";
        return Promise.resolve(ok({ id: name === "default" ? 1 : 2, name }));
      },
    },
    query: {
      create(params: any) {
        calls.push({ method: "query.create", args: params });
        return Promise.resolve(ok({ id: 42, projects: params.projects }));
      },
      notes(params: any) {
        calls.push({ method: "query.notes", args: params });
        const after = params.after ?? "";
        const limit = params.limit ?? 100;
        const remaining = allNotes.filter((n) => n.path > after);
        const page = remaining.slice(0, limit);
        const nextCursor =
          page.length === limit ? page[page.length - 1]!.path : null;
        return Promise.resolve(ok({ notes: page, nextCursor }));
      },
    },
  };
}

describe("spall get", () => {
  let tmpDir: string;
  let calls: Call[];
  const originalCwd = process.cwd;
  const originalConnect = Client.connect;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "spall-get-test-"));
    calls = [];
    process.cwd = () => tmpDir;
    (Client as any).connect = async () => mockClient(calls);
    ProjectConfig.reset();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    (Client as any).connect = originalConnect;
    ProjectConfig.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("uses ProjectConfig projects when --project not specified", async () => {
    mkdirSync(join(tmpDir, ".spall"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".spall", "spall.json"),
      JSON.stringify({ projects: ["default", "docs"] }),
    );

    await get.handler!({ path: "*", output: "json" });

    const projectGets = calls.filter((c) => c.method === "project.get");
    expect(projectGets).toHaveLength(2);
    expect(projectGets[0]!.args.name).toBe("default");
    expect(projectGets[1]!.args.name).toBe("docs");

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.args.projects).toEqual([1, 2]);

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0]!.args.id).toBe("42");
  });

  test("uses --project flag over config file", async () => {
    mkdirSync(join(tmpDir, ".spall"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".spall", "spall.json"),
      JSON.stringify({ projects: ["default", "docs", "other"] }),
    );

    await get.handler!({ path: "*", project: "docs", output: "json" });

    const projectGets = calls.filter((c) => c.method === "project.get");
    expect(projectGets).toHaveLength(1);
    expect(projectGets[0]!.args.name).toBe("docs");

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates[0]!.args.projects).toEqual([2]);
  });

  test("supports comma-separated --project", async () => {
    await get.handler!({ path: "*", project: "default, docs", output: "json" });

    const projectGets = calls.filter((c) => c.method === "project.get");
    expect(projectGets).toHaveLength(2);
    expect(projectGets[0]!.args.name).toBe("default");
    expect(projectGets[1]!.args.name).toBe("docs");
  });

  test("falls back to ['default'] with no config file", async () => {
    await get.handler!({ path: "*", output: "json" });

    const projectGets = calls.filter((c) => c.method === "project.get");
    expect(projectGets).toHaveLength(1);
    expect(projectGets[0]!.args.name).toBe("default");
  });

  test("--max limits total notes returned", async () => {
    (Client as any).connect = async () => mockClient(calls, makeNotes(10));

    await get.handler!({ path: "*", max: 3, output: "json" });

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0]!.args.limit).toBe(3);
  });

  test("follows pagination cursor across multiple pages", async () => {
    (Client as any).connect = async () => mockClient(calls, makeNotes(150));

    await get.handler!({ path: "*", output: "json" });

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    // 150 notes at 100/page = 2 calls
    expect(notesCalls).toHaveLength(2);
    // first call: no cursor
    expect(notesCalls[0]!.args.after).toBeUndefined();
    // second call: cursor from first page
    expect(notesCalls[1]!.args.after).toBe("note-099.md");
  });

  test("--max stops pagination early", async () => {
    (Client as any).connect = async () => mockClient(calls, makeNotes(150));

    await get.handler!({ path: "*", max: 120, output: "json" });

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    // first page: min(100, 120) = 100, second page: min(100, 20) = 20
    expect(notesCalls).toHaveLength(2);
    expect(notesCalls[0]!.args.limit).toBe(100);
    expect(notesCalls[1]!.args.limit).toBe(20);
  });
});
