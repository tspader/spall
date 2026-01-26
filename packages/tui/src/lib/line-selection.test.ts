import { describe, test, expect } from "bun:test";
import {
  type LineSelections,
  type LineRange,
  createLineSelections,
  addLineSelection,
  getLineSelectionsForFile,
  getFileLineSelectionCount,
  clearLineSelections,
  getLineSelectionCount,
  hasLineSelections,
} from "./line-selection";

describe("line-selection", () => {
  describe("createLineSelections", () => {
    test("returns empty map", () => {
      const selections = createLineSelections();
      expect(selections.size).toBe(0);
    });
  });

  describe("addLineSelection", () => {
    test("adds to empty selection", () => {
      const selections = createLineSelections();
      const result = addLineSelection(selections, "file.ts", 5, 10);
      expect(getLineSelectionsForFile(result, "file.ts")).toEqual([
        { startLine: 5, endLine: 10 },
      ]);
    });

    test("appends to existing selections", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      const result = addLineSelection(selections, "file2.ts", 10, 15);
      expect(getLineSelectionsForFile(result, "file1.ts")).toEqual([
        { startLine: 0, endLine: 5 },
      ]);
      expect(getLineSelectionsForFile(result, "file2.ts")).toEqual([
        { startLine: 10, endLine: 15 },
      ]);
    });

    test("allows duplicate selections (no deduplication)", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file.ts", 5, 10);
      const result = addLineSelection(selections, "file.ts", 5, 10);
      expect(getLineSelectionsForFile(result, "file.ts")).toEqual([
        { startLine: 5, endLine: 10 },
        { startLine: 5, endLine: 10 },
      ]);
    });

    test("does not mutate original map", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file.ts", 0, 5);
      const result = addLineSelection(selections, "file.ts", 10, 15);
      expect(getLineSelectionsForFile(selections, "file.ts")).toEqual([
        { startLine: 0, endLine: 5 },
      ]);
      expect(result).not.toBe(selections);
    });

    test("handles single line selection (start equals end)", () => {
      const selections = createLineSelections();
      const result = addLineSelection(selections, "file.ts", 5, 5);
      expect(getLineSelectionsForFile(result, "file.ts")).toEqual([
        { startLine: 5, endLine: 5 },
      ]);
    });
  });

  describe("getLineSelectionsForFile", () => {
    test("returns empty array for empty selections", () => {
      const selections = createLineSelections();
      expect(getLineSelectionsForFile(selections, "file.ts")).toEqual([]);
    });

    test("returns empty array when no matches for file", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      selections = addLineSelection(selections, "file3.ts", 10, 15);
      expect(getLineSelectionsForFile(selections, "file2.ts")).toEqual([]);
    });

    test("returns all selections for matching file", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      selections = addLineSelection(selections, "file2.ts", 10, 15);
      selections = addLineSelection(selections, "file1.ts", 20, 25);
      selections = addLineSelection(selections, "file2.ts", 30, 35);
      expect(getLineSelectionsForFile(selections, "file1.ts")).toEqual([
        { startLine: 0, endLine: 5 },
        { startLine: 20, endLine: 25 },
      ]);
    });

    test("returns selections in original order", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file.ts", 20, 25);
      selections = addLineSelection(selections, "file.ts", 0, 5);
      selections = addLineSelection(selections, "file.ts", 10, 15);
      const result = getLineSelectionsForFile(selections, "file.ts");
      expect(result[0]!.startLine).toBe(20);
      expect(result[1]!.startLine).toBe(0);
      expect(result[2]!.startLine).toBe(10);
    });
  });

  describe("getFileLineSelectionCount", () => {
    test("returns 0 for empty selections", () => {
      const selections = createLineSelections();
      expect(getFileLineSelectionCount(selections, "file.ts")).toBe(0);
    });

    test("returns 0 for file with no selections", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      selections = addLineSelection(selections, "file3.ts", 10, 15);
      expect(getFileLineSelectionCount(selections, "file2.ts")).toBe(0);
    });

    test("returns correct count for file", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      selections = addLineSelection(selections, "file2.ts", 10, 15);
      selections = addLineSelection(selections, "file1.ts", 20, 25);
      selections = addLineSelection(selections, "file1.ts", 30, 35);
      selections = addLineSelection(selections, "file2.ts", 40, 45);
      expect(getFileLineSelectionCount(selections, "file1.ts")).toBe(3);
      expect(getFileLineSelectionCount(selections, "file2.ts")).toBe(2);
      expect(getFileLineSelectionCount(selections, "file3.ts")).toBe(0);
    });
  });

  describe("clearLineSelections", () => {
    test("returns empty map", () => {
      const result = clearLineSelections();
      expect(result.size).toBe(0);
    });

    test("returned map is a new instance each time", () => {
      const a = clearLineSelections();
      const b = clearLineSelections();
      expect(a).not.toBe(b);
    });
  });

  describe("getLineSelectionCount", () => {
    test("returns 0 for empty selections", () => {
      const selections = createLineSelections();
      expect(getLineSelectionCount(selections)).toBe(0);
    });

    test("returns total count across all files", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      selections = addLineSelection(selections, "file2.ts", 10, 15);
      selections = addLineSelection(selections, "file1.ts", 20, 25);
      expect(getLineSelectionCount(selections)).toBe(3);
    });
  });

  describe("hasLineSelections", () => {
    test("returns false for empty selections", () => {
      const selections = createLineSelections();
      expect(hasLineSelections(selections, "file.ts")).toBe(false);
    });

    test("returns true when file has selections", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file.ts", 0, 5);
      expect(hasLineSelections(selections, "file.ts")).toBe(true);
    });

    test("returns false for different file", () => {
      let selections = createLineSelections();
      selections = addLineSelection(selections, "file1.ts", 0, 5);
      expect(hasLineSelections(selections, "file2.ts")).toBe(false);
    });
  });
});
