import { parsePatch } from "diff";
import { Git } from "./git";

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

export function getHunkIndexForRow(
  content: string,
  file: string,
  row: number,
): number | null {
  const { hunks } = parseFileDiff(content, file);
  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i]!;
    if (row >= hunk.startRow && row <= hunk.endRow) return i;
  }
  return null;
}

function stripPrefix(path: string | undefined | null): string {
  if (!path) return "";
  return path.replace(/^a\//, "").replace(/^b\//, "");
}

export function parsePatchEntries(content: string): Git.Entry[] {
  if (!content.trim()) return [];

  const chunks = content.trimEnd().split(/\n(?=diff --git )/);
  const entries: Git.Entry[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const parsed = parsePatch(chunk);
    const patch = parsed[0];

    let file = "";
    if (patch) {
      const newName = stripPrefix(patch.newFileName);
      const oldName = stripPrefix(patch.oldFileName);
      file = newName !== "/dev/null" ? newName : oldName;
    }

    if (!file) {
      const first = chunk.split("\n")[0] ?? "";
      const match = first.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) file = match[2] ?? match[1] ?? "";
    }

    if (!file) continue;

    const isNew =
      patch?.oldFileName === "/dev/null" || chunk.includes("\nnew file mode");
    const isDeleted =
      patch?.newFileName === "/dev/null" ||
      chunk.includes("\ndeleted file mode");

    entries.push({ file, content: chunk, isNew, isDeleted });
  }

  return entries;
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
