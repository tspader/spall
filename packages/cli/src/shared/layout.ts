import { defaultTheme as theme } from "./theme";

export const CLEAR = "\x1b[K";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function truncateMiddle(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  const half = (max - 3) >> 1;
  return s.slice(0, half + ((max - 3) & 1)) + "..." + s.slice(-half);
}

function truncateStart(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 3) return "...".slice(0, max);
  return "..." + s.slice(-(max - 3));
}

function truncateEnd(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 3) return "...".slice(0, max);
  return s.slice(0, max - 3) + "...";
}

// Clean escaped chars (tabs/newlines) by replacing with spaces
export function cleanEscapes(s: string): string {
  return s.replace(/[\t\n]/g, " ");
}

function displayText(s: string): string {
  // Make width calculations match what we print.
  return cleanEscapes(stripAnsi(s));
}

export type TableOptions = {
  maxWidth?: number;
  flex?: number[];
  noTruncate?: boolean[]; // Columns that should not be truncated
  min?: number[]; // Minimum widths for columns (only used when constrained)
  truncate?: ("start" | "middle" | "end")[]; // Truncation style per column
  format?: ((s: string, row: number, col: number) => string)[]; // Formatting only; must not change visual width
  maxRows?: number; // Maximum number of rows to display
};

export function table(
  headers: string[],
  columns: string[][],
  opts?: TableOptions,
): void {
  const numCols = headers.length;
  const gap = 2;

  if (numCols === 0) return;

  const flex = opts?.flex ?? [];
  const noTruncate = opts?.noTruncate ?? [];
  const min = opts?.min ?? [];
  const truncate = opts?.truncate ?? [];
  const format = opts?.format ?? [];
  const maxWidth = opts?.maxWidth ?? process.stdout.columns;

  // Natural (unconstrained) widths.
  const natural: number[] = [];
  for (let i = 0; i < numCols; i++) {
    const col = columns[i] ?? [];
    const headerLen = displayText(headers[i] ?? "").length;
    const maxCellLen = col.reduce((m, v) => {
      const len = displayText(v).length;
      return len > m ? len : m;
    }, 0);
    natural[i] = Math.max(headerLen, maxCellLen);
  }

  const widths = [...natural];

  // Constrained widths: keep fixed columns intact; fit flex columns into remaining space.
  if (
    maxWidth != null &&
    Number.isFinite(maxWidth) &&
    maxWidth > 0 &&
    (opts?.flex != null ||
      opts?.noTruncate != null ||
      opts?.min != null ||
      opts?.truncate != null ||
      opts?.maxWidth != null)
  ) {
    const totalGap = gap * (numCols - 1);
    const available = Math.max(0, maxWidth - totalGap);
    const totalNatural = natural.reduce((a, b) => a + b, 0);

    // Only constrain when we'd overflow the terminal.
    if (totalNatural <= available) {
      // keep natural widths
    } else {
      let fixed = 0;
      let totalWeight = 0;
      const flexCols: { i: number; weight: number }[] = [];

      for (let i = 0; i < numCols; i++) {
        const isFixed = noTruncate[i] === true || flex[i] === 0;
        if (isFixed) {
          widths[i] = natural[i]!;
          fixed += widths[i]!;
        } else {
          const weight = flex[i] ?? 1;
          totalWeight += weight;
          flexCols.push({ i, weight });
        }
      }

      const remaining = Math.max(0, available - fixed);
      if (flexCols.length > 0) {
        const mins = flexCols.map(({ i }) => Math.max(0, min[i] ?? 0));
        const minSum = mins.reduce((a, b) => a + b, 0);

        // If mins don't fit, scale them down proportionally.
        const baseMins =
          minSum > 0 && remaining < minSum
            ? mins.map((m) => Math.floor((m * remaining) / minSum))
            : mins;

        const usedByMins = baseMins.reduce((a, b) => a + b, 0);
        const extraSpace = Math.max(0, remaining - usedByMins);

        if (totalWeight <= 0 || extraSpace === 0) {
          for (let idx = 0; idx < flexCols.length; idx++) {
            widths[flexCols[idx]!.i] = baseMins[idx]!;
          }
        } else {
          const alloc = flexCols.map(({ i, weight }, idx) => {
            const exact = (extraSpace * weight) / totalWeight;
            const base = Math.floor(exact);
            return { i, base: baseMins[idx]! + base, frac: exact - base };
          });
          let used = alloc.reduce((s, a) => s + a.base, 0);
          let extra = Math.max(0, available - fixed - used);
          alloc.sort((a, b) => b.frac - a.frac || a.i - b.i);
          for (let k = 0; k < alloc.length && extra > 0; k++, extra--) {
            alloc[k]!.base += 1;
          }
          for (const a of alloc) widths[a.i] = a.base;
        }
      }
    }
  }

  // Render
  const header = headers
    .map((h, i) => {
      const w = widths[i] ?? 0;
      const cell = truncateMiddle(displayText(h), w);
      return w > 0 ? cell.padEnd(w) : cell;
    })
    .join("  ");
  console.log(theme.dim(header));

  const numRows = columns.reduce((m, c) => Math.max(m, c.length), 0);
  const maxRows = opts?.maxRows ?? numRows;

  for (let row = 0; row < Math.min(numRows, maxRows); row++) {
    const parts: string[] = [];
    for (let i = 0; i < numCols; i++) {
      const w = widths[i] ?? 0;
      const col = columns[i] ?? [];
      const raw = col[row] ?? "";
      const cell = displayText(raw);

      if (noTruncate[i]) {
        const padded = w > 0 ? cell.padEnd(w) : cell;
        parts.push(format[i] ? format[i]!(padded, row, i) : padded);
        continue;
      }

      const mode = truncate[i] ?? "middle";
      const truncated =
        mode === "start"
          ? truncateStart(cell, w)
          : mode === "end"
            ? truncateEnd(cell, w)
            : truncateMiddle(cell, w);

      const padded = w > 0 ? truncated.padEnd(w) : truncated;
      parts.push(format[i] ? format[i]!(padded, row, i) : padded);
    }

    const line = parts.join("  ");
    console.log(line);
  }

  // Show ellipsis if rows were truncated
  if (numRows > maxRows) {
    console.log(theme.dim("..."));
  }
}

export function cols(
  rows: string[][],
  colorFns?: ((s: string) => string)[],
): void {
  if (rows.length === 0) return;
  const widths = rows[0]!.map((_, i) =>
    Math.max(...rows.map((r) => r[i]!.length)),
  );
  for (const row of rows) {
    const line = row.map((c, i) => {
      const padded = c.padEnd(widths[i]!);
      return colorFns?.[i] ? colorFns[i]!(padded) : padded;
    });
    console.log(line.join(" "));
  }
}
