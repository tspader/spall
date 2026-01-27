/**
 * Selection state for navigating diff lines/hunks
 */
export interface Selection {
  /** Starting line (0-indexed) */
  start: number;
  /** Ending line (0-indexed, inclusive) */
  end: number;
}

export interface SelectionState {
  /** Current selection range */
  selection: Selection;
  /** Whether we're in line-by-line mode (vs hunk mode) */
  lineMode: boolean;
  /** Total number of lines in the diff */
  totalLines: number;
}

/**
 * Create initial selection state
 */
export function createSelectionState(totalLines: number): SelectionState {
  return {
    selection: { start: 0, end: 0 },
    lineMode: false,
    totalLines,
  };
}

/**
 * Toggle between line mode and hunk mode
 */
export function toggleLineMode(state: SelectionState): SelectionState {
  return {
    ...state,
    lineMode: !state.lineMode,
  };
}

/**
 * Move selection down by one line (in line mode)
 * If shift is held, extend the selection range instead of moving
 */
export function moveDown(
  state: SelectionState,
  shift: boolean,
): SelectionState {
  const { selection, totalLines } = state;
  const maxLine = totalLines - 1;

  if (shift) {
    // Extend selection downward
    const newEnd = Math.min(selection.end + 1, maxLine);
    return {
      ...state,
      selection: { start: selection.start, end: newEnd },
    };
  } else {
    // Move entire selection down by one
    const newStart = Math.min(selection.end + 1, maxLine);
    return {
      ...state,
      selection: { start: newStart, end: newStart },
    };
  }
}

/**
 * Move selection up by one line (in line mode)
 * If shift is held, modify the selection range
 */
export function moveUp(state: SelectionState, shift: boolean): SelectionState {
  const { selection } = state;

  if (shift) {
    // Contract selection from bottom, or expand upward if at minimum
    if (selection.end > selection.start) {
      // Contract from bottom
      return {
        ...state,
        selection: { start: selection.start, end: selection.end - 1 },
      };
    } else {
      // Expand upward
      const newStart = Math.max(selection.start - 1, 0);
      return {
        ...state,
        selection: { start: newStart, end: selection.end },
      };
    }
  } else {
    // Move entire selection up by one
    const newStart = Math.max(selection.start - 1, 0);
    return {
      ...state,
      selection: { start: newStart, end: newStart },
    };
  }
}

/**
 * Reset selection to a single line
 */
export function resetSelection(
  state: SelectionState,
  line: number,
): SelectionState {
  const clampedLine = Math.max(0, Math.min(line, state.totalLines - 1));
  return {
    ...state,
    selection: { start: clampedLine, end: clampedLine },
  };
}

/**
 * Get the number of lines in the current selection
 */
export function getSelectionLineCount(selection: Selection): number {
  return selection.end - selection.start + 1;
}

/**
 * Check if a line is within the current selection
 */
export function isLineSelected(selection: Selection, line: number): boolean {
  return line >= selection.start && line <= selection.end;
}
