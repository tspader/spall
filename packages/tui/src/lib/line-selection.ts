/**
 * Line selection state management for line-by-line mode.
 * Stores arbitrary line ranges selected by the user.
 *
 * Selections are keyed by file path (relative) for stability across refreshes.
 */

/**
 * A line range within a file.
 */
export interface LineRange {
  /** Starting line (0-indexed, inclusive) */
  startLine: number;
  /** Ending line (0-indexed, inclusive) */
  endLine: number;
}

/**
 * Map of file path -> array of line ranges
 */
export type LineSelections = Map<string, LineRange[]>;

/**
 * Create an empty line selections map.
 */
export function createLineSelections(): LineSelections {
  return new Map();
}

/**
 * Add a line selection (always adds, no toggle).
 * Returns a new Map (does not mutate).
 */
export function addLineSelection(
  selections: LineSelections,
  filePath: string,
  startLine: number,
  endLine: number,
): LineSelections {
  const newSelections = new Map(selections);
  const ranges = [...(selections.get(filePath) ?? [])];
  ranges.push({ startLine, endLine });
  newSelections.set(filePath, ranges);
  return newSelections;
}

/**
 * Get all line selections for a specific file.
 */
export function getLineSelectionsForFile(
  selections: LineSelections,
  filePath: string,
): LineRange[] {
  return selections.get(filePath) ?? [];
}

/**
 * Get the count of line selections for a specific file.
 */
export function getFileLineSelectionCount(
  selections: LineSelections,
  filePath: string,
): number {
  return selections.get(filePath)?.length ?? 0;
}

/**
 * Clear all line selections.
 */
export function clearLineSelections(): LineSelections {
  return new Map();
}

/**
 * Get the total count of line selections across all files.
 */
export function getLineSelectionCount(selections: LineSelections): number {
  let count = 0;
  for (const ranges of selections.values()) {
    count += ranges.length;
  }
  return count;
}

/**
 * Check if a file has any line selections.
 */
export function hasLineSelections(
  selections: LineSelections,
  filePath: string,
): boolean {
  return (selections.get(filePath)?.length ?? 0) > 0;
}
