import { describe, it, expect } from "bun:test"
import {
  type SelectedHunk,
  hunksEqual,
  isHunkSelected,
  toggleHunkSelection,
  addHunkToSelection,
  removeHunkFromSelection,
  clearSelection,
  getSelectionCount,
  getFileSelectionCount,
  getSelectedHunksForFile,
} from "./hunk-selection"

describe("hunk-selection", () => {
  describe("hunksEqual", () => {
    it("returns true for equal hunks", () => {
      const a: SelectedHunk = { fileIndex: 0, blockIndex: 1 }
      const b: SelectedHunk = { fileIndex: 0, blockIndex: 1 }
      expect(hunksEqual(a, b)).toBe(true)
    })

    it("returns false for different fileIndex", () => {
      const a: SelectedHunk = { fileIndex: 0, blockIndex: 1 }
      const b: SelectedHunk = { fileIndex: 1, blockIndex: 1 }
      expect(hunksEqual(a, b)).toBe(false)
    })

    it("returns false for different blockIndex", () => {
      const a: SelectedHunk = { fileIndex: 0, blockIndex: 1 }
      const b: SelectedHunk = { fileIndex: 0, blockIndex: 2 }
      expect(hunksEqual(a, b)).toBe(false)
    })
  })

  describe("isHunkSelected", () => {
    it("returns false for empty selection", () => {
      expect(isHunkSelected([], 0, 0)).toBe(false)
    })

    it("returns true when hunk is in selection", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 1 },
        { fileIndex: 1, blockIndex: 0 },
      ]
      expect(isHunkSelected(selection, 0, 1)).toBe(true)
      expect(isHunkSelected(selection, 1, 0)).toBe(true)
    })

    it("returns false when hunk is not in selection", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 1 }]
      expect(isHunkSelected(selection, 0, 0)).toBe(false)
      expect(isHunkSelected(selection, 1, 1)).toBe(false)
    })
  })

  describe("toggleHunkSelection", () => {
    it("adds hunk when not present", () => {
      const result = toggleHunkSelection([], 0, 1)
      expect(result).toEqual([{ fileIndex: 0, blockIndex: 1 }])
    })

    it("removes hunk when already present", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 1 }]
      const result = toggleHunkSelection(selection, 0, 1)
      expect(result).toEqual([])
    })

    it("does not mutate original array", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 0 }]
      const result = toggleHunkSelection(selection, 0, 1)
      expect(selection).toEqual([{ fileIndex: 0, blockIndex: 0 }])
      expect(result).not.toBe(selection)
    })

    it("preserves other hunks when removing", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 1 },
        { fileIndex: 1, blockIndex: 0 },
      ]
      const result = toggleHunkSelection(selection, 0, 1)
      expect(result).toEqual([
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 1, blockIndex: 0 },
      ])
    })

    it("handles toggling same hunk twice (add then remove)", () => {
      let selection: SelectedHunk[] = []
      selection = toggleHunkSelection(selection, 0, 1)
      expect(selection).toEqual([{ fileIndex: 0, blockIndex: 1 }])
      selection = toggleHunkSelection(selection, 0, 1)
      expect(selection).toEqual([])
    })
  })

  describe("addHunkToSelection", () => {
    it("adds hunk to empty selection", () => {
      const result = addHunkToSelection([], 0, 1)
      expect(result).toEqual([{ fileIndex: 0, blockIndex: 1 }])
    })

    it("does not duplicate if already present", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 1 }]
      const result = addHunkToSelection(selection, 0, 1)
      expect(result).toEqual([{ fileIndex: 0, blockIndex: 1 }])
      expect(result).toBe(selection) // Should return same reference
    })

    it("appends to existing selection", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 0 }]
      const result = addHunkToSelection(selection, 0, 1)
      expect(result).toEqual([
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 1 },
      ])
    })
  })

  describe("removeHunkFromSelection", () => {
    it("returns empty array when removing from empty", () => {
      const result = removeHunkFromSelection([], 0, 0)
      expect(result).toEqual([])
    })

    it("removes the specified hunk", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 1 },
      ]
      const result = removeHunkFromSelection(selection, 0, 0)
      expect(result).toEqual([{ fileIndex: 0, blockIndex: 1 }])
    })

    it("returns same content if hunk not present", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 0 }]
      const result = removeHunkFromSelection(selection, 1, 1)
      expect(result).toEqual([{ fileIndex: 0, blockIndex: 0 }])
    })
  })

  describe("clearSelection", () => {
    it("returns empty array", () => {
      expect(clearSelection()).toEqual([])
    })
  })

  describe("getSelectionCount", () => {
    it("returns 0 for empty selection", () => {
      expect(getSelectionCount([])).toBe(0)
    })

    it("returns correct count", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 1 },
        { fileIndex: 1, blockIndex: 0 },
      ]
      expect(getSelectionCount(selection)).toBe(3)
    })
  })

  describe("getFileSelectionCount", () => {
    it("returns 0 for empty selection", () => {
      expect(getFileSelectionCount([], 0)).toBe(0)
    })

    it("returns count for specific file", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 1 },
        { fileIndex: 1, blockIndex: 0 },
        { fileIndex: 1, blockIndex: 1 },
        { fileIndex: 1, blockIndex: 2 },
      ]
      expect(getFileSelectionCount(selection, 0)).toBe(2)
      expect(getFileSelectionCount(selection, 1)).toBe(3)
      expect(getFileSelectionCount(selection, 2)).toBe(0)
    })
  })

  describe("getSelectedHunksForFile", () => {
    it("returns empty array for no matches", () => {
      const selection: SelectedHunk[] = [{ fileIndex: 0, blockIndex: 0 }]
      expect(getSelectedHunksForFile(selection, 1)).toEqual([])
    })

    it("returns hunks for specific file", () => {
      const selection: SelectedHunk[] = [
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 2 },
        { fileIndex: 1, blockIndex: 1 },
      ]
      expect(getSelectedHunksForFile(selection, 0)).toEqual([
        { fileIndex: 0, blockIndex: 0 },
        { fileIndex: 0, blockIndex: 2 },
      ])
    })
  })
})
