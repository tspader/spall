import { describe, it, expect } from "bun:test";
import {
  type HunkSelections,
  createHunkSelections,
  isHunkSelected,
  toggleHunkSelection,
  addHunkToSelection,
  removeHunkFromSelection,
  clearHunkSelections,
  getHunkSelectionCount,
  getFileHunkSelectionCount,
  getSelectedHunksForFile,
  hasSelectedHunks,
} from "./hunk-selection";

describe("hunk-selection", () => {
  describe("createHunkSelections", () => {
    it("returns empty map", () => {
      const selections = createHunkSelections();
      expect(selections.size).toBe(0);
    });
  });

  describe("isHunkSelected", () => {
    it("returns false for empty selection", () => {
      const selections = createHunkSelections();
      expect(isHunkSelected(selections, "file.ts", 0)).toBe(false);
    });

    it("returns true when hunk is in selection", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 1);
      selections = addHunkToSelection(selections, "file2.ts", 0);
      expect(isHunkSelected(selections, "file1.ts", 1)).toBe(true);
      expect(isHunkSelected(selections, "file2.ts", 0)).toBe(true);
    });

    it("returns false when hunk is not in selection", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 1);
      expect(isHunkSelected(selections, "file1.ts", 0)).toBe(false);
      expect(isHunkSelected(selections, "file2.ts", 1)).toBe(false);
    });
  });

  describe("toggleHunkSelection", () => {
    it("adds hunk when not present", () => {
      const selections = createHunkSelections();
      const result = toggleHunkSelection(selections, "file.ts", 1);
      expect(isHunkSelected(result, "file.ts", 1)).toBe(true);
    });

    it("removes hunk when already present", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 1);
      const result = toggleHunkSelection(selections, "file.ts", 1);
      expect(isHunkSelected(result, "file.ts", 1)).toBe(false);
    });

    it("does not mutate original map", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      const result = toggleHunkSelection(selections, "file.ts", 1);
      expect(isHunkSelected(selections, "file.ts", 1)).toBe(false);
      expect(result).not.toBe(selections);
    });

    it("preserves other hunks when removing", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      selections = addHunkToSelection(selections, "file1.ts", 1);
      selections = addHunkToSelection(selections, "file2.ts", 0);
      const result = toggleHunkSelection(selections, "file1.ts", 1);
      expect(isHunkSelected(result, "file1.ts", 0)).toBe(true);
      expect(isHunkSelected(result, "file1.ts", 1)).toBe(false);
      expect(isHunkSelected(result, "file2.ts", 0)).toBe(true);
    });

    it("handles toggling same hunk twice (add then remove)", () => {
      let selections = createHunkSelections();
      selections = toggleHunkSelection(selections, "file.ts", 1);
      expect(isHunkSelected(selections, "file.ts", 1)).toBe(true);
      selections = toggleHunkSelection(selections, "file.ts", 1);
      expect(isHunkSelected(selections, "file.ts", 1)).toBe(false);
    });

    it("removes file entry when last hunk is removed", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      selections = toggleHunkSelection(selections, "file.ts", 0);
      expect(selections.has("file.ts")).toBe(false);
    });
  });

  describe("addHunkToSelection", () => {
    it("adds hunk to empty selection", () => {
      const selections = createHunkSelections();
      const result = addHunkToSelection(selections, "file.ts", 1);
      expect(isHunkSelected(result, "file.ts", 1)).toBe(true);
    });

    it("does not duplicate if already present", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 1);
      const result = addHunkToSelection(selections, "file.ts", 1);
      expect(getFileHunkSelectionCount(result, "file.ts")).toBe(1);
      expect(result).toBe(selections); // Should return same reference
    });

    it("appends to existing selection", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      const result = addHunkToSelection(selections, "file.ts", 1);
      expect(isHunkSelected(result, "file.ts", 0)).toBe(true);
      expect(isHunkSelected(result, "file.ts", 1)).toBe(true);
    });
  });

  describe("removeHunkFromSelection", () => {
    it("returns same map when removing from empty", () => {
      const selections = createHunkSelections();
      const result = removeHunkFromSelection(selections, "file.ts", 0);
      expect(result).toBe(selections);
    });

    it("removes the specified hunk", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      selections = addHunkToSelection(selections, "file.ts", 1);
      const result = removeHunkFromSelection(selections, "file.ts", 0);
      expect(isHunkSelected(result, "file.ts", 0)).toBe(false);
      expect(isHunkSelected(result, "file.ts", 1)).toBe(true);
    });

    it("returns same map if hunk not present", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      const result = removeHunkFromSelection(selections, "file.ts", 1);
      expect(result).toBe(selections);
    });
  });

  describe("clearHunkSelections", () => {
    it("returns empty map", () => {
      const result = clearHunkSelections();
      expect(result.size).toBe(0);
    });
  });

  describe("getHunkSelectionCount", () => {
    it("returns 0 for empty selection", () => {
      const selections = createHunkSelections();
      expect(getHunkSelectionCount(selections)).toBe(0);
    });

    it("returns correct count across files", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      selections = addHunkToSelection(selections, "file1.ts", 1);
      selections = addHunkToSelection(selections, "file2.ts", 0);
      expect(getHunkSelectionCount(selections)).toBe(3);
    });
  });

  describe("getFileHunkSelectionCount", () => {
    it("returns 0 for empty selection", () => {
      const selections = createHunkSelections();
      expect(getFileHunkSelectionCount(selections, "file.ts")).toBe(0);
    });

    it("returns count for specific file", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      selections = addHunkToSelection(selections, "file1.ts", 1);
      selections = addHunkToSelection(selections, "file2.ts", 0);
      selections = addHunkToSelection(selections, "file2.ts", 1);
      selections = addHunkToSelection(selections, "file2.ts", 2);
      expect(getFileHunkSelectionCount(selections, "file1.ts")).toBe(2);
      expect(getFileHunkSelectionCount(selections, "file2.ts")).toBe(3);
      expect(getFileHunkSelectionCount(selections, "file3.ts")).toBe(0);
    });
  });

  describe("getSelectedHunksForFile", () => {
    it("returns empty array for no matches", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      expect(getSelectedHunksForFile(selections, "file2.ts")).toEqual([]);
    });

    it("returns hunk indices for specific file", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      selections = addHunkToSelection(selections, "file1.ts", 2);
      selections = addHunkToSelection(selections, "file2.ts", 1);
      const result = getSelectedHunksForFile(selections, "file1.ts");
      expect(result.sort()).toEqual([0, 2]);
    });
  });

  describe("hasSelectedHunks", () => {
    it("returns false for empty selection", () => {
      const selections = createHunkSelections();
      expect(hasSelectedHunks(selections, "file.ts")).toBe(false);
    });

    it("returns true when file has selections", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file.ts", 0);
      expect(hasSelectedHunks(selections, "file.ts")).toBe(true);
    });

    it("returns false for different file", () => {
      let selections = createHunkSelections();
      selections = addHunkToSelection(selections, "file1.ts", 0);
      expect(hasSelectedHunks(selections, "file2.ts")).toBe(false);
    });
  });
});
