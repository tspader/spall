/**
 * Hunk selection state management for multi-hunk comments.
 * A "hunk" here refers to a ChangeBlock - a contiguous group of changed lines.
 */

/**
 * Identifies a specific hunk within the diff set.
 */
export interface SelectedHunk {
  /** Index into the entries array (which file) */
  fileIndex: number
  /** Index into that file's blocks array (which hunk) */
  blockIndex: number
}

/**
 * Check if two hunks are equal (same file and block).
 */
export function hunksEqual(a: SelectedHunk, b: SelectedHunk): boolean {
  return a.fileIndex === b.fileIndex && a.blockIndex === b.blockIndex
}

/**
 * Check if a hunk is in the selection set.
 */
export function isHunkSelected(
  selection: SelectedHunk[],
  fileIndex: number,
  blockIndex: number
): boolean {
  return selection.some(
    (h) => h.fileIndex === fileIndex && h.blockIndex === blockIndex
  )
}

/**
 * Toggle a hunk in the selection set.
 * If the hunk is already selected, remove it.
 * If the hunk is not selected, add it.
 * Returns a new array (does not mutate).
 */
export function toggleHunkSelection(
  selection: SelectedHunk[],
  fileIndex: number,
  blockIndex: number
): SelectedHunk[] {
  const exists = isHunkSelected(selection, fileIndex, blockIndex)
  
  if (exists) {
    // Remove the hunk
    return selection.filter(
      (h) => !(h.fileIndex === fileIndex && h.blockIndex === blockIndex)
    )
  } else {
    // Add the hunk
    return [...selection, { fileIndex, blockIndex }]
  }
}

/**
 * Add a hunk to the selection if not already present.
 * Returns a new array (does not mutate).
 */
export function addHunkToSelection(
  selection: SelectedHunk[],
  fileIndex: number,
  blockIndex: number
): SelectedHunk[] {
  if (isHunkSelected(selection, fileIndex, blockIndex)) {
    return selection
  }
  return [...selection, { fileIndex, blockIndex }]
}

/**
 * Remove a hunk from the selection.
 * Returns a new array (does not mutate).
 */
export function removeHunkFromSelection(
  selection: SelectedHunk[],
  fileIndex: number,
  blockIndex: number
): SelectedHunk[] {
  return selection.filter(
    (h) => !(h.fileIndex === fileIndex && h.blockIndex === blockIndex)
  )
}

/**
 * Clear all selections.
 */
export function clearSelection(): SelectedHunk[] {
  return []
}

/**
 * Get the count of selected hunks.
 */
export function getSelectionCount(selection: SelectedHunk[]): number {
  return selection.length
}

/**
 * Get the count of selected hunks for a specific file.
 */
export function getFileSelectionCount(
  selection: SelectedHunk[],
  fileIndex: number
): number {
  return selection.filter((h) => h.fileIndex === fileIndex).length
}

/**
 * Get all selected hunks for a specific file.
 */
export function getSelectedHunksForFile(
  selection: SelectedHunk[],
  fileIndex: number
): SelectedHunk[] {
  return selection.filter((h) => h.fileIndex === fileIndex)
}
