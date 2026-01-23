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
  it("opens editor with 'c' only when hunks are selected", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["file.ts"] },
    });

    // Enter diff but don't select
    await harness.run({
      keys: ["return"],
      expect: [Test.contains("[block 1/1]")],
    });

    // Try to open editor - should not work (no .md file shown)
    await harness.run({
      keys: ["c"],
      expect: [Test.contains("[block 1/1]")],
    });

    // Now select hunk
    await harness.run({
      keys: ["space"],
      expect: [Test.contains("c comment")],
    });

    // Open editor - should now work
    await harness.run({
      keys: ["c"],
      expect: [Test.contains(".md")],
    });
  });
});
