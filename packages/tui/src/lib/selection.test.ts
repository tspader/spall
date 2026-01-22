import { describe, test, expect } from "bun:test"
import {
  createSelectionState,
  toggleLineMode,
  moveDown,
  moveUp,
  setBlockSelection,
  resetSelection,
  getSelectionLineCount,
  isLineSelected,
} from "./selection"

describe("createSelectionState", () => {
  test("creates initial state with selection at 0", () => {
    const state = createSelectionState(100)
    expect(state.selection.start).toBe(0)
    expect(state.selection.end).toBe(0)
    expect(state.lineMode).toBe(false)
    expect(state.totalLines).toBe(100)
  })
})

describe("toggleLineMode", () => {
  test("toggles from false to true", () => {
    const state = createSelectionState(100)
    const newState = toggleLineMode(state)
    expect(newState.lineMode).toBe(true)
  })

  test("toggles from true to false", () => {
    const state = { ...createSelectionState(100), lineMode: true }
    const newState = toggleLineMode(state)
    expect(newState.lineMode).toBe(false)
  })

  test("preserves selection when toggling", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 10 },
    }
    const newState = toggleLineMode(state)
    expect(newState.selection.start).toBe(5)
    expect(newState.selection.end).toBe(10)
  })
})

describe("moveDown", () => {
  test("moves selection down by one line without shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 5 },
    }
    const newState = moveDown(state, false)
    expect(newState.selection.start).toBe(6)
    expect(newState.selection.end).toBe(6)
  })

  test("moves to end of range when selection spans multiple lines", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 10 },
    }
    const newState = moveDown(state, false)
    expect(newState.selection.start).toBe(11)
    expect(newState.selection.end).toBe(11)
  })

  test("extends selection downward with shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 5 },
    }
    const newState = moveDown(state, true)
    expect(newState.selection.start).toBe(5)
    expect(newState.selection.end).toBe(6)
  })

  test("continues extending selection downward with shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 10 },
    }
    const newState = moveDown(state, true)
    expect(newState.selection.start).toBe(5)
    expect(newState.selection.end).toBe(11)
  })

  test("clamps at max line without shift", () => {
    const state = {
      ...createSelectionState(10),
      selection: { start: 9, end: 9 },
    }
    const newState = moveDown(state, false)
    expect(newState.selection.start).toBe(9)
    expect(newState.selection.end).toBe(9)
  })

  test("clamps at max line with shift", () => {
    const state = {
      ...createSelectionState(10),
      selection: { start: 5, end: 9 },
    }
    const newState = moveDown(state, true)
    expect(newState.selection.start).toBe(5)
    expect(newState.selection.end).toBe(9)
  })
})

describe("moveUp", () => {
  test("moves selection up by one line without shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 5 },
    }
    const newState = moveUp(state, false)
    expect(newState.selection.start).toBe(4)
    expect(newState.selection.end).toBe(4)
  })

  test("contracts selection from bottom with shift when range > 1", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 10 },
    }
    const newState = moveUp(state, true)
    expect(newState.selection.start).toBe(5)
    expect(newState.selection.end).toBe(9)
  })

  test("expands selection upward with shift when range is 1", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 5 },
    }
    const newState = moveUp(state, true)
    expect(newState.selection.start).toBe(4)
    expect(newState.selection.end).toBe(5)
  })

  test("clamps at 0 without shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 0, end: 0 },
    }
    const newState = moveUp(state, false)
    expect(newState.selection.start).toBe(0)
    expect(newState.selection.end).toBe(0)
  })

  test("clamps at 0 with shift", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 0, end: 5 },
    }
    const newState = moveUp(state, true)
    expect(newState.selection.start).toBe(0)
    expect(newState.selection.end).toBe(4)
  })
})

describe("setBlockSelection", () => {
  test("sets selection to block range", () => {
    const state = createSelectionState(100)
    const newState = setBlockSelection(state, 10, 20)
    expect(newState.selection.start).toBe(10)
    expect(newState.selection.end).toBe(20)
  })

  test("clamps to valid range", () => {
    const state = createSelectionState(50)
    const newState = setBlockSelection(state, -5, 100)
    expect(newState.selection.start).toBe(0)
    expect(newState.selection.end).toBe(49)
  })
})

describe("resetSelection", () => {
  test("resets to single line", () => {
    const state = {
      ...createSelectionState(100),
      selection: { start: 5, end: 20 },
    }
    const newState = resetSelection(state, 15)
    expect(newState.selection.start).toBe(15)
    expect(newState.selection.end).toBe(15)
  })

  test("clamps to valid range", () => {
    const state = createSelectionState(50)
    const newState = resetSelection(state, 100)
    expect(newState.selection.start).toBe(49)
    expect(newState.selection.end).toBe(49)
  })
})

describe("getSelectionLineCount", () => {
  test("returns 1 for single line selection", () => {
    expect(getSelectionLineCount({ start: 5, end: 5 })).toBe(1)
  })

  test("returns correct count for range", () => {
    expect(getSelectionLineCount({ start: 5, end: 10 })).toBe(6)
  })
})

describe("isLineSelected", () => {
  test("returns true for lines in selection", () => {
    const selection = { start: 5, end: 10 }
    expect(isLineSelected(selection, 5)).toBe(true)
    expect(isLineSelected(selection, 7)).toBe(true)
    expect(isLineSelected(selection, 10)).toBe(true)
  })

  test("returns false for lines outside selection", () => {
    const selection = { start: 5, end: 10 }
    expect(isLineSelected(selection, 4)).toBe(false)
    expect(isLineSelected(selection, 11)).toBe(false)
  })
})

describe("integration: shift-down then shift-up sequence", () => {
  test("shift-down expands, shift-up contracts, shift-up again contracts to single line", () => {
    let state = {
      ...createSelectionState(100),
      selection: { start: 10, end: 10 },
    }

    // shift-down: 10-11
    state = moveDown(state, true)
    expect(state.selection).toEqual({ start: 10, end: 11 })

    // shift-down: 10-12
    state = moveDown(state, true)
    expect(state.selection).toEqual({ start: 10, end: 12 })

    // shift-up: 10-11 (contract)
    state = moveUp(state, true)
    expect(state.selection).toEqual({ start: 10, end: 11 })

    // shift-up: 10-10 (contract to single)
    state = moveUp(state, true)
    expect(state.selection).toEqual({ start: 10, end: 10 })

    // shift-up: 9-10 (now expand upward)
    state = moveUp(state, true)
    expect(state.selection).toEqual({ start: 9, end: 10 })
  })
})
