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

describe("FileList", () => {
  describe("scrolling", () => {
    it("displays files initially visible at the top", async () => {
      harness = await Test.create({
        render,
        repo: {
          added: Array.from(
            { length: 20 },
            (_, i) => `file${String(i).padStart(2, "0")}.ts`,
          ),
        },
        height: 15,
      });

      await harness.run({
        expect: [
          Test.contains("file00.ts"),
          Test.contains("file01.ts"),
          Test.contains("file02.ts"),
        ],
      });
    });

    it("scrolls down when navigating past visible area", async () => {
      harness = await Test.create({
        render,
        repo: {
          added: Array.from(
            { length: 30 },
            (_, i) => `file${String(i).padStart(2, "0")}.ts`,
          ),
        },
        height: 15,
      });

      await harness.run({
        keys: [Test.repeat("j", 20)],
        expect: [Test.contains("file20.ts"), Test.notContains("file00.ts")],
      });
    });

    it("scrolls up when navigating back up", async () => {
      harness = await Test.create({
        render,
        repo: {
          added: Array.from(
            { length: 30 },
            (_, i) => `file${String(i).padStart(2, "0")}.ts`,
          ),
        },
        height: 15,
      });

      await harness.run({
        keys: [Test.repeat("j", 20), Test.repeat("k", 20)],
        expect: [Test.contains("file00.ts")],
      });
    });

    it("maintains scroll buffer at bottom", async () => {
      harness = await Test.create({
        render,
        repo: {
          added: Array.from(
            { length: 30 },
            (_, i) => `file${String(i).padStart(2, "0")}.ts`,
          ),
        },
        height: 20,
      });

      await harness.pressKeys([Test.repeat("j", 10)]);

      const frame = harness.frame();
      expect(frame).toContain("file10.ts");
    });
  });

  describe("selection highlighting", () => {
    it("highlights the selected file", async () => {
      harness = await Test.create({
        render,
        repo: { added: ["first.ts", "second.ts", "third.ts"] },
      });

      const initialFrame = harness.frame();
      expect(initialFrame).toContain("first.ts");

      await harness.pressKey("j");

      const frame = harness.frame();
      expect(frame).toContain("first.ts");
      expect(frame).toContain("second.ts");
    });
  });

  describe("file tree structure", () => {
    it("shows directory structure", async () => {
      harness = await Test.create({
        render,
        repo: { added: ["src/index.ts", "src/lib/utils.ts", "README.md"] },
      });

      await harness.run({
        expect: [
          Test.contains("src"),
          Test.contains("index.ts"),
          Test.contains("utils.ts"),
          Test.contains("README.md"),
        ],
      });
    });

    it("collapses single-child directory chains", async () => {
      harness = await Test.create({
        render,
        repo: { added: ["packages/core/src/index.ts"] },
      });

      const frame = harness.frame();
      expect(frame).toContain("packages");
      expect(frame).toContain("index.ts");
    });
  });

  describe("status indicators", () => {
    it("shows correct status indicators for new and modified files", async () => {
      harness = await Test.create({
        render,
        repo: {
          added: ["new.ts"],
          modified: ["changed.ts"],
        },
      });

      await harness.run({
        expect: [Test.contains("A new.ts"), Test.contains("M changed.ts")],
      });
    });

    it("updates diff panel when navigating files", async () => {
      harness = await Test.create({
        render,
        repo: {
          modified: ["first.ts", "second.ts"],
        },
      });

      // Initially shows first file
      await harness.run({
        expect: [Test.contains("first.ts [")],
      });

      // Navigate to second file
      await harness.run({
        keys: ["j"],
        expect: [Test.contains("second.ts [")],
      });
    });
  });
});
