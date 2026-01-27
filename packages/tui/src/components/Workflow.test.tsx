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

describe("Workflow", () => {
  it("completes review workflow: navigate, select, open editor", async () => {
    harness = await Test.create({
      render,
      repo: { modified: ["first.ts", "second.ts"] },
    });

    // Navigate to second file
    await harness.run({
      keys: ["j"],
      expect: [Test.contains("second.ts")],
    });

    // Enter diff panel
    await harness.run({
      keys: ["return"],
      expect: [Test.contains("[hunk 1/1]")],
    });

    // Select hunk
    await harness.run({
      keys: ["space"],
      expect: [Test.contains("c comment")],
    });

    // Open editor
    await harness.run({
      keys: ["c"],
      expect: [Test.contains(".md")],
    });
  });

  it("handles empty repository gracefully", async () => {
    harness = await Test.create({
      render,
      repo: {}, // No changes
    });

    await harness.run({
      expect: [Test.contains("No changes found")],
    });
  });
});
