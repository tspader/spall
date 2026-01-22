import type { DiffEntry } from "../lib/git"

/**
 * A node in the file tree - either a directory or a file
 */
export interface FileTreeNode {
  name: string // Just the segment name ("cli", "index.ts")
  path: string // Full path ("packages/cli/src/index.ts")
  type: "file" | "dir"
  status?: "M" | "A" // Only for files
  children: FileTreeNode[] // Empty for files
  entryIndex?: number // Only for files - index into original DiffEntry[] array
}

/**
 * A flattened item for display/rendering
 */
export interface DisplayItem {
  node: FileTreeNode
  depth: number // Indentation level
}

/**
 * Build a file tree from a list of diff entries.
 * Directories are sorted before files, then alphabetically within each group.
 */
export function buildFileTree(entries: DiffEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const parts = entry.file.split("/")
    insertPath(root, parts, 0, entry, i)
  }

  // Sort the tree recursively
  sortTree(root)

  return root
}

/**
 * Insert a file path into the tree, creating directory nodes as needed
 */
function insertPath(
  nodes: FileTreeNode[],
  parts: string[],
  partIndex: number,
  entry: DiffEntry,
  entryIndex: number
): void {
  if (partIndex >= parts.length) return

  const name = parts[partIndex]!
  const isLastPart = partIndex === parts.length - 1
  const fullPath = parts.slice(0, partIndex + 1).join("/")

  // Find existing node with this name
  let node = nodes.find((n) => n.name === name)

  if (!node) {
    // Create new node
    node = {
      name,
      path: fullPath,
      type: isLastPart ? "file" : "dir",
      children: [],
    }

    if (isLastPart) {
      // It's a file
      node.status = entry.isNew ? "A" : "M"
      node.entryIndex = entryIndex
    }

    nodes.push(node)
  }

  // If not the last part, recurse into children
  if (!isLastPart && node) {
    insertPath(node.children, parts, partIndex + 1, entry, entryIndex)
  }
}

/**
 * Sort tree: directories first, then files, alphabetically within each group
 */
function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    // Directories before files
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1
    }
    // Alphabetical within same type
    return a.name.localeCompare(b.name)
  })

  // Recursively sort children
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTree(node.children)
    }
  }
}

/**
 * Flatten the tree into a display list with depth information.
 * Collapses single-child directory chains (e.g., "packages/cli/src" instead of nested).
 */
export function flattenTree(nodes: FileTreeNode[]): DisplayItem[] {
  const items: DisplayItem[] = []
  flattenNodes(nodes, 0, items)
  return items
}

function flattenNodes(nodes: FileTreeNode[], depth: number, items: DisplayItem[]): void {
  for (const node of nodes) {
    if (node.type === "dir") {
      // Collapse single-child directory chains
      const collapsed = collapseDir(node)
      items.push({ node: collapsed, depth })
      flattenNodes(collapsed.children, depth + 1, items)
    } else {
      items.push({ node, depth })
    }
  }
}

/**
 * Collapse a chain of single-child directories into one node.
 * e.g., packages -> cli -> src with one file becomes "packages/cli/src"
 */
function collapseDir(node: FileTreeNode): FileTreeNode {
  let current = node
  const nameParts = [current.name]

  // Keep collapsing while we have exactly one child that is a directory
  while (current.children.length === 1 && current.children[0]!.type === "dir") {
    current = current.children[0]!
    nameParts.push(current.name)
  }

  if (nameParts.length === 1) {
    // No collapsing needed
    return node
  }

  // Return a new node with the collapsed name
  return {
    name: nameParts.join("/"),
    path: current.path,
    type: "dir",
    children: current.children,
  }
}

/**
 * Get the list of file entry indices from display items (for navigation).
 * Returns indices in display order.
 */
export function getFileIndices(items: DisplayItem[]): number[] {
  const indices: number[] = []
  for (const item of items) {
    if (item.node.type === "file" && item.node.entryIndex !== undefined) {
      indices.push(item.node.entryIndex)
    }
  }
  return indices
}

/**
 * Find the display index for a given file entry index
 */
export function findDisplayIndex(items: DisplayItem[], entryIndex: number): number {
  return items.findIndex((item) => item.node.type === "file" && item.node.entryIndex === entryIndex)
}
