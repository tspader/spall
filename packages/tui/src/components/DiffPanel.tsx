import { Show, For, createMemo, createEffect, Index } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { Git } from "../lib/git";
import { getHunkIndexForRow, parseFileDiff } from "../lib/diff";
import { useTheme } from "../context/theme";
import { EmptyBorder } from "./HalfLineShadow";

/** Number of diff rows to keep visible above/below cursor (line mode). */
const LINE_SCROLL_BUFFER = 8;

function getFiletype(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    vue: "vue",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
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
    py: "python",
    rb: "ruby",
    lua: "lua",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    php: "php",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    cs: "c_sharp",
    swift: "swift",
    m: "objc",
    mm: "objc",
    dart: "dart",
    ex: "elixir",
    exs: "elixir",
    elm: "elm",
    ml: "ocaml",
    mli: "ocaml",
    el: "elisp",
    sql: "ql",
    erb: "embedded_template",
    ejs: "embedded_template",
    md: "markdown",
    mdx: "markdown",
  };
  return extMap[ext] ?? "text";
}

export interface DiffPanelProps {
  entry: Accessor<Git.Entry | undefined>;
  hunkCount: Accessor<number>;
  selectedHunkIndex: Accessor<number>;
  selectionMode: Accessor<"hunk" | "line">;
  selectedRange: Accessor<{ startRow: number; endRow: number } | null>;
  cursorRow: Accessor<number>;
  focused: Accessor<boolean>;
}

export function DiffPanel(props: DiffPanelProps) {
  const { theme, syntax } = useTheme();

  const title = () => {
    const entry = props.entry();
    if (!entry) return "Diff";
    const hunkCount = props.hunkCount();

    if (hunkCount === 0) return entry.file;
    if (props.selectionMode() === "line") {
      const range = props.selectedRange();
      if (range && range.startRow !== range.endRow) {
        return `[lines ${range.startRow}-${range.endRow}]`;
      }
      const row = range?.startRow ?? props.cursorRow();
      return `[line ${row}]`;
    }
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
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      {/* Title bar */}
      <box
        height={1}
        flexDirection="row"
        justifyContent="flex-start"
        gap={1}
        backgroundColor={
          props.focused() ? theme.backgroundElement : theme.backgroundPanel
        }
        border={["left"]}
        borderColor={props.focused() ? theme.primary : theme.indicatorDefault}
        customBorderChars={{
          ...EmptyBorder,
          vertical: "\u258C",
        }}
      >
        <box paddingLeft={1} flexDirection="row" gap={1}>
          <text>
            <span style={{ italic: true }}>
              {props.entry() ? props.entry()!.file : "none"}
            </span>
          </text>
          <text>
            <span style={{ bold: true }}>{title()}</span>
          </text>
        </box>
      </box>

      <Show when={props.entry()}>
        {(() => {
          const entry = props.entry()!;
          const model = createMemo(() =>
            parseFileDiff(entry.content, entry.file),
          );
          const hunks = createMemo(() => model().hunks);
          const filetype = getFiletype(entry.file);

          let scrollbox: ScrollBoxRenderable | null = null;

          // Scroll to selected hunk when it changes
          createEffect(() => {
            const hunkIdx = props.selectedHunkIndex();
            const hunkList = hunks();
            if (!scrollbox || hunkList.length === 0) return;

            let scrollLine = 0;
            if (props.selectionMode() === "line") {
              const row = props.cursorRow();
              const rowHunkIndex = getHunkIndexForRow(
                entry.content,
                entry.file,
                row,
              );
              const separatorOffset = rowHunkIndex ? rowHunkIndex : 0;
              scrollLine = Math.max(0, row - 1 + separatorOffset);
              const scrollTop = scrollbox.scrollTop;
              const viewportHeight = scrollbox.viewport.height;

              const topBound = scrollTop + LINE_SCROLL_BUFFER;
              const bottomBound =
                scrollTop + viewportHeight - 1 - LINE_SCROLL_BUFFER;

              if (scrollLine < topBound) {
                scrollbox.scrollTo(
                  Math.max(0, scrollLine - LINE_SCROLL_BUFFER),
                );
              } else if (scrollLine > bottomBound) {
                scrollbox.scrollTo(
                  Math.max(
                    0,
                    scrollLine + LINE_SCROLL_BUFFER - viewportHeight + 1,
                  ),
                );
              }
              return;
            }

            if (hunkIdx > 0) {
              const prev = hunkList[Math.min(hunkIdx - 1, hunkList.length - 1)];
              if (prev) scrollLine = prev.endRow + hunkIdx;
            }

            const activeHunk = hunkList[hunkIdx];
            if (!activeHunk) return;
            const scrollTop = scrollbox.scrollTop;
            const viewportHeight = scrollbox.viewport.height;
            const separatorOffset = hunkIdx;
            const hunkTop = Math.max(
              0,
              activeHunk.startRow - 1 + separatorOffset,
            );
            const hunkBottom = Math.max(
              0,
              activeHunk.endRow - 1 + separatorOffset,
            );
            const viewportBottom = scrollTop + viewportHeight - 1;

            if (hunkTop < scrollTop) {
              scrollbox.scrollTo(hunkTop);
            } else if (hunkBottom > viewportBottom) {
              scrollbox.scrollTo(scrollLine);
            }
          });

          return (
            <scrollbox
              ref={(r) => {
                scrollbox = r;
              }}
              focused={false}
              flexGrow={1}
            >
              <box flexDirection="column" backgroundColor={theme.background}>
                <Index each={hunks()}>
                  {(hunk, i) => {
                    const isFocused = () =>
                      props.focused() && props.selectedHunkIndex() === i;
                    const indicatorColor = (row: number) => {
                      if (props.selectionMode() === "line") {
                        const range = props.selectedRange();
                        if (
                          range &&
                          row >= range.startRow &&
                          row <= range.endRow
                        ) {
                          return theme.primary;
                        }
                        return theme.indicatorDefault;
                      }
                      if (isFocused()) return theme.primary;
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
                            {/* <text height={1} fg={indicatorColor()}> */}
                            {/*   {"\u2582"} */}
                            {/* </text> */}
                            <For
                              each={Array.from(
                                { length: hunk().lineCount },
                                (_, j) => j,
                              )}
                            >
                              {(j) => {
                                const row = hunk().startRow + j;
                                return (
                                  <text height={1} fg={indicatorColor(row)}>
                                    ▌
                                  </text>
                                );
                              }}
                            </For>
                            {/* <text height={1} fg={indicatorColor()}> */}
                            {/*   {"\u2594"} */}
                            {/* </text> */}
                            {/**/}
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
