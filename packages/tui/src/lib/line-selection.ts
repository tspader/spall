/**
 * Line selection state management for line-by-line mode.
 * Stores arbitrary line ranges selected by the user.
 */

/**
 * Identifies a specific line range within a file.
 */
export interface LineSelection {
  /** Index into the entries array (which file) */
  fileIndex: number
  /** Starting line (0-indexed, inclusive) */
  startLine: number
  /** Ending line (0-indexed, inclusive) */
  endLine: number
}

/**
 * Add a line selection (always adds, no toggle).
 * Returns a new array (does not mutate).
 */
export function addLineSelection(
  selections: LineSelection[],
  fileIndex: number,
  startLine: number,
  endLine: number
): LineSelection[] {
  return [...selections, { fileIndex, startLine, endLine }]
}

/**
 * Get all line selections for a specific file.
 */
export function getLineSelectionsForFile(
  selections: LineSelection[],
  fileIndex: number
): LineSelection[] {
  return selections.filter((s) => s.fileIndex === fileIndex)
}

/**
 * Get the count of line selections for a specific file.
 */
export function getFileLineSelectionCount(
  selections: LineSelection[],
  fileIndex: number
): number {
  return selections.filter((s) => s.fileIndex === fileIndex).length
}

/**
 * Clear all line selections.
 */
export function clearLineSelections(): LineSelection[] {
  return []
}

/**
 * Get the total count of line selections.
 */
export function getLineSelectionCount(selections: LineSelection[]): number {
  return selections.length
}
