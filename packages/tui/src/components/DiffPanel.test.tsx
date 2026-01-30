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

describe("DiffPanel", () => {
  describe("panel navigation", () => {
    it("enters diff panel with Enter and shows hunk indicator", async () => {
      harness = await Test.create({
        render,
        repo: { modified: ["file.ts"] },
      });

      // Initially in sidebar, shows hunk count
      await harness.run({
        expect: [Test.contains("[1 hunk]")],
      });

      // Enter diff panel
      await harness.run({
        keys: ["return"],
        expect: [Test.contains("[hunk 1/1]")],
      });
    });
  });

  describe("hunk selection", () => {
    it("shows comment action in hunk mode", async () => {
      harness = await Test.create({
        render,
        repo: { modified: ["file.ts"] },
      });

      // Enter diff panel
      await harness.run({
        keys: ["return"],
        expect: [Test.contains("[hunk 1/1]"), Test.contains("c comment")],
      });
    });
  });

  describe("line mode", () => {
    it("switches between hunk and line mode with 'a'", async () => {
      harness = await Test.create({
        render,
        repo: {
          files: [
            {
              path: "file.ts",
              status: "added",
              content: "line1\nline2\nline3\n",
            },
          ],
        },
      });

      await harness.run({
        keys: ["return"],
        expect: [Test.contains("[hunk")],
      });

      // Switch to line mode
      await harness.run({
        keys: ["a"],
        expect: [Test.contains("[line")],
      });

      // Switch back to hunk mode
      await harness.run({
        keys: ["a"],
        expect: [Test.contains("[hunk")],
      });
    });

    it("extends line selection with Shift+j", async () => {
      harness = await Test.create({
        render,
        repo: {
          files: [
            {
              path: "file.ts",
              status: "added",
              content: "line1\nline2\nline3\n",
            },
          ],
        },
      });

      // Enter diff, switch to line mode
      await harness.run({
        keys: ["return", "a"],
        expect: [Test.contains("[line 1]")],
      });

      // Extend selection down
      await harness.run({
        keys: [{ key: "j", shift: true }],
        expect: [Test.contains("[lines 1-2]")],
      });

      // Extend more
      await harness.run({
        keys: [{ key: "j", shift: true }],
        expect: [Test.contains("[lines 1-3]")],
      });
    });
  });
});
