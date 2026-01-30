import pc from "picocolors";
import { defaultTheme as theme } from "./theme";

export const CLEAR = "\x1b[K";

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  const half = (max - 3) >> 1;
  return s.slice(0, half + ((max - 3) & 1)) + "..." + s.slice(-half);
}

export type TableOptions = {
  maxWidth?: number;
  flex?: number[];
};

export function table(
  headers: string[],
  columns: string[][],
  opts?: TableOptions,
): void {
  const numCols = headers.length;
  const gap = 2;

  // Calculate natural widths
  const natural: number[] = [];
  for (let i = 0; i < numCols; i++) {
    const col = columns[i] ?? [];
    natural[i] = Math.max(headers[i]!.length, ...col.map((v) => v.length));
  }

  // Calculate final widths
  const widths = [...natural];
  const flex = opts?.flex;
  const maxWidth = opts?.maxWidth ?? process.stdout.columns ?? 80;

  if (flex && maxWidth) {
    const totalGap = gap * (numCols - 1);
    const available = maxWidth - totalGap;
    const totalNatural = natural.reduce((a, b) => a + b, 0);

    // Only apply flex when natural widths exceed available space
    if (totalNatural > available) {
      // Fixed columns (flex=0) keep natural width
      let used = 0;
      let totalFlex = 0;
      for (let i = 0; i < numCols; i++) {
        if (flex[i] === 0) {
          used += natural[i]!;
        } else {
          totalFlex += flex[i] ?? 1;
        }
      }

      // Distribute remaining space to flex columns
      const remaining = Math.max(0, available - used);
      for (let i = 0; i < numCols; i++) {
        if (flex[i] !== 0) {
          const share = (flex[i] ?? 1) / totalFlex;
          widths[i] = Math.max(headers[i]!.length, Math.floor(remaining * share));
        }
      }
    }
  }

  // Render
  const header = headers
    .map((h, i) => truncateMiddle(h, widths[i]!).padEnd(widths[i]!))
    .join("  ");
  console.log(theme.dim(header));

  const numRows = Math.max(...columns.map((c) => c.length));
  for (let row = 0; row < numRows; row++) {
    const line = columns
      .map((col, i) =>
        truncateMiddle(col[row] ?? "", widths[i]!).padEnd(widths[i]!),
      )
      .join("  ");
    console.log(line);
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
