import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { testRender, render } from "@opentui/solid";
import { createCliRenderer, engine, type CliRenderer } from "@opentui/core";
import { createMockKeys } from "@opentui/core/testing";
import type { JSX } from "@opentui/solid";
import { db } from "../store";
import { Client } from "@spall/sdk/client";

export namespace Test {
  export namespace Repo {
    export type Content = string | { file: string } | (() => string);

    export type FileSpec = {
      path: string;
      status: "added" | "modified" | "deleted" | "untracked";
      content?: Content;
    };

    export type Config = {
      added?: string[];
      modified?: string[];
      deleted?: string[];
      untracked?: string[];
      files?: FileSpec[];
    };

    export type Instance = {
      path: string;
      cleanup: () => void;
    };

    function resolveContent(
      content: Content | undefined,
      path: string,
    ): string {
      if (content === undefined) {
        const ext = path.split(".").pop() || "";
        return generateContent(path, ext);
      }
      if (typeof content === "string") return content;
      if (typeof content === "function") return content();
      if ("file" in content)
        return Bun.file(content.file).text() as unknown as string;
      return "";
    }

    function generateContent(path: string, ext: string): string {
      const name = path.replace(/[/.]/g, "_");
      switch (ext) {
        case "ts":
        case "tsx":
          return `export const ${name} = true\n`;
        case "js":
        case "jsx":
          return `module.exports = { ${name}: true }\n`;
        case "md":
          return `# ${path}\n\nGenerated content.\n`;
        case "json":
          return `{"name": "${name}"}\n`;
        default:
          return `Content of ${path}\n`;
      }
    }

