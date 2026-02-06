import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as prompts from "@clack/prompts";
import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";
import { add } from "./add";

type Call = { method: string; args: any };

const CANCEL = Symbol("cancel");

function makeClient(calls: Call[]) {
  const ok = (data: any) => ({ data, error: undefined });

  async function* stream(tag: "note.created" | "note.updated", info: any) {
    yield { tag, info };
  }

  return {
    corpus: {
      list() {
        calls.push({ method: "corpus.list", args: {} });
        return Promise.resolve(
          ok([
            { id: 1, name: "default", noteCount: 1 },
            { id: 2, name: "docs", noteCount: 2 },
          ]),
        );
      },
      get(params: any) {
        calls.push({ method: "corpus.get", args: params });
        return Promise.resolve(ok({ id: params.name === "docs" ? 2 : 1 }));
      },
    },
    note: {
      list(params: any) {
        calls.push({ method: "note.list", args: params });
        return Promise.resolve(
          ok([
            { id: 10, path: "foo/bar/baz.md", size: 3 },
            { id: 11, path: "style/indentation.md", size: 7 },
            { id: 12, path: "qux/kram.md", size: 2 },
          ]),
        );
      },
      get(params: any) {
        calls.push({ method: "note.get", args: params });
        return Promise.resolve(ok({ id: 99, corpus: 1, path: params.path }));
      },
    },
    sse: {
      note: {
        add(params: any) {
          calls.push({ method: "sse.note.add", args: params });
          return Promise.resolve({
            stream: stream("note.created", {
              id: 1,
              corpus: params.corpus,
              path: params.path,
            }),
          });
        },
        update(params: any) {
          calls.push({ method: "sse.note.update", args: params });
          return Promise.resolve({
            stream: stream("note.updated", {
              id: 99,
              corpus: 1,
              path: "x.md",
            }),
          });
        },
      },
    },
  };
}

