import { parsePatch } from "diff";

export interface DiffHunk {
  diffString: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  skipBefore: number;
  lineCount: number;
  startRow: number;
  endRow: number;
}

export interface DiffFileModel {
  hunks: DiffHunk[];
  totalRows: number;
}

export function parseFileDiff(content: string, file: string): DiffFileModel {
  if (!content) return { hunks: [], totalRows: 0 };

  try {
    const patches = parsePatch(content);
    if (patches.length === 0 && !content.endsWith("\n")) {
      patches.push(...parsePatch(`${content}\n`));
    }
    if (patches.length === 0) return { hunks: [], totalRows: 0 };

    const rawHunks = patches[0]?.hunks ?? [];
    const hunks: DiffHunk[] = [];

    const header = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}`;

    let currentRow = 1;

    for (let i = 0; i < rawHunks.length; i++) {
      const hunk = rawHunks[i]!;

      let skipBefore = 0;
      if (i > 0) {
        const prev = rawHunks[i - 1]!;
        const prevEnd = prev.oldStart + prev.oldLines;
        skipBefore = hunk.oldStart - prevEnd;
      }

      const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
      const diffString = `${header}\n${hunkHeader}\n${hunk.lines.join("\n")}`;

      let lineCount = 0;
      for (const line of hunk.lines) {
        const c = line[0];
        if (c === " " || c === "+" || c === "-") lineCount++;
      }

      const startRow = currentRow;
      const endRow = currentRow + lineCount - 1;
      currentRow = endRow + 1;

      hunks.push({
        diffString,
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        skipBefore,
        lineCount,
        startRow,
        endRow,
      });
    }

    return { hunks, totalRows: Math.max(0, currentRow - 1) };
  } catch {
    return { hunks: [], totalRows: 0 };
  }
}

export function getHunkRowRange(
  content: string,
  file: string,
  hunkIndex: number,
): { startRow: number; endRow: number } | null {
  const { hunks } = parseFileDiff(content, file);
  const hunk = hunks[hunkIndex];
  if (!hunk) return null;
  return { startRow: hunk.startRow, endRow: hunk.endRow };
}
