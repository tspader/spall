/** @jsxImportSource @opentui/solid */
import { describe, it, expect, afterEach } from "bun:test";
import { Test } from "../test/harness";
import { Review } from "../Review";

let harness: Test.Harness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

const render = (repoPath: string) => <Review repoPath={repoPath} />;

describe("CommandPalette", () => {
  it("opens with Ctrl+P and displays commands", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["file.ts"] },
    });

    await harness.run({
      keys: [{ key: "p", ctrl: true }],
      expect: [Test.contains("Commands"), Test.contains("movement")],
    });
  });

  it("shows context-appropriate commands from sidebar", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["file.ts"] },
    });

    // From sidebar - shows select hunks
    await harness.run({
      keys: [{ key: "p", ctrl: true }],
      expect: [Test.contains("select hunks")],
    });
  });

  it("shows context-appropriate commands from diff panel", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["file.ts"] },
    });

    // Enter diff panel
    await harness.run({
      keys: ["return"],
      expect: [Test.contains("[hunk 1/1]")],
    });

    // Open palette from diff panel
    await harness.run({
      keys: [{ key: "p", ctrl: true }],
      expect: [Test.contains("select by lines")],
    });
  });
});