describe("spall add", () => {
  let tmpDir: string;
  let calls: Call[];
  const originalCwd = process.cwd;
  const intros: string[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "spall-add-test-"));
    calls = [];
    intros.length = 0;
    process.cwd = () => tmpDir;
    spyOn(Client as any, "connect").mockImplementation(async () =>
      makeClient(calls),
    );
    spyOn(prompts, "intro").mockImplementation((title?: string) => {
      intros.push(String(title ?? ""));
    });
    spyOn(prompts, "outro").mockImplementation(() => "");
    spyOn(prompts, "isCancel").mockImplementation(
      (value: unknown): value is symbol => value === CANCEL,
    );
    spyOn(prompts, "text").mockImplementation(async () => "ignored");
    spyOn(prompts, "confirm").mockImplementation(async () => true);
    spyOn(prompts, "autocomplete").mockImplementation(async (opts: any) => {
      return opts?.initialValue ?? opts?.options?.[0]?.value ?? CANCEL;
    });
    spyOn(process, "exit" as any).mockImplementation((code?: number) => {
      throw new Error(`EXIT:${code ?? 0}`);
    });
    spyOn(console, "log").mockImplementation(() => {});
    WorkspaceConfig.reset();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    (Client.connect as any).mockRestore?.();
    (prompts.intro as any).mockRestore?.();
    (prompts.outro as any).mockRestore?.();
    (prompts.text as any).mockRestore?.();
    (prompts.confirm as any).mockRestore?.();
    (prompts.autocomplete as any).mockRestore?.();
    (prompts.isCancel as any).mockRestore?.();
    (process.exit as any).mockRestore?.();
    (console.log as any).mockRestore?.();
    WorkspaceConfig.reset();
    rmSync(tmpDir, { recursive: true });
  });

  test("uses workspace scope.write when --corpus is omitted", async () => {
    mkdirSync(join(tmpDir, ".spall"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".spall", "spall.json"),
      JSON.stringify({
        workspace: { name: "default" },
        scope: { read: ["default", "docs"], write: "docs" },
      }),
    );

    await add.handler!({ path: "a.md", text: "hello" });

    const corpusGet = calls.find((c) => c.method === "corpus.get");
    expect(corpusGet?.args.name).toBe("docs");

    const write = calls.find((c) => c.method === "sse.note.add");
    expect(write?.args.path).toBe("a.md");
    expect(write?.args.content).toBe("hello");
    expect(write?.args.corpus).toBe(2);
  });

  test("interactive cancel at content prompt does not write", async () => {
    (prompts.text as any).mockImplementation(async () => CANCEL);

    await add.handler!({ path: "a.md" });

    expect(intros).toEqual(["spall add"]);
    expect(calls.some((c) => c.method === "sse.note.add")).toBe(false);
    expect(calls.some((c) => c.method === "sse.note.update")).toBe(false);
  });

  test("interactive cancel at confirm does not write", async () => {
    (prompts.text as any).mockImplementation(async () => "hello");
    (prompts.confirm as any).mockImplementation(async () => false);

    await add.handler!({ path: "a.md" });

    expect(calls.some((c) => c.method === "sse.note.add")).toBe(false);
  });

  test("interactive content is used when confirmed", async () => {
    (prompts.text as any)
      .mockImplementationOnce(async () => "a.md")
      .mockImplementationOnce(async () => "from prompt");
    (prompts.confirm as any).mockImplementation(async () => true);

    await add.handler!({ path: "a.md" });

    expect(intros).toEqual(["spall add"]);
    const write = calls.find((c) => c.method === "sse.note.add");
    expect(write?.args.content).toBe("from prompt");
  });

  test("interactive path picker uses typed path argument as initial value", async () => {
    (prompts.text as any).mockImplementation(async () => "from prompt");
    (prompts.confirm as any).mockImplementation(async () => true);

    await add.handler!({ path: "foo/bar/baz" });

    const write = calls.find((c) => c.method === "sse.note.add");
    expect(write?.args.path).toBe("foo/bar/from prompt");
  });

  test("interactive cancel at corpus picker does not write", async () => {
    (prompts.autocomplete as any).mockImplementationOnce(async () => CANCEL);

    await add.handler!({});

    expect(calls.some((c) => c.method === "sse.note.add")).toBe(false);
    expect(calls.some((c) => c.method === "sse.note.update")).toBe(false);
  });

  test("path-only flow prompts corpus and path and writes with provided text", async () => {
    (prompts.autocomplete as any)
      .mockImplementationOnce(async () => "docs")
      .mockImplementationOnce(async () => "foo/bar");
    (prompts.text as any).mockImplementationOnce(async () => "baz.md");

    await add.handler!({ text: "hello" });

    const write = calls.find((c) => c.method === "sse.note.add");
    expect(write?.args.path).toBe("foo/bar/baz.md");
    expect(write?.args.content).toBe("hello");
    expect(write?.args.corpus).toBe(2);
  });

  test("interactive and non-interactive submit the same payload", async () => {
    (prompts.autocomplete as any)
      .mockImplementationOnce(async () => "docs")
      .mockImplementationOnce(async () => "foo/bar");
    (prompts.text as any)
      .mockImplementationOnce(async () => "baz.md")
      .mockImplementationOnce(async () => "argh!");
    (prompts.confirm as any).mockImplementation(async () => true);

    await add.handler!({});

    const interactiveWrite = calls.find(
      (c) => c.method === "sse.note.add",
    )?.args;
    expect(interactiveWrite).toBeTruthy();

    calls.length = 0;

    await add.handler!({
      corpus: "docs",
      path: "foo/bar/baz.md",
      text: "argh!",
    });

    const nonInteractiveWrite = calls.find(
      (c) => c.method === "sse.note.add",
    )?.args;
    expect(nonInteractiveWrite).toBeTruthy();
    expect(nonInteractiveWrite).toEqual(interactiveWrite);
  });

  test("directory picker lists directories, not full file paths", async () => {
    const seen: any[] = [];
    (prompts.autocomplete as any).mockImplementation(async (opts: any) => {
      seen.push(opts);
      return opts?.initialValue ?? opts?.options?.[1]?.value ?? CANCEL;
    });
    (prompts.text as any)
      .mockImplementationOnce(async () => "new-note.md")
      .mockImplementationOnce(async () => "content");

    await add.handler!({});

    const dirPrompt = seen.find((x) => x?.message === "Select directory");
    const labels = (dirPrompt?.options ?? []).map((o: any) => o.label);
    expect(labels).toContain("foo");
    expect(labels).toContain("foo/bar");
    expect(labels).toContain("style");
    expect(labels).toContain("(root)");
    expect(labels).not.toContain("foo/bar/baz");
    expect(labels).not.toContain("foo/bar/baz.md");
  });
});
