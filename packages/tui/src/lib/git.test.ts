import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Git } from "./git";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { $ } from "bun";

// Sample diffs for testing
const simpleDiff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 context line 1
-removed line
+added line 1
+added line 2
 context line 2`;

const multiBlockDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,8 +1,7 @@
 context 1
-removed 1
+added 1
 context 2
 context 3
 context 4
-removed 2
-removed 3
+added 2
 context 5`;

const multiHunkDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 context 1
-old line
+new line
 context 2
 context 3
 context 4
@@ -10,3 +10,3 @@
 context 10
-another old line
+another new line
 context 11`;

const onlyAdditionsDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,4 @@
 context
+new line 1
+new line 2
+new line 3`;

const onlyDeletionsDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,4 +1,1 @@
 context
-deleted 1
-deleted 2
-deleted 3`;

const noNewlineDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 context
-old line
\\ No newline at end of file
+new line`;

describe("Git.blocks", () => {
  test("returns empty array for empty input", () => {
    expect(Git.blocks("")).toEqual([]);
  });

  test("returns empty array for null/undefined input", () => {
    expect(Git.blocks(null as any)).toEqual([]);
    expect(Git.blocks(undefined as any)).toEqual([]);
  });

  test("parses simple diff with one change block", () => {
    const blocks = Git.blocks(simpleDiff);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.startLine).toBe(1); // After "context line 1"
    expect(blocks[0]!.lineCount).toBe(3); // -removed, +added1, +added2
    expect(blocks[0]!.content).toBe(
      "-removed line\n+added line 1\n+added line 2",
    );
  });

  test("parses diff with multiple change blocks separated by context", () => {
    const blocks = Git.blocks(multiBlockDiff);
    expect(blocks.length).toBe(2);

    // First block: -removed1, +added1
    expect(blocks[0]!.startLine).toBe(1);
    expect(blocks[0]!.lineCount).toBe(2);

    // Second block: -removed2, -removed3, +added2
    expect(blocks[1]!.startLine).toBe(6); // After context1, block1(2 lines), context2, context3, context4
    expect(blocks[1]!.lineCount).toBe(3);
  });

  test("parses diff with multiple hunks", () => {
    const blocks = Git.blocks(multiHunkDiff);
    expect(blocks.length).toBe(2);

    // First hunk block: starts after context1 (line 0), so at line 1
    expect(blocks[0]!.startLine).toBe(1);
    expect(blocks[0]!.lineCount).toBe(2);

    // Second hunk block: hunk1 has 6 lines (0-5), hunk2 starts at 6 (context10), change at 7
    expect(blocks[1]!.startLine).toBe(7);
    expect(blocks[1]!.lineCount).toBe(2);
  });

  test("parses diff with only additions", () => {
    const blocks = Git.blocks(onlyAdditionsDiff);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.lineCount).toBe(3);
    expect(blocks[0]!.content).toBe("+new line 1\n+new line 2\n+new line 3");
  });

  test("parses diff with only deletions", () => {
    const blocks = Git.blocks(onlyDeletionsDiff);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.lineCount).toBe(3);
    expect(blocks[0]!.content).toBe("-deleted 1\n-deleted 2\n-deleted 3");
  });

  test("handles 'No newline at end of file' markers", () => {
    const blocks = Git.blocks(noNewlineDiff);
    // The backslash line breaks the contiguous block, resulting in 2 separate blocks
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.lineCount).toBe(1);
    expect(blocks[0]!.content).toBe("-old line");
    expect(blocks[1]!.lineCount).toBe(1);
    expect(blocks[1]!.content).toBe("+new line");
  });

  test("returns empty array for malformed diff", () => {
    const blocks = Git.blocks("this is not a valid diff");
    expect(blocks).toEqual([]);
  });

  test("returns empty array for diff with no hunks", () => {
    const headerOnly = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt`;
    const blocks = Git.blocks(headerOnly);
    expect(blocks).toEqual([]);
  });
});

describe("Git.lines", () => {
  test("returns 0 for empty input", () => {
    expect(Git.lines("")).toBe(0);
  });

  test("returns 0 for null/undefined input", () => {
    expect(Git.lines(null as any)).toBe(0);
    expect(Git.lines(undefined as any)).toBe(0);
  });

  test("counts context lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
 line 2
 line 3`;
    expect(Git.lines(diff)).toBe(3);
  });

  test("counts addition lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,3 @@
 context
+added 1
+added 2`;
    expect(Git.lines(diff)).toBe(3);
  });

  test("counts deletion lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,1 @@
 context
-deleted 1
-deleted 2`;
    expect(Git.lines(diff)).toBe(3);
  });

  test("counts mixed changes correctly", () => {
    // simpleDiff has: 1 context, 1 deletion, 2 additions, 1 context = 5 lines
    expect(Git.lines(simpleDiff)).toBe(5);
  });

  test("ignores header lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
 only this counts`;
    expect(Git.lines(diff)).toBe(1);
  });

  test("ignores hunk header lines (@@)", () => {
    expect(Git.lines(multiHunkDiff)).toBe(10); // All content lines from both hunks
  });

  test("ignores 'No newline at end of file' markers", () => {
    expect(Git.lines(noNewlineDiff)).toBe(3); // context + old + new
  });

  test("handles multiple hunks", () => {
    // multiHunkDiff: hunk1 has 5 content lines, hunk2 has 5 content lines
    expect(Git.lines(multiHunkDiff)).toBe(10);
  });

  test("returns 0 for diff with no content lines", () => {
    const headerOnly = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt`;
    expect(Git.lines(headerOnly)).toBe(0);
  });
});

