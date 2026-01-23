import { Show, For, createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { type DiffEntry, type ChangeBlock, countDiffLines } from "../lib/git";
import type { Selection } from "../lib/selection";
import { type SelectedHunk, isHunkSelected } from "../lib/hunk-selection";
import {
  type LineSelection,
  getLineSelectionsForFile,
} from "../lib/line-selection";
import { useTheme } from "../context/theme";
import { HalfLineShadow } from "./HalfLineShadow";

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
  entry: Accessor<DiffEntry | undefined>;
  blocks: Accessor<ChangeBlock[]>;
  selectedBlockIndex: Accessor<number>;
  focused: Accessor<boolean>;
  showBlockIndicator: Accessor<boolean>;
  selection: Accessor<Selection>;
  lineMode: Accessor<boolean>;
  selectedHunks: Accessor<SelectedHunk[]>;
  lineSelections: Accessor<LineSelection[]>;
  currentFileIndex: Accessor<number | undefined>;
  onScrollboxRef: (ref: ScrollBoxRenderable) => void;
}

// Unified indicator component - renders a column of indicators alongside the diff
interface DiffIndicatorProps {
  lineMode: Accessor<boolean>;
  blocks: Accessor<ChangeBlock[]>;
  selectedBlockIndex: Accessor<number>;
  selection: Accessor<Selection>;
  selectedHunks: Accessor<SelectedHunk[]>;
  lineSelections: Accessor<LineSelection[]>;
  currentFileIndex: Accessor<number | undefined>;
  focused: Accessor<boolean>;
  totalLines: Accessor<number>;
}

function DiffIndicator(props: DiffIndicatorProps) {
  const { theme } = useTheme();

  // Build a map of line number -> color
  const lineColors = createMemo(() => {
    const colors = new Map<number, string>();
    const fileIdx = props.currentFileIndex();
    if (fileIdx === undefined) return colors;

    if (props.lineMode()) {
      // Line mode: stored line selections (lower priority)
      const fileLineSelections = getLineSelectionsForFile(
        props.lineSelections(),
        fileIdx,
      );
      for (const lineSel of fileLineSelections) {
        for (let i = lineSel.startLine; i <= lineSel.endLine; i++) {
          colors.set(i, theme.added);
        }
      }

      // Line mode: current selection (higher priority, overwrites)
      if (props.focused()) {
        const sel = props.selection();
        for (let i = sel.start; i <= sel.end; i++) {
          colors.set(i, theme.primary);
        }
      }
    } else {
      // Hunk mode: iterate blocks
      const blocks = props.blocks();
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex]!;
        const isSelected = isHunkSelected(
          props.selectedHunks(),
          fileIdx,
          blockIndex,
        );
        const isFocused =
          props.focused() && blockIndex === props.selectedBlockIndex();

        let color = theme.indicatorDefault;
        if (isFocused) {
          color = theme.primary;
        } else if (isSelected) {
          color = theme.added;
        }

        for (let i = 0; i < block.lineCount; i++) {
          colors.set(block.startLine + i, color);
        }
      }
    }

    return colors;
  });

  // Create array of line indices for rendering
  const lineIndices = createMemo(() =>
    Array.from({ length: props.totalLines() }, (_, i) => i),
  );

  return (
    <box flexDirection="column" width={1} flexShrink={0}>
      <For each={lineIndices()}>
        {(lineNum) => {
          const color = () => lineColors().get(lineNum);
          return (
            <text height={1} fg={color()}>
              {/* {color() ? "▌" : " "} */}
              {color() ? "█" : " "}
            </text>
          );
        }}
      </For>
    </box>
  );
}

export function DiffPanel(props: DiffPanelProps) {
  const { theme, syntax } = useTheme();

  const totalLines = createMemo(() => {
    const entry = props.entry();
    if (!entry) return 0;
    return countDiffLines(entry.content);
  });

  const title = () => {
    const entry = props.entry();
    if (!entry) return "Diff";
    const b = props.blocks();

    if (props.lineMode()) {
      const sel = props.selection();
      const lineCount = sel.end - sel.start + 1;
      if (lineCount === 1) {
        return `${entry.file} [line ${sel.start + 1}]`;
      }
      return `${entry.file} [lines ${sel.start + 1}-${sel.end + 1}]`;
    }

    if (b.length === 0) return entry.file;
    if (props.focused()) {
      return `${entry.file} [block ${props.selectedBlockIndex() + 1}/${b.length}]`;
    }
    return `${entry.file} [${b.length} block${b.length === 1 ? "" : "s"}]`;
  };

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
    >
      {/* Title bar */}
      <box height={1} paddingLeft={1}>
        <text>
          <span style={{ bold: true }}>{title()}</span>
        </text>
      </box>

      <Show when={props.entry()}>
        <scrollbox
          ref={props.onScrollboxRef}
          focused={false}
          style={{
            width: "100%",
            height: "100%",
            flexGrow: 1,
          }}
        >
          <box flexDirection="row">
            <DiffIndicator
              lineMode={props.lineMode}
              blocks={props.blocks}
              selectedBlockIndex={props.selectedBlockIndex}
              selection={props.selection}
              selectedHunks={props.selectedHunks}
              lineSelections={props.lineSelections}
              currentFileIndex={props.currentFileIndex}
              focused={props.focused}
              totalLines={totalLines}
            />
            <diff
              diff={props.entry()!.content}
              view="unified"
              filetype={getFiletype(props.entry()!.file)}
              syntaxStyle={syntax()}
              showLineNumbers={true}
              flexGrow={1}
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
        </scrollbox>
      </Show>
      <Show when={!props.entry()}>
        <box padding={1} flexGrow={1}>
          <text>Select a file to view diff</text>
        </box>
      </Show>

      <HalfLineShadow />
    </box>
  );
}
