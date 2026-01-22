import { $ } from "bun"
import { parsePatch } from "diff"

export interface DiffEntry {
  file: string
  content: string
  isNew: boolean
}

export interface ChangeBlock {
  startLine: number // Line index in the rendered diff where this block starts (0-indexed)
  lineCount: number // Number of lines in this block
  content: string // The raw diff content of this block (with +/- prefixes)
}

/**
 * Parse change blocks from a unified diff string.
 * A change block is a contiguous group of lines containing - and/or + (no context lines).
 * Returns blocks with their starting line position in the rendered diff output.
 *
 * Note: The <diff> component only renders hunk content lines (no headers),
 * so startLine is 0-indexed from the first content line.
 */
export function parseChangeBlocks(diffContent: string): ChangeBlock[] {
  if (!diffContent) return []

  try {
    const patches = parsePatch(diffContent)
    if (patches.length === 0) return []

    const hunks = patches[0]?.hunks ?? []
    const blocks: ChangeBlock[] = []

    // The diff component renders only content lines from hunks (no headers)
    // So we track the rendered line index starting from 0
    let renderedLineIndex = 0

    for (const hunk of hunks) {
      let lineIndex = 0
      while (lineIndex < hunk.lines.length) {
        const line = hunk.lines[lineIndex]
        const firstChar = line?.[0]

        // Only count lines that get rendered (+, -, or space for context)
        if (firstChar === "-" || firstChar === "+") {
          // Start of a change block
          const blockStart = renderedLineIndex
          let blockLineCount = 0
          const blockLines: string[] = []

          // Count all consecutive change lines
          while (lineIndex < hunk.lines.length) {
            const blockLine = hunk.lines[lineIndex]
            const blockChar = blockLine?.[0]
            if (blockChar !== "-" && blockChar !== "+") break
            blockLines.push(blockLine!)
            blockLineCount++
            renderedLineIndex++
            lineIndex++
          }

          blocks.push({
            startLine: blockStart,
            lineCount: blockLineCount,
            content: blockLines.join("\n"),
          })
        } else if (firstChar === " ") {
          // Context line - rendered but not part of a change block
          renderedLineIndex++
          lineIndex++
        } else {
          // Other lines (like "\ No newline at end of file") - skip
          lineIndex++
        }
      }
    }

    return blocks
  } catch {
    return []
  }
}

/**
 * Count the number of rendered lines in a diff.
 * Only counts content lines (context, additions, deletions) - not headers.
 * This matches what the <diff> component actually renders.
 */
export function countDiffLines(diffContent: string): number {
  if (!diffContent) return 0
  const lines = diffContent.split("\n")
  let count = 0
  let inHunk = false
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    const firstChar = line[0]
    // Count context, additions, and deletions
    if (firstChar === " " || firstChar === "+" || firstChar === "-") {
      count++
    }
  }
  return count
}

export async function getDiffEntries(repoPath: string): Promise<DiffEntry[]> {
  const entries: DiffEntry[] = []

  // Get list of tracked changed files (staged + unstaged vs HEAD)
  const filesResult = await $`git -C ${repoPath} diff HEAD --name-only`.quiet()
  const filesOutput = filesResult.stdout.toString().trim()
  const trackedFiles = filesOutput ? filesOutput.split("\n").filter(Boolean) : []

  for (const file of trackedFiles) {
    const diffResult = await $`git -C ${repoPath} diff HEAD -- ${file}`.quiet()
    const content = diffResult.stdout.toString()
    entries.push({ file, content, isNew: false })
  }

  // Get untracked files
  const untrackedResult = await $`git -C ${repoPath} ls-files --others --exclude-standard`.quiet()
  const untrackedOutput = untrackedResult.stdout.toString().trim()
  const untrackedFiles = untrackedOutput ? untrackedOutput.split("\n").filter(Boolean) : []

  for (const file of untrackedFiles) {
    // Create a diff-like output for new files
    const fileContent = await Bun.file(`${repoPath}/${file}`).text()
    const lines = fileContent.split("\n")
    const diffLines = lines.map((line) => `+${line}`)
    const content = `diff --git a/${file} b/${file}
new file mode 100644
--- /dev/null
+++ b/${file}
@@ -0,0 +1,${lines.length} @@
${diffLines.join("\n")}`
    entries.push({ file, content, isNew: true })
  }

  return entries
}
