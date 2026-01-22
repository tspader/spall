import { describe, test, expect } from "bun:test"
import {
  buildFileTree,
  flattenTree,
  getFileIndices,
  findDisplayIndex,
  type FileTreeNode,
  type DisplayItem,
} from "./tree"
import type { DiffEntry } from "../lib/git"

// Helper to create a mock DiffEntry
function mockEntry(file: string, isNew = false): DiffEntry {
  return { file, content: "", isNew }
}

describe("buildFileTree", () => {
  test("handles flat files", () => {
    const entries = [mockEntry("README.md"), mockEntry("index.ts")]
    const tree = buildFileTree(entries)

    expect(tree.length).toBe(2)
    expect(tree[0]!.name).toBe("index.ts")
    expect(tree[0]!.type).toBe("file")
    expect(tree[1]!.name).toBe("README.md")
    expect(tree[1]!.type).toBe("file")
  })

  test("creates directory structure", () => {
    const entries = [mockEntry("src/index.ts"), mockEntry("src/utils.ts")]
    const tree = buildFileTree(entries)

    expect(tree.length).toBe(1)
    expect(tree[0]!.name).toBe("src")
    expect(tree[0]!.type).toBe("dir")
    expect(tree[0]!.children.length).toBe(2)
    expect(tree[0]!.children[0]!.name).toBe("index.ts")
    expect(tree[0]!.children[1]!.name).toBe("utils.ts")
  })

  test("handles deeply nested paths", () => {
    const entries = [
      mockEntry("packages/cli/src/index.ts"),
      mockEntry("packages/core/src/store.ts"),
    ]
    const tree = buildFileTree(entries)

    expect(tree.length).toBe(1)
    expect(tree[0]!.name).toBe("packages")
    expect(tree[0]!.children.length).toBe(2) // cli and core
  })

  test("sorts directories before files", () => {
    const entries = [
      mockEntry("z-file.ts"),
      mockEntry("a-dir/file.ts"),
      mockEntry("m-file.ts"),
    ]
    const tree = buildFileTree(entries)

    expect(tree[0]!.name).toBe("a-dir") // directory first
    expect(tree[1]!.name).toBe("m-file.ts") // then files alphabetically
    expect(tree[2]!.name).toBe("z-file.ts")
  })

  test("preserves entry indices", () => {
    const entries = [
      mockEntry("b.ts"),
      mockEntry("a.ts"),
      mockEntry("src/c.ts"),
    ]
    const tree = buildFileTree(entries)

    // src directory first, then a.ts, then b.ts
    expect(tree[0]!.name).toBe("src")
    expect(tree[0]!.children[0]!.entryIndex).toBe(2) // c.ts was index 2
    expect(tree[1]!.name).toBe("a.ts")
    expect(tree[1]!.entryIndex).toBe(1) // a.ts was index 1
    expect(tree[2]!.name).toBe("b.ts")
    expect(tree[2]!.entryIndex).toBe(0) // b.ts was index 0
  })

  test("sets correct status for new vs modified files", () => {
    const entries = [mockEntry("new.ts", true), mockEntry("modified.ts", false)]
    const tree = buildFileTree(entries)

    expect(tree[0]!.status).toBe("M") // modified.ts
    expect(tree[1]!.status).toBe("A") // new.ts
  })
})

describe("flattenTree", () => {
  test("flattens simple tree", () => {
    const entries = [mockEntry("src/index.ts"), mockEntry("README.md")]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    expect(items.length).toBe(3) // src dir, index.ts, README.md
    expect(items[0]!.node.name).toBe("src")
    expect(items[0]!.depth).toBe(0)
    expect(items[1]!.node.name).toBe("index.ts")
    expect(items[1]!.depth).toBe(1)
    expect(items[2]!.node.name).toBe("README.md")
    expect(items[2]!.depth).toBe(0)
  })

  test("collapses single-child directory chains", () => {
    const entries = [mockEntry("packages/cli/src/index.ts")]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    // Should collapse packages/cli/src into one directory entry
    expect(items.length).toBe(2) // collapsed dir + file
    expect(items[0]!.node.name).toBe("packages/cli/src")
    expect(items[0]!.node.type).toBe("dir")
    expect(items[1]!.node.name).toBe("index.ts")
    expect(items[1]!.depth).toBe(1)
  })

  test("does not collapse when directory has multiple children", () => {
    const entries = [
      mockEntry("packages/cli/src/index.ts"),
      mockEntry("packages/core/src/store.ts"),
    ]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    // packages has 2 children (cli, core) so it shouldn't collapse
    expect(items[0]!.node.name).toBe("packages")
    expect(items[0]!.depth).toBe(0)
    // But cli/src and core/src should each collapse
    expect(items[1]!.node.name).toBe("cli/src")
    expect(items[1]!.depth).toBe(1)
  })

  test("maintains correct depths after collapsing", () => {
    const entries = [
      mockEntry("packages/cli/src/index.ts"),
      mockEntry("packages/cli/src/utils.ts"),
    ]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    // packages/cli/src collapses since it's a chain
    expect(items[0]!.node.name).toBe("packages/cli/src")
    expect(items[0]!.depth).toBe(0)
    expect(items[1]!.node.name).toBe("index.ts")
    expect(items[1]!.depth).toBe(1)
    expect(items[2]!.node.name).toBe("utils.ts")
    expect(items[2]!.depth).toBe(1)
  })
})

describe("getFileIndices", () => {
  test("returns only file entry indices in display order", () => {
    const entries = [
      mockEntry("README.md"), // index 0
      mockEntry("src/index.ts"), // index 1
      mockEntry("src/utils.ts"), // index 2
    ]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)
    const indices = getFileIndices(items)

    // Display order: src (dir), index.ts, utils.ts, README.md
    expect(indices).toEqual([1, 2, 0])
  })

  test("skips directories", () => {
    const entries = [mockEntry("a/b/c.ts")]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)
    const indices = getFileIndices(items)

    expect(indices.length).toBe(1)
    expect(indices[0]).toBe(0)
  })
})

describe("findDisplayIndex", () => {
  test("finds correct display position for entry index", () => {
    const entries = [
      mockEntry("README.md"), // entry 0
      mockEntry("src/index.ts"), // entry 1
    ]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    // items: [src (dir), index.ts (entry 1), README.md (entry 0)]
    expect(findDisplayIndex(items, 0)).toBe(2) // README.md is at display index 2
    expect(findDisplayIndex(items, 1)).toBe(1) // index.ts is at display index 1
  })

  test("returns -1 for non-existent entry", () => {
    const entries = [mockEntry("file.ts")]
    const tree = buildFileTree(entries)
    const items = flattenTree(tree)

    expect(findDisplayIndex(items, 99)).toBe(-1)
  })
})
