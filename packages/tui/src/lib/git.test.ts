import { describe, test, expect } from "bun:test"
import { parseChangeBlocks, countDiffLines } from "./git"

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
 context line 2`

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
 context 5`

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
 context 11`

const onlyAdditionsDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,4 @@
 context
+new line 1
+new line 2
+new line 3`

const onlyDeletionsDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,4 +1,1 @@
 context
-deleted 1
-deleted 2
-deleted 3`

const noNewlineDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 context
-old line
\\ No newline at end of file
+new line`

describe("parseChangeBlocks", () => {
  test("returns empty array for empty input", () => {
    expect(parseChangeBlocks("")).toEqual([])
  })

  test("returns empty array for null/undefined input", () => {
    expect(parseChangeBlocks(null as any)).toEqual([])
    expect(parseChangeBlocks(undefined as any)).toEqual([])
  })

  test("parses simple diff with one change block", () => {
    const blocks = parseChangeBlocks(simpleDiff)
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.startLine).toBe(1) // After "context line 1"
    expect(blocks[0]!.lineCount).toBe(3) // -removed, +added1, +added2
    expect(blocks[0]!.content).toBe("-removed line\n+added line 1\n+added line 2")
  })

  test("parses diff with multiple change blocks separated by context", () => {
    const blocks = parseChangeBlocks(multiBlockDiff)
    expect(blocks.length).toBe(2)
    
    // First block: -removed1, +added1
    expect(blocks[0]!.startLine).toBe(1)
    expect(blocks[0]!.lineCount).toBe(2)
    
    // Second block: -removed2, -removed3, +added2
    expect(blocks[1]!.startLine).toBe(6) // After context1, block1(2 lines), context2, context3, context4
    expect(blocks[1]!.lineCount).toBe(3)
  })

  test("parses diff with multiple hunks", () => {
    const blocks = parseChangeBlocks(multiHunkDiff)
    expect(blocks.length).toBe(2)
    
    // First hunk block: starts after context1 (line 0), so at line 1
    expect(blocks[0]!.startLine).toBe(1)
    expect(blocks[0]!.lineCount).toBe(2)
    
    // Second hunk block: hunk1 has 6 lines (0-5), hunk2 starts at 6 (context10), change at 7
    expect(blocks[1]!.startLine).toBe(7)
    expect(blocks[1]!.lineCount).toBe(2)
  })

  test("parses diff with only additions", () => {
    const blocks = parseChangeBlocks(onlyAdditionsDiff)
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.lineCount).toBe(3)
    expect(blocks[0]!.content).toBe("+new line 1\n+new line 2\n+new line 3")
  })

  test("parses diff with only deletions", () => {
    const blocks = parseChangeBlocks(onlyDeletionsDiff)
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.lineCount).toBe(3)
    expect(blocks[0]!.content).toBe("-deleted 1\n-deleted 2\n-deleted 3")
  })

  test("handles 'No newline at end of file' markers", () => {
    const blocks = parseChangeBlocks(noNewlineDiff)
    // The backslash line breaks the contiguous block, resulting in 2 separate blocks
    expect(blocks.length).toBe(2)
    expect(blocks[0]!.lineCount).toBe(1)
    expect(blocks[0]!.content).toBe("-old line")
    expect(blocks[1]!.lineCount).toBe(1)
    expect(blocks[1]!.content).toBe("+new line")
  })

  test("returns empty array for malformed diff", () => {
    const blocks = parseChangeBlocks("this is not a valid diff")
    expect(blocks).toEqual([])
  })

  test("returns empty array for diff with no hunks", () => {
    const headerOnly = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt`
    const blocks = parseChangeBlocks(headerOnly)
    expect(blocks).toEqual([])
  })
})

describe("countDiffLines", () => {
  test("returns 0 for empty input", () => {
    expect(countDiffLines("")).toBe(0)
  })

  test("returns 0 for null/undefined input", () => {
    expect(countDiffLines(null as any)).toBe(0)
    expect(countDiffLines(undefined as any)).toBe(0)
  })

  test("counts context lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
 line 2
 line 3`
    expect(countDiffLines(diff)).toBe(3)
  })

  test("counts addition lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,3 @@
 context
+added 1
+added 2`
    expect(countDiffLines(diff)).toBe(3)
  })

  test("counts deletion lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,1 @@
 context
-deleted 1
-deleted 2`
    expect(countDiffLines(diff)).toBe(3)
  })

  test("counts mixed changes correctly", () => {
    // simpleDiff has: 1 context, 1 deletion, 2 additions, 1 context = 5 lines
    expect(countDiffLines(simpleDiff)).toBe(5)
  })

  test("ignores header lines", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
 only this counts`
    expect(countDiffLines(diff)).toBe(1)
  })

  test("ignores hunk header lines (@@)", () => {
    expect(countDiffLines(multiHunkDiff)).toBe(10) // All content lines from both hunks
  })

  test("ignores 'No newline at end of file' markers", () => {
    expect(countDiffLines(noNewlineDiff)).toBe(3) // context + old + new
  })

  test("handles multiple hunks", () => {
    // multiHunkDiff: hunk1 has 5 content lines, hunk2 has 5 content lines
    expect(countDiffLines(multiHunkDiff)).toBe(10)
  })

  test("returns 0 for diff with no content lines", () => {
    const headerOnly = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt`
    expect(countDiffLines(headerOnly)).toBe(0)
  })
})