    function git(dir: string, ...args: string[]): string {
      return execSync(`git ${args.join(" ")}`, {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    function writeFile(dir: string, path: string, content: string): void {
      const fullPath = join(dir, path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }

    export function create(config: Config): Instance {
      const dir = mkdtempSync(join(tmpdir(), "spall-test-"));

      git(dir, "init");
      git(dir, "config", "user.email", "test@test.com");
      git(dir, "config", "user.name", "Test");

      const specs: FileSpec[] = [...(config.files || [])];
      for (const path of config.added || [])
        specs.push({ path, status: "added" });
      for (const path of config.modified || [])
        specs.push({ path, status: "modified" });
      for (const path of config.deleted || [])
        specs.push({ path, status: "deleted" });
      for (const path of config.untracked || [])
        specs.push({ path, status: "untracked" });

      const toModify = specs.filter((s) => s.status === "modified");
      const toDelete = specs.filter((s) => s.status === "deleted");
      const toAdd = specs.filter((s) => s.status === "added");
      const toUntrack = specs.filter((s) => s.status === "untracked");

      for (const spec of [...toModify, ...toDelete]) {
        const content = resolveContent(spec.content, spec.path);
        writeFile(dir, spec.path, `initial: ${content}`);
      }
      git(dir, "add", "-A");
      git(dir, "commit", "--allow-empty", "-m", "initial");

      for (const spec of toModify) {
        const content = resolveContent(spec.content, spec.path);
        writeFile(dir, spec.path, content);
      }

      for (const spec of toDelete) {
        rmSync(join(dir, spec.path));
      }

      for (const spec of toAdd) {
        const content = resolveContent(spec.content, spec.path);
        writeFile(dir, spec.path, content);
      }

      for (const spec of toUntrack) {
        const content = resolveContent(spec.content, spec.path);
        writeFile(dir, spec.path, content);
      }

      return {
        path: dir,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
      };
    }
  }

  export type KeySpec =
    | string
    | {
        key: string;
        count?: number;
        ctrl?: boolean;
        shift?: boolean;
        meta?: boolean;
      };

  export type Expectation =
    | { type: "contains"; value: string }
    | { type: "not-contains"; value: string };

  export type Run = {
    keys?: KeySpec[];
    expect?: Expectation[];
  };

  export type Config = {
    repo: Repo.Config;
    render: (repoPath: string) => JSX.Element;
    width?: number;
    height?: number;
  };

  export type Harness = {
    frame: () => string;
    pressKey: (
      key: string,
      modifiers?: { ctrl?: boolean; shift?: boolean; meta?: boolean },
    ) => Promise<void>;
    pressKeys: (keys: KeySpec[]) => Promise<void>;
    run: (config: Run) => Promise<void>;
    cleanup: () => void;
    renderer: Awaited<ReturnType<typeof testRender>>;
    repo: Repo.Instance;
  };

  const keyMap: Record<string, string> = {
    enter: "RETURN",
    return: "RETURN",
    esc: "ESCAPE",
    escape: "ESCAPE",
    tab: "TAB",
    backspace: "BACKSPACE",
    up: "ARROW_UP",
    down: "ARROW_DOWN",
    left: "ARROW_LEFT",
    right: "ARROW_RIGHT",
    space: " ",
  };

  function normalizeKey(key: string): string {
    return keyMap[key.toLowerCase()] || key;
  }

  async function cleanupTestProjects(): Promise<void> {
    try {
      const client = await Client.connect();
      const projects = await client.project.list({}).then((r) => r.data ?? []);
      const testProjects = projects.filter((p) =>
        p.name.startsWith("spall-test-"),
      );
      for (const project of testProjects) {
        await client.project.delete({ id: String(project.id) });
      }
    } catch {
      // Ignore errors - server might not be running
    }
  }

  export async function create(config: Config): Promise<Harness> {
    // Ensure db is initialized for tests
    db.init();

    // Clean up any orphaned test projects from previous runs
    await cleanupTestProjects();

    const repo = Repo.create(config.repo);

    const renderer = await testRender(() => config.render(repo.path), {
      width: config.width ?? 80,
      height: config.height ?? 24,
    });

    await renderer.renderOnce();
    await new Promise((r) => setTimeout(r, 100));
    await renderer.renderOnce();

    const harness: Harness = {
      frame: () => renderer.captureCharFrame(),

      pressKey: async (key, modifiers) => {
        renderer.mockInput.pressKey(normalizeKey(key), modifiers);
        await renderer.renderOnce();
      },

      pressKeys: async (keys) => {
        for (const spec of keys) {
          if (typeof spec === "string") {
            await harness.pressKey(spec);
          } else {
            const count = spec.count ?? 1;
            for (let i = 0; i < count; i++) {
              await harness.pressKey(spec.key, {
                ctrl: spec.ctrl,
                shift: spec.shift,
                meta: spec.meta,
              });
            }
          }
        }
      },

      run: async (run) => {
        if (run.keys) await harness.pressKeys(run.keys);

        if (run.expect) {
          const frame = harness.frame();
          for (const exp of run.expect) {
            if (exp.type === "contains" && !frame.includes(exp.value)) {
              throw new Error(
                `Expected frame to contain "${exp.value}" but it didn't.\n\nFrame:\n${frame}`,
              );
            }
            if (exp.type === "not-contains" && frame.includes(exp.value)) {
              throw new Error(
                `Expected frame NOT to contain "${exp.value}" but it did.\n\nFrame:\n${frame}`,
              );
            }
          }
        }
      },

      cleanup: () => {
        engine.detach();
        renderer.renderer.destroy();
        repo.cleanup();
      },

      renderer,
      repo,
    };

    return harness;
  }

  export function contains(value: string): Expectation {
    return { type: "contains", value };
  }

  export function notContains(value: string): Expectation {
    return { type: "not-contains", value };
  }

  export function repeat(key: string, count: number): KeySpec {
    return { key, count };
  }

  export async function debug(
    config: Config & { keys?: KeySpec[] },
  ): Promise<Harness> {
    const repo = Repo.create(config.repo);

    const cliRenderer = await createCliRenderer({
      exitOnCtrlC: true,
    });

    engine.attach(cliRenderer);
    render(() => config.render(repo.path), cliRenderer);

    // Wait for initial render
    await new Promise((r) => setTimeout(r, 200));

    const mockInput = createMockKeys(cliRenderer);

    // Send keys if provided
    if (config.keys) {
      for (const spec of config.keys) {
        if (typeof spec === "string") {
          mockInput.pressKey(normalizeKey(spec));
        } else {
          const count = spec.count ?? 1;
          for (let i = 0; i < count; i++) {
            mockInput.pressKey(normalizeKey(spec.key), {
              ctrl: spec.ctrl,
              shift: spec.shift,
              meta: spec.meta,
            });
          }
        }
      }
    }

    // Block until renderer is destroyed (user quits)
    await new Promise<void>((resolve) => {
      cliRenderer.on("destroy", resolve);
    });

    engine.detach();
    repo.cleanup();

    // Return a dummy harness so tests don't crash after debug
    return {
      frame: () => "",
      pressKey: async () => {},
      pressKeys: async () => {},
      run: async () => {},
      cleanup: () => {},
      renderer: null as any,
      repo,
    };
  }
}
