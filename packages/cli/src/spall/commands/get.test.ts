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
      create(params: any) {
        calls.push({ method: "project.create", args: params });
        const name = String(params?.name ?? "");
        const id = name === "docs" ? 2 : name === "other" ? 3 : 1;
        return Promise.resolve(
          ok({
            id,
            name,
            noteCount: 0,
            createdAt: 0,
            updatedAt: 0,
          }),
        );
      },
      list() {
        calls.push({ method: "project.list", args: {} });
        return Promise.resolve(
          ok([
            {
              id: 1,
              name: "default",
              dir: "",
              noteCount: 0,
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: 2,
              name: "docs",
              dir: "",
              noteCount: 0,
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: 3,
              name: "other",
              dir: "",
              noteCount: 0,
              createdAt: 0,
              updatedAt: 0,
            },
          ]),
        );
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

  test("tree output prints content on same line and truncates to terminal width", async () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

    const originalLog = console.log;
    const originalColumns = Object.getOwnPropertyDescriptor(
      process.stdout,
      "columns",
    );

    const lines: string[] = [];
    console.log = (...args: any[]) => {
      lines.push(args.join(" "));
    };

    Object.defineProperty(process.stdout, "columns", {
      value: 40,
      configurable: true,
    });

    (Client as any).connect = async () =>
      mockClient(calls, [
        {
          id: 1,
          project: 1,
          path: "dir/file.md",
          content: "abcdefghijklmnopqrstuvwxyz0123456789",
          contentHash: "h",
        },
      ]);

    await get.handler!({ path: "*", output: "tree", all: true });

    console.log = originalLog;
    if (originalColumns) {
      Object.defineProperty(process.stdout, "columns", originalColumns);
    } else {
      delete (process.stdout as any).columns;
    }

    const printed = lines.map(stripAnsi);
    const fileLine = printed.find((l) => l.includes("file.md"));
    const fileLineRaw = lines.find((l) => l.includes("file.md"));
    expect(fileLine).toBeTruthy();
    expect(fileLineRaw).toBeTruthy();

    // Filename is in primary color; content is printed plain after reset.
    const marker = "\x1b[38;2;114;161;136mfile.md\x1b[39m ";
    expect(fileLineRaw!).toContain(marker);
    expect(
      fileLineRaw!.slice(fileLineRaw!.indexOf(marker) + marker.length),
    ).not.toMatch(/^\x1b\[/);
    // Content preview is on same line and truncated with ... in the middle.
    expect(fileLine!).toContain("file.md ");
    expect(fileLine!).toContain("...");
    expect(fileLine!.length).toBeLessThanOrEqual(40);
  });

  test("tree output prints ... when truncated by terminal height", async () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

    const originalLog = console.log;
    const originalRows = Object.getOwnPropertyDescriptor(
      process.stdout,
      "rows",
    );
    const lines: string[] = [];
    console.log = (...args: any[]) => {
      lines.push(args.join(" "));
    };

    Object.defineProperty(process.stdout, "rows", {
      value: 6,
      configurable: true,
    });

    (Client as any).connect = async () => mockClient(calls, makeNotes(10));
    await get.handler!({ path: "*", output: "tree" });

    console.log = originalLog;
    if (originalRows) {
      Object.defineProperty(process.stdout, "rows", originalRows);
    } else {
      delete (process.stdout as any).rows;
    }

    const printed = lines.map(stripAnsi);
    expect(printed).toContain("...");
  });

  test("table output prints ... when truncated by terminal height", async () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

    const originalLog = console.log;
    const originalRows = Object.getOwnPropertyDescriptor(
      process.stdout,
      "rows",
    );
    const originalColumns = Object.getOwnPropertyDescriptor(
      process.stdout,
      "columns",
    );

    const lines: string[] = [];
    console.log = (...args: any[]) => {
      lines.push(args.join(" "));
    };

    Object.defineProperty(process.stdout, "rows", {
      value: 6,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "columns", {
      value: 80,
      configurable: true,
    });

    (Client as any).connect = async () => mockClient(calls, makeNotes(10));
    await get.handler!({ path: "*", output: "table" });

    console.log = originalLog;
    if (originalRows) {
      Object.defineProperty(process.stdout, "rows", originalRows);
    } else {
      delete (process.stdout as any).rows;
    }
    if (originalColumns) {
      Object.defineProperty(process.stdout, "columns", originalColumns);
    } else {
      delete (process.stdout as any).columns;
    }

    const printed = lines.map(stripAnsi);
    expect(printed).toContain("(...truncated)");
  });

  test("uses ProjectConfig projects when --project not specified", async () => {
    mkdirSync(join(tmpDir, ".spall"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".spall", "spall.json"),
      JSON.stringify({
        project: { name: "default" },
        include: ["default", "docs"],
      }),
    );

    await get.handler!({ path: "*", output: "json" });

    const listCalls = calls.filter((c) => c.method === "project.list");
    expect(listCalls).toHaveLength(1);

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.args.viewer).toEqual(1);
    expect(creates[0]!.args.tracked).toEqual(false);
    expect(creates[0]!.args.projects).toEqual([1, 2]);

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0]!.args.id).toBe("42");
  });

  test("uses --project flag over config file", async () => {
    mkdirSync(join(tmpDir, ".spall"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".spall", "spall.json"),
      JSON.stringify({
        project: { name: "default" },
        include: ["default", "docs", "other"],
      }),
    );

    await get.handler!({ path: "*", project: "docs", output: "json" });

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.args.viewer).toEqual(1);
    expect(creates[0]!.args.tracked).toEqual(false);
    expect(creates[0]!.args.projects).toEqual([2]);
  });

  test("--project selects a single project by name", async () => {
    await get.handler!({ path: "*", project: "other", output: "json" });

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.args.viewer).toEqual(1);
    expect(creates[0]!.args.tracked).toEqual(false);
    expect(creates[0]!.args.projects).toEqual([3]);
  });

  test("falls back to ['default'] with no config file", async () => {
    await get.handler!({ path: "*", output: "json" });

    const creates = calls.filter((c) => c.method === "query.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.args.viewer).toEqual(1);
    expect(creates[0]!.args.tracked).toEqual(false);
    expect(creates[0]!.args.projects).toEqual([1]);
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

  test("--all flag is accepted", async () => {
    // Just verify the handler accepts the --all flag without error
    (Client as any).connect = async () => mockClient(calls, makeNotes(10));

    // Should not throw
    await get.handler!({ path: "*", all: true, output: "json" });

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    expect(notesCalls.length).toBeGreaterThan(0);
  });

  test("--all with false value works", async () => {
    (Client as any).connect = async () => mockClient(calls, makeNotes(10));

    // Should not throw
    await get.handler!({ path: "*", all: false, output: "json" });

    const notesCalls = calls.filter((c) => c.method === "query.notes");
    expect(notesCalls.length).toBeGreaterThan(0);
  });
});
