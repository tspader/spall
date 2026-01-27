import { Show, For, createMemo, Index } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { parsePatch } from "diff";
import { Git } from "../lib/git";
import type { Selection } from "../lib/selection";
import { type HunkSelections, isHunkSelected } from "../lib/hunk-selection";
import type { LineSelections } from "../lib/line-selection";
import { useTheme } from "../context/theme";

interface ParsedHunk {
  diffString: string;
  oldStart: number;
  oldLines: number;
  skipBefore: number; // lines skipped before this hunk (0 for first)
  lineCount: number; // number of rendered lines in this hunk
}

function parseHunks(content: string, file: string): ParsedHunk[] {
  if (!content) return [];

  try {
    const patches = parsePatch(content);
    if (patches.length === 0) return [];

    const rawHunks = patches[0]?.hunks ?? [];
    const result: ParsedHunk[] = [];

    // Build the file header once
    const header = `diff --git a/${file} b/${file}
--- a/${file}
+++ b/${file}`;

    for (let i = 0; i < rawHunks.length; i++) {
      const hunk = rawHunks[i]!;

      // Calculate skip from previous hunk
      let skipBefore = 0;
      if (i > 0) {
        const prev = rawHunks[i - 1]!;
        const prevEnd = prev.oldStart + prev.oldLines;
        skipBefore = hunk.oldStart - prevEnd;
      }

      // Reconstruct the hunk as a standalone diff string
      const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
      const diffString = `${header}\n${hunkHeader}\n${hunk.lines.join("\n")}`;

      // Count rendered lines (context, additions, deletions)
      let lineCount = 0;
      for (const line of hunk.lines) {
        const c = line[0];
        if (c === " " || c === "+" || c === "-") lineCount++;
      }

      result.push({
        diffString,
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        skipBefore,
        lineCount,
      });
    }

    return result;
  } catch {
    return [];
  }
}

function getFiletype(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    // JavaScript/TypeScript
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    vue: "vue",
    // Data formats
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    // Systems languages
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    hxx: "cpp",
    rs: "rust",
    go: "go",
    zig: "zig",
    // Scripting
    py: "python",
    rb: "ruby",
    lua: "lua",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    php: "php",
    // JVM
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    // .NET
    cs: "c_sharp",
    // Mobile
    swift: "swift",
    m: "objc",
    mm: "objc",
    dart: "dart",
    // Functional
    ex: "elixir",
    exs: "elixir",
    elm: "elm",
    ml: "ocaml",
    mli: "ocaml",
    el: "elisp",
    // Other
    sql: "ql",
    res: "rescript",
    resi: "rescript",
    sol: "solidity",
    tla: "tlaplus",
    rdl: "systemrdl",
    erb: "embedded_template",
    ejs: "embedded_template",
    // Markdown (uses opentui built-in)
    md: "markdown",
    mdx: "markdown",
  };
  return extMap[ext] ?? "text";
}

export interface DiffPanelProps {
  entry: Accessor<Git.Entry | undefined>;
  hunkCount: Accessor<number>;
  selectedHunkIndex: Accessor<number>;
  focused: Accessor<boolean>;
  selection: Accessor<Selection>;
  lineMode: Accessor<boolean>;
  selectedHunks: Accessor<HunkSelections>;
  lineSelections: Accessor<LineSelections>;
  currentFilePath: Accessor<string | undefined>;
  onScrollboxRef: (ref: ScrollBoxRenderable) => void;
}

export function DiffPanel(props: DiffPanelProps) {
  const { theme, syntax } = useTheme();

  const title = () => {
    const entry = props.entry();
    if (!entry) return "Diff";
    const hunkCount = props.hunkCount();

    if (props.lineMode()) {
      const sel = props.selection();
      const lineCount = sel.end - sel.start + 1;
      if (lineCount === 1) {
        return `[line ${sel.start + 1}]`;
      }
      return `[lines ${sel.start + 1}-${sel.end + 1}]`;
    }

    if (hunkCount === 0) return entry.file;
    if (props.focused()) {
      return `[hunk ${props.selectedHunkIndex() + 1}/${hunkCount}]`;
    }
    return `[${hunkCount} hunk${hunkCount === 1 ? "" : "s"}]`;
  };

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      {/* Title bar */}
      <box
        height={1}
        paddingLeft={1}
        flexDirection="row"
        justifyContent="flex-start"
        gap={1}
      >
        <text>
          <span style={{ italic: true }}>
            {props.entry() ? props.entry()!.file : "none"}
          </span>
        </text>
        <text>
          <span style={{ bold: true }}>{title()}</span>
        </text>
      </box>

      <Show when={props.entry()}>
        {(() => {
          const entry = props.entry()!;
          const hunks = createMemo(() => parseHunks(entry.content, entry.file));
          const filetype = getFiletype(entry.file);

          return (
            <scrollbox
              ref={props.onScrollboxRef}
              focused={false}
              width={"100%"}
              height={"100%"}
            >
              <box flexDirection="column" backgroundColor={theme.background}>
                <Index each={hunks()}>
                  {(hunk, i) => {
                    const isFocused = () =>
                      props.focused() && props.selectedHunkIndex() === i;
                    const isSelected = () =>
                      isHunkSelected(props.selectedHunks(), entry.file, i);
                    const indicatorColor = () => {
                      if (isFocused()) return theme.primary;
                      if (isSelected()) return theme.added;
                      return theme.indicatorDefault;
                    };

                    return (
                      <>
                        <Show when={i > 0}>
                          <box
                            height={1}
                            backgroundColor={theme.backgroundPanel}
                          />
                        </Show>
                        <box flexDirection="row">
                          {/* Indicator column */}
                          <box flexDirection="column" width={1} flexShrink={0}>
                            <For
                              each={Array.from(
                                { length: hunk().lineCount },
                                (_, j) => j,
                              )}
                            >
                              {() => (
                                <text height={1} fg={indicatorColor()}>
                                  █
                                </text>
                              )}
                            </For>
                          </box>
                          <diff
                            diff={hunk().diffString}
                            view="unified"
                            filetype={filetype}
                            syntaxStyle={syntax()}
                            showLineNumbers={true}
                            flexGrow={0}
                            fg={theme.text}
                            addedBg={theme.diffAddedBg}
                            removedBg={theme.diffRemovedBg}
                            contextBg={theme.diffContextBg}
                            addedSignColor={theme.diffSignAdded}
                            removedSignColor={theme.diffSignRemoved}
                            lineNumberFg={theme.diffLineNumberFg}
                            lineNumberBg={theme.diffContextBg}
                            addedLineNumberBg={theme.diffAddedLineNumberBg}
                            removedLineNumberBg={theme.diffRemovedLineNumberBg}
                          />
                        </box>
                      </>
                    );
                  }}
                </Index>
              </box>
            </scrollbox>
          );
        })()}
      </Show>
      <Show when={!props.entry()}>
        <box padding={1} flexGrow={1}>
          <text>Select a file to view diff</text>
        </box>
      </Show>
    </box>
  );
}