// Integration tests with a real git repo
describe("git integration", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = mkdtempSync(join(tmpdir(), "git-test-"));
    await $`git -C ${testDir} init`.quiet();
    await $`git -C ${testDir} config user.email "test@test.com"`.quiet();
    await $`git -C ${testDir} config user.name "Test"`.quiet();

    // Create initial commit
    writeFileSync(join(testDir, "file.txt"), "initial content\n");
    await $`git -C ${testDir} add file.txt`.quiet();
    await $`git -C ${testDir} commit -m "initial"`.quiet();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Git.root", () => {
    test("returns repo root for valid repo", async () => {
      const root = await Git.root(testDir);
      expect(root).toBe(testDir);
    });

    test("returns repo root from subdirectory", async () => {
      const subdir = join(testDir, "subdir");
      mkdirSync(subdir, { recursive: true });
      const root = await Git.root(subdir);
      expect(root).toBe(testDir);
    });

    test("returns null for non-repo directory", async () => {
      const nonRepo = mkdtempSync(join(tmpdir(), "non-repo-"));
      try {
        const root = await Git.root(nonRepo);
        expect(root).toBeNull();
      } finally {
        rmSync(nonRepo, { recursive: true, force: true });
      }
    });
  });

  describe("Git.head", () => {
    test("returns commit SHA for valid repo", async () => {
      const sha = await Git.head(testDir);
      expect(sha).not.toBeNull();
      expect(sha!.length).toBe(40);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    test("returns null for non-repo", async () => {
      const nonRepo = mkdtempSync(join(tmpdir(), "non-repo-"));
      try {
        const sha = await Git.head(nonRepo);
        expect(sha).toBeNull();
      } finally {
        rmSync(nonRepo, { recursive: true, force: true });
      }
    });
  });

  describe("Git.entries", () => {
    test("returns empty array when no changes", async () => {
      const entries = await Git.entries(testDir);
      expect(entries).toEqual([]);
    });

    test("detects modified tracked file", async () => {
      writeFileSync(join(testDir, "file.txt"), "modified content\n");
      try {
        const entries = await Git.entries(testDir);
        expect(entries.length).toBe(1);
        expect(entries[0]!.file).toBe("file.txt");
        expect(entries[0]!.isNew).toBe(false);
        expect(entries[0]!.isDeleted).toBe(false);
        expect(entries[0]!.content).toContain("-initial content");
        expect(entries[0]!.content).toContain("+modified content");
      } finally {
        await $`git -C ${testDir} checkout -- file.txt`.quiet();
      }
    });

    test("detects untracked file", async () => {
      writeFileSync(join(testDir, "new.txt"), "new file content\n");
      try {
        const entries = await Git.entries(testDir);
        expect(entries.length).toBe(1);
        expect(entries[0]!.file).toBe("new.txt");
        expect(entries[0]!.isNew).toBe(true);
        expect(entries[0]!.content).toContain("+new file content");
      } finally {
        rmSync(join(testDir, "new.txt"));
      }
    });

    test("detects deleted file", async () => {
      rmSync(join(testDir, "file.txt"));
      try {
        const entries = await Git.entries(testDir);
        expect(entries.length).toBe(1);
        expect(entries[0]!.file).toBe("file.txt");
        expect(entries[0]!.isDeleted).toBe(true);
      } finally {
        await $`git -C ${testDir} checkout -- file.txt`.quiet();
      }
    });
  });

  describe("Git.hash", () => {
    test("returns consistent hash for same state", async () => {
      const hash1 = await Git.hash(testDir);
      const hash2 = await Git.hash(testDir);
      expect(hash1).toBe(hash2);
    });

    test("returns different hash after change", async () => {
      const hash1 = await Git.hash(testDir);
      writeFileSync(join(testDir, "file.txt"), "changed\n");
      try {
        const hash2 = await Git.hash(testDir);
        expect(hash1).not.toBe(hash2);
      } finally {
        await $`git -C ${testDir} checkout -- file.txt`.quiet();
      }
    });
  });

  describe("Git.diff", () => {
    test("returns empty string when no changes", async () => {
      const diff = await Git.diff(testDir);
      expect(diff).toBe("");
    });

    test("returns combined diff content", async () => {
      writeFileSync(join(testDir, "file.txt"), "modified\n");
      writeFileSync(join(testDir, "new.txt"), "new\n");
      try {
        const diff = await Git.diff(testDir);
        expect(diff).toContain("file.txt");
        expect(diff).toContain("new.txt");
        expect(diff).toContain("+modified");
        expect(diff).toContain("+new");
      } finally {
        await $`git -C ${testDir} checkout -- file.txt`.quiet();
        rmSync(join(testDir, "new.txt"));
      }
    });
  });
});
