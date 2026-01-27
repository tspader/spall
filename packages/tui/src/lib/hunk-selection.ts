/**
 * Hunk selection state management for multi-hunk comments.
 *
 * Selections are keyed by file path (relative) for stability across refreshes.
 */

/**
 * Map of file path -> Set of selected hunk indices
 */
export type HunkSelections = Map<string, Set<number>>;

/**
 * Create an empty hunk selections map.
 */
export function createHunkSelections(): HunkSelections {
  return new Map();
}

/**
 * Check if a hunk is selected.
 */
export function isHunkSelected(
  selections: HunkSelections,
  filePath: string,
  hunkIndex: number,
): boolean {
  return selections.get(filePath)?.has(hunkIndex) ?? false;
}

/**
 * Toggle a hunk in the selection set.
 * Returns a new Map (does not mutate).
 */
export function toggleHunkSelection(
  selections: HunkSelections,
  filePath: string,
  hunkIndex: number,
): HunkSelections {
  const newSelections = new Map(selections);
  const fileSet = new Set(selections.get(filePath) ?? []);

  if (fileSet.has(hunkIndex)) {
    fileSet.delete(hunkIndex);
    if (fileSet.size === 0) {
      newSelections.delete(filePath);
    } else {
      newSelections.set(filePath, fileSet);
    }
  } else {
    fileSet.add(hunkIndex);
    newSelections.set(filePath, fileSet);
  }

  return newSelections;
}

/**
 * Add a hunk to the selection if not already present.
 * Returns a new Map (does not mutate).
 */
export function addHunkToSelection(
  selections: HunkSelections,
  filePath: string,
  hunkIndex: number,
): HunkSelections {
  if (isHunkSelected(selections, filePath, hunkIndex)) {
    return selections;
  }
  const newSelections = new Map(selections);
  const fileSet = new Set(selections.get(filePath) ?? []);
  fileSet.add(hunkIndex);
  newSelections.set(filePath, fileSet);
  return newSelections;
}

/**
 * Remove a hunk from the selection.
 * Returns a new Map (does not mutate).
 */
export function removeHunkFromSelection(
  selections: HunkSelections,
  filePath: string,
  hunkIndex: number,
): HunkSelections {
  if (!isHunkSelected(selections, filePath, hunkIndex)) {
    return selections;
  }
  const newSelections = new Map(selections);
  const fileSet = new Set(selections.get(filePath)!);
  fileSet.delete(hunkIndex);
  if (fileSet.size === 0) {
    newSelections.delete(filePath);
  } else {
    newSelections.set(filePath, fileSet);
  }
  return newSelections;
}

/**
 * Clear all selections.
 */
export function clearHunkSelections(): HunkSelections {
  return new Map();
}

/**
 * Get the total count of selected hunks across all files.
 */
export function getHunkSelectionCount(selections: HunkSelections): number {
  let count = 0;
  for (const fileSet of selections.values()) {
    count += fileSet.size;
  }
  return count;
}

/**
 * Get the count of selected hunks for a specific file.
 */
export function getFileHunkSelectionCount(
  selections: HunkSelections,
  filePath: string,
): number {
  return selections.get(filePath)?.size ?? 0;
}

/**
 * Get all selected hunk indices for a specific file.
 */
export function getSelectedHunksForFile(
  selections: HunkSelections,
  filePath: string,
): number[] {
  const fileSet = selections.get(filePath);
  return fileSet ? Array.from(fileSet) : [];
}

/**
 * Check if a file has any selected hunks.
 */
export function hasSelectedHunks(
  selections: HunkSelections,
  filePath: string,
): boolean {
  return (selections.get(filePath)?.size ?? 0) > 0;
}
