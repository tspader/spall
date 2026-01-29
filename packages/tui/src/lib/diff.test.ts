import { describe, test, expect } from "bun:test";
import { parseFileDiff } from "./diff";

const multiHunkDiff = `diff --git a/file.txt b/file.txt
index 1234567..abcdef0 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 context 1
-old 1
+new 1
@@ -5,2 +5,3 @@
 context 2
-old 2
+new 2
+new 3
`;

describe("parseFileDiff", () => {
  test("returns hunks with row ranges", () => {
    const result = parseFileDiff(multiHunkDiff, "file.txt");
    expect(result.hunks).toHaveLength(2);
    expect(result.totalRows).toBe(7);

    expect(result.hunks[0]!.startRow).toBe(1);
    expect(result.hunks[0]!.endRow).toBe(3);
    expect(result.hunks[0]!.lineCount).toBe(3);

    expect(result.hunks[1]!.startRow).toBe(4);
    expect(result.hunks[1]!.endRow).toBe(7);
    expect(result.hunks[1]!.lineCount).toBe(4);
  });
});
