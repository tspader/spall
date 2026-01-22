import { describe, test, expect } from "bun:test"
import {
  type LineSelection,
  addLineSelection,
  getLineSelectionsForFile,
  getFileLineSelectionCount,
  clearLineSelections,
  getLineSelectionCount,
} from "./line-selection"

describe("line-selection", () => {
  describe("addLineSelection", () => {
    test("adds to empty selection", () => {
      const result = addLineSelection([], 0, 5, 10)
      expect(result).toEqual([{ fileIndex: 0, startLine: 5, endLine: 10 }])
    })

    test("appends to existing selections", () => {
      const existing: LineSelection[] = [{ fileIndex: 0, startLine: 0, endLine: 5 }]
      const result = addLineSelection(existing, 1, 10, 15)
      expect(result).toEqual([
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 1, startLine: 10, endLine: 15 },
      ])
    })

    test("allows duplicate selections (no deduplication)", () => {
      const existing: LineSelection[] = [{ fileIndex: 0, startLine: 5, endLine: 10 }]
      const result = addLineSelection(existing, 0, 5, 10)
      expect(result).toEqual([
        { fileIndex: 0, startLine: 5, endLine: 10 },
        { fileIndex: 0, startLine: 5, endLine: 10 },
      ])
    })

    test("does not mutate original array", () => {
      const existing: LineSelection[] = [{ fileIndex: 0, startLine: 0, endLine: 5 }]
      const result = addLineSelection(existing, 1, 10, 15)
      expect(existing).toEqual([{ fileIndex: 0, startLine: 0, endLine: 5 }])
      expect(result).not.toBe(existing)
    })

    test("handles single line selection (start equals end)", () => {
      const result = addLineSelection([], 0, 5, 5)
      expect(result).toEqual([{ fileIndex: 0, startLine: 5, endLine: 5 }])
    })
  })

  describe("getLineSelectionsForFile", () => {
    test("returns empty array for empty selections", () => {
      expect(getLineSelectionsForFile([], 0)).toEqual([])
    })

    test("returns empty array when no matches for file", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 2, startLine: 10, endLine: 15 },
      ]
      expect(getLineSelectionsForFile(selections, 1)).toEqual([])
    })

    test("returns all selections for matching file", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 1, startLine: 10, endLine: 15 },
        { fileIndex: 0, startLine: 20, endLine: 25 },
        { fileIndex: 1, startLine: 30, endLine: 35 },
      ]
      expect(getLineSelectionsForFile(selections, 0)).toEqual([
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 0, startLine: 20, endLine: 25 },
      ])
    })

    test("returns selections in original order", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 20, endLine: 25 },
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 0, startLine: 10, endLine: 15 },
      ]
      const result = getLineSelectionsForFile(selections, 0)
      expect(result[0]!.startLine).toBe(20)
      expect(result[1]!.startLine).toBe(0)
      expect(result[2]!.startLine).toBe(10)
    })
  })

  describe("getFileLineSelectionCount", () => {
    test("returns 0 for empty selections", () => {
      expect(getFileLineSelectionCount([], 0)).toBe(0)
    })

    test("returns 0 for file with no selections", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 2, startLine: 10, endLine: 15 },
      ]
      expect(getFileLineSelectionCount(selections, 1)).toBe(0)
    })

    test("returns correct count for file", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 1, startLine: 10, endLine: 15 },
        { fileIndex: 0, startLine: 20, endLine: 25 },
        { fileIndex: 0, startLine: 30, endLine: 35 },
        { fileIndex: 1, startLine: 40, endLine: 45 },
      ]
      expect(getFileLineSelectionCount(selections, 0)).toBe(3)
      expect(getFileLineSelectionCount(selections, 1)).toBe(2)
      expect(getFileLineSelectionCount(selections, 2)).toBe(0)
    })
  })

  describe("clearLineSelections", () => {
    test("returns empty array", () => {
      expect(clearLineSelections()).toEqual([])
    })

    test("returned array is a new instance each time", () => {
      const a = clearLineSelections()
      const b = clearLineSelections()
      expect(a).not.toBe(b)
    })
  })

  describe("getLineSelectionCount", () => {
    test("returns 0 for empty selections", () => {
      expect(getLineSelectionCount([])).toBe(0)
    })

    test("returns total count across all files", () => {
      const selections: LineSelection[] = [
        { fileIndex: 0, startLine: 0, endLine: 5 },
        { fileIndex: 1, startLine: 10, endLine: 15 },
        { fileIndex: 0, startLine: 20, endLine: 25 },
      ]
      expect(getLineSelectionCount(selections)).toBe(3)
    })
  })
})
