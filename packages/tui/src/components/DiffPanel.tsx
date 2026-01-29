import { Show, For, createMemo, createEffect, Index } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { Git } from "../lib/git";
import { parseFileDiff } from "../lib/diff";
import { useTheme } from "../context/theme";

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
}

export function DiffPanel(props: DiffPanelProps) {
  const { theme, syntax } = useTheme();

  const title = () => {
    const entry = props.entry();
    if (!entry) return "Diff";
    const hunkCount = props.hunkCount();

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
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
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
          const hunks = createMemo(
            () => parseFileDiff(entry.content, entry.file).hunks,
          );
          const filetype = getFiletype(entry.file);

          let scrollbox: ScrollBoxRenderable | null = null;

          // Scroll to selected hunk when it changes
          createEffect(() => {
            const hunkIdx = props.selectedHunkIndex();
            const hunkList = hunks();
            if (!scrollbox || hunkList.length === 0) return;

            // Calculate scroll position: rows before this hunk
            // plus separator lines (1 line between each hunk)
            let scrollLine = 0;
            if (hunkIdx > 0) {
              const prev = hunkList[Math.min(hunkIdx - 1, hunkList.length - 1)];
              if (prev) scrollLine = prev.endRow + hunkIdx;
            }

            scrollbox.scrollTo(scrollLine);
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
                    const indicatorColor = () => {
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
                              {(j) => (
                                <text height={1} fg={indicatorColor()}>
                                  ▌
                                </text>
                              )}
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
