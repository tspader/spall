import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { WorkspaceConfig } from "./config";

describe("WorkspaceConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spall-workspace-config-test-"));
    WorkspaceConfig.reset();
  });

  afterEach(() => {
    WorkspaceConfig.reset();
    rmSync(dir, { recursive: true, force: true });
  });

  test("locate() finds repo root containing .spall", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    mkdirSync(join(dir, "a", "b"), { recursive: true });

    const located = WorkspaceConfig.locate(join(dir, "a", "b"));
    expect(located).not.toBeNull();
    expect(located!.root).toBe(dir);
    expect(located!.path).toBe(join(dir, ".spall", "spall.json"));
  });

  test("load() reads workspace identity and include list", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 123 },
          include: ["default", "docs"],
        },
        null,
        2,
      ),
    );

    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("repo");
    expect(cfg.workspace.id).toBe(123);
    expect(cfg.include).toEqual(["default", "docs"]);
  });

  test("patch() updates file and cache coherently", () => {
    mkdirSync(join(dir, ".spall"), { recursive: true });
    writeFileSync(
      join(dir, ".spall", "spall.json"),
      JSON.stringify(
        {
          workspace: { name: "repo", id: 111 },
          include: ["default"],
        },
        null,
        2,
      ),
    );

    WorkspaceConfig.patch(dir, { workspace: { id: 222 } });
    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("repo");
    expect(cfg.workspace.id).toBe(222);
    expect(cfg.include).toEqual(["default"]);
  });

  test("load() uses defaults when no workspace found", () => {
    const cfg = WorkspaceConfig.load(dir);
    expect(cfg.workspace.name).toBe("default");
    expect(cfg.workspace.id).toBeUndefined();
    expect(cfg.include).toEqual(["default"]);
  });
});
