import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { cleanEscapes, table } from "./layout";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("cleanEscapes", () => {
  test("returns string as-is if no escapes", () => {
    expect(cleanEscapes("hello")).toBe("hello");
    expect(cleanEscapes("")).toBe("");
    expect(cleanEscapes("normal text")).toBe("normal text");
  });

  test("replaces tabs with spaces", () => {
    expect(cleanEscapes("a\tb")).toBe("a b");
    expect(cleanEscapes("\t")).toBe(" ");
    expect(cleanEscapes("\t\t")).toBe("  ");
  });

  test("replaces newlines with spaces", () => {
    expect(cleanEscapes("a\nb")).toBe("a b");
    expect(cleanEscapes("\n")).toBe(" ");
    expect(cleanEscapes("\n\n")).toBe("  ");
  });

  test("replaces mixed escapes with spaces", () => {
    expect(cleanEscapes("a\tb\nc")).toBe("a b c");
    expect(cleanEscapes("\t\n\t")).toBe("   ");
    expect(cleanEscapes("line1\n\nline2")).toBe("line1  line2");
  });

  test("handles file with many leading newlines", () => {
    // 10 newlines followed by content
    const content = "\n\n\n\n\n\n\n\n\n\nshort";
    const cleaned = cleanEscapes(content);
    // Newlines become spaces, but we preserve total character count
    expect(cleaned).toBe("          short");
    expect(cleaned).not.toContain("\n");
    expect(cleaned.length).toBe(content.length);
  });

  test("handles content with tabs and newlines", () => {
    const content = "pcx_content_type: reference\ntitle: Using DNS Wireformat";
    const cleaned = cleanEscapes(content);
    expect(cleaned).toBe(
      "pcx_content_type: reference title: Using DNS Wireformat",
    );
    expect(cleaned).not.toContain("\n");
    expect(cleaned).not.toContain("\t");
  });
});

describe("table", () => {
  const originalLog = console.log;
  const originalColumns = Object.getOwnPropertyDescriptor(
    process.stdout,
    "columns",
  );

  let lines: string[];

  beforeEach(() => {
    lines = [];
    console.log = (...args: any[]) => {
      lines.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    if (originalColumns) {
      Object.defineProperty(process.stdout, "columns", originalColumns);
    } else {
      // If it wasn't defined before, clean up our override.
      delete (process.stdout as any).columns;
    }
  });

  test("keeps noTruncate columns intact and truncates content to remaining width", () => {
    Object.defineProperty(process.stdout, "columns", {
      value: 37,
      configurable: true,
    });

    table(
      ["path", "id", "content"],
      [
        ["alpha.md", "beta-long-name.md"],
        ["1", "22"],
        ["abcdefghijklmnopqrstuvwxyz", "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
      ],
      { flex: [0, 0, 1], noTruncate: [true, true, false] },
    );

    // header + 2 rows
    expect(lines).toHaveLength(3);
    const header = stripAnsi(lines[0]!);
    const row1 = stripAnsi(lines[1]!);
    const row2 = stripAnsi(lines[2]!);

    // noTruncate columns are fully present
    expect(row1).toContain("alpha.md");
    expect(row2).toContain("beta-long-name.md");
    expect(row1).toContain("1");
    expect(row2).toContain("22");

    // aligned columns: the "id" and "content" start columns match across rows
    const idStart = header.indexOf("id");
    expect(idStart).toBeGreaterThan(0);
    expect(row1.indexOf("1")).toBe(idStart);
    expect(row2.indexOf("22")).toBe(idStart);

    const contentStart = header.indexOf("content");
    expect(contentStart).toBeGreaterThan(idStart);
    expect(row1.indexOf("abc")).toBe(contentStart);
    expect(row2.indexOf("012")).toBe(contentStart);

    // content is truncated in the middle with ...
    expect(row1).toContain("abcdef...vwxyz");
    expect(row2).toContain("012345...VWXYZ");
  });

  test("cleanEscapes is applied before measuring and printing", () => {
    Object.defineProperty(process.stdout, "columns", {
      value: 26,
      configurable: true,
    });

    table(
      ["path", "id", "content"],
      [["a.md"], ["1"], ["a\tb\ncdefghijklmnop"]],
      { flex: [0, 0, 1], noTruncate: [true, true, false] },
    );

    const row = stripAnsi(lines[1]!);
    // tab/newline become single spaces
    expect(row).toContain("a b ");
    expect(row).not.toContain("\t");
    expect(row).not.toContain("\n");
  });
});
