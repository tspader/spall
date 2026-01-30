/** @jsxImportSource @opentui/solid */
import { describe, it, expect, afterEach } from "bun:test";
import { Test } from "../test/harness";
import { Review } from "../Review";

let harness: Test.Harness | null = null;

afterEach(() => {
  harness?.cleanup();
  harness = null;
});

const render = (repoPath: string) => <Review repoPath={repoPath} />;

describe("EditorPanel", () => {
  it("opens editor with 'c' in hunk mode", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["file.ts"] },
    });

    // Enter diff
    await harness.run({
      keys: ["return"],
      expect: [Test.contains("[hunk 1/1]")],
    });

    // Open editor
    await harness.run({
      keys: ["c"],
      expect: [Test.contains(".md")],
    });
  });
});
