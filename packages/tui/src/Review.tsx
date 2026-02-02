import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createSignal, createEffect, createMemo, Show } from "solid-js";
import {
  FileList,
  CommentList,
  PatchList,
  DiffPanel,
  EditorPanel,
  CommandPalette,
  ServerStatus,
  ProjectStatus,
} from "./components";
import {
  buildFileTree,
  flattenTree,
  getFileIndices,
  type DisplayItem,
} from "./lib/tree";
import { getHunkIndexForRow, parseFileDiff } from "./lib/diff";
import { DialogProvider, useDialog } from "./context/dialog";
import { CommandProvider, useCommand } from "./context/command";
import { ThemeProvider, useTheme } from "./context/theme";
import { ExitProvider, useExit } from "./context/exit";
import { ServerProvider } from "./context/server";
import { ReviewProvider, useReview } from "./context/review";
import { SidebarProvider } from "./context/sidebar";
import { type Command, matchAny } from "./lib/keybind";

type FocusPanel = "sidebar" | "diff" | "editor";
type SidebarMode = "files" | "patches" | "comments";
type SelectionMode = "hunk" | "line";

type EditorAnchor = {
  file: string;
  startRow: number;
  endRow: number;
  commentId?: number;
};

export interface ReviewProps {
  /** Path to the git repository. Defaults to process.argv[2] or "." */
  repoPath?: string;
}

export function Review(props: ReviewProps = {}) {
  const repoPath = props.repoPath ?? process.argv[2] ?? ".";
  return (
    <ThemeProvider>
      <ExitProvider>
        <ServerProvider>
          <ReviewProvider repoPath={repoPath}>
            <DialogProvider>
              <CommandProvider>
                <App repoPath={repoPath} />
              </CommandProvider>
            </DialogProvider>
          </ReviewProvider>
        </ServerProvider>
      </ExitProvider>
    </ThemeProvider>
  );
}

interface AppProps {
  repoPath: string;
}

function App(props: AppProps) {
  const dims = useTerminalDimensions();
  const dialog = useDialog();
  const command = useCommand();
  const { theme } = useTheme();
  const { exit } = useExit();
  const review = useReview();

  // Derived tree state
  const displayItems = createMemo<DisplayItem[]>(() => {
    const e = review.entries();
    if (e.length === 0) return [];
    const tree = buildFileTree(e);
    return flattenTree(tree);
  });

  const fileIndices = createMemo(() => getFileIndices(displayItems()));

  createEffect(() => {
    const indices = fileIndices();
    const entries = review.entries();
    const current = review.selectedFilePath();

    if (indices.length === 0) {
      review.setSelectedFilePath(null);
      return;
    }

    if (!current || !entries.some((e) => e.file === current)) {
      const firstEntryIndex = indices[0]!;
      review.setSelectedFilePath(entries[firstEntryIndex]?.file ?? null);
    }
  });

  // Navigation state
  const [focusPanel, setFocusPanel] = createSignal<FocusPanel>("sidebar");
  const [sidebarMode, setSidebarMode] = createSignal<SidebarMode>("files");
  const [selectedHunkIndex, setSelectedHunkIndex] = createSignal(0);
  const [selectionMode, setSelectionMode] = createSignal<SelectionMode>("hunk");
  const [selectedRange, setSelectedRange] = createSignal<{
    startRow: number;
    endRow: number;
  } | null>(null);
  const [cursorRow, setCursorRow] = createSignal(1);
  const [editorAnchor, setEditorAnchor] = createSignal<EditorAnchor | null>(
    null,
  );

  // Comment list state
  const [selectedCommentIndex, setSelectedCommentIndex] = createSignal(0);

  // Patch list state
  const [selectedPatchIndex, setSelectedPatchIndex] = createSignal(0);

  const selectedFileNavIndex = createMemo(() => {
    const indices = fileIndices();
    if (indices.length === 0) return 0;

    const entries = review.entries();
    const path = review.selectedFilePath();
    if (!path) return 0;

    const entryIndex = entries.findIndex((e) => e.file === path);
    if (entryIndex === -1) return 0;

    const navIndex = indices.indexOf(entryIndex);
    return navIndex === -1 ? 0 : navIndex;
  });

  const selectedEntry = () => {
    const entries = review.entries();
    if (entries.length === 0) return undefined;

    const path = review.selectedFilePath();
    if (path) {
      const found = entries.find((e) => e.file === path);
      if (found) return found;
    }

    const firstEntryIndex = fileIndices()[0];
    if (firstEntryIndex !== undefined) return entries[firstEntryIndex];
    return entries[0];
  };

  // Hunk count for the selected entry (computed from diff content)
  const diffModel = createMemo(() => {
    const entry = selectedEntry();
    if (!entry) return { hunks: [], totalRows: 0 };
    return parseFileDiff(entry.content, entry.file);
  });

  const hunkCount = createMemo(() => diffModel().hunks.length);
  const totalRows = createMemo(() => diffModel().totalRows);

  const selectedHunkRange = createMemo(() => {
    const entry = selectedEntry();
    if (!entry) return null;
    const hunk = diffModel().hunks[selectedHunkIndex()];
    if (!hunk) return null;
    return { startRow: hunk.startRow, endRow: hunk.endRow };
  });

  // Track previous file to detect actual file changes vs patch switches
  const [previousFile, setPreviousFile] = createSignal<string | null>(null);

  // Reset or clip hunk selection when file changes
  createEffect(() => {
    review.selectedFilePath();
    review.activePatchId();
    const currentFile = selectedEntry()?.file ?? null;
    const prevFile = previousFile();

    // Only reset if we actually changed to a different file
    if (currentFile !== prevFile) {
      setSelectedHunkIndex(0);
      setSelectionMode("hunk");
      setSelectedRange(null);
      setCursorRow(1);
    } else if (currentFile !== null) {
      // Same file, patch changed - clip to valid bounds
      const maxHunk = Math.max(0, hunkCount() - 1);
      setSelectedHunkIndex((i) => Math.min(i, maxHunk));

      const maxRow = totalRows();
      if (maxRow > 0) {
        setSelectedRange((range) => {
          if (!range) return null;
          // Clip range to valid bounds
          const clippedStart = Math.min(range.startRow, maxRow);
          const clippedEnd = Math.min(range.endRow, maxRow);
          if (
            clippedStart === clippedEnd &&
            clippedStart === maxRow &&
            maxRow > 1
          ) {
            // If everything got clipped to the end, select last line
            return { startRow: maxRow - 1, endRow: maxRow };
          }
          return { startRow: clippedStart, endRow: clippedEnd };
        });
        setCursorRow((r) => Math.min(Math.max(1, r), maxRow));
      }
    }

    setPreviousFile(currentFile);
  });

  const clampRow = (row: number) => {
    const max = Math.max(1, totalRows());
    return Math.min(Math.max(1, row), max);
  };

  const setSelectedNavIndex = (navIndex: number) => {
    const entryIndex = fileIndices()[navIndex];
    const entry =
      entryIndex !== undefined ? review.entries()[entryIndex] : null;
    review.setSelectedFilePath(entry?.file ?? null);
  };

  // Helper functions for commands
  const navigateUp = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      if (sidebarMode() === "files") {
        setSelectedNavIndex(Math.max(0, selectedFileNavIndex() - 1));
      } else if (sidebarMode() === "patches") {
        setSelectedPatchIndex((i) => Math.max(0, i - 1));
      } else {
        setSelectedCommentIndex((i) => Math.max(0, i - 1));
      }
      return;
    }

    if (panel === "diff" && selectionMode() === "line") {
      const next = clampRow(cursorRow() - 1);
      setCursorRow(next);
      setSelectedRange({ startRow: next, endRow: next });
      return;
    }

    if (panel === "diff") {
      setSelectedHunkIndex((i: number) => Math.max(0, i - 1));
    }
  };

  const navigateDown = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      if (sidebarMode() === "files") {
        setSelectedNavIndex(
          Math.min(fileIndices().length - 1, selectedFileNavIndex() + 1),
        );
      } else if (sidebarMode() === "patches") {
        const patchCount = review.patches().length + 1; // +1 for workspace entry
        setSelectedPatchIndex((i) => Math.min(patchCount - 1, i + 1));
      } else {
        const maxIndex = review.comments().length - 1;
        setSelectedCommentIndex((i) => Math.min(maxIndex, i + 1));
      }
      return;
    }

    if (panel === "diff" && selectionMode() === "line") {
      const next = clampRow(cursorRow() + 1);
      setCursorRow(next);
      setSelectedRange({ startRow: next, endRow: next });
      return;
    }

    if (panel === "diff") {
      setSelectedHunkIndex((i: number) => Math.min(hunkCount() - 1, i + 1));
    }
  };

  const openCommentEditor = () => {
    const entry = selectedEntry();
    const range =
      selectionMode() === "line" ? selectedRange() : selectedHunkRange();
    if (!entry || !range) return;

    const existing = review.getCommentForRange(
      entry.file,
      range.startRow,
      range.endRow,
    );

    setEditorAnchor({
      file: entry.file,
      startRow: range.startRow,
      endRow: range.endRow,
      commentId: existing?.id,
    });
    setFocusPanel("editor");
  };

  const toggleSidebarMode = () => {
    setSidebarMode((m) => {
      if (m === "files") return "patches";
      if (m === "patches") return "comments";
      return "files";
    });
  };

  const toggleHunkSelection = () => {
    const range = selectedHunkRange();
    if (!range) return;
    if (selectedRange()) {
      setSelectedRange(null);
      return;
    }
    setSelectionMode("hunk");
    setSelectedRange(range);
  };

  const toggleLineMode = () => {
    if (totalRows() === 0) return;
    if (selectionMode() === "hunk") {
      const range = selectedRange() ?? selectedHunkRange();
      const row = clampRow(range?.startRow ?? 1);
      setSelectionMode("line");
      setCursorRow(row);
      setSelectedRange({ startRow: row, endRow: row });
      return;
    }
    const entry = selectedEntry();
    const range = selectedRange();
    if (entry && range) {
      const hunkIndex =
        getHunkIndexForRow(entry.content, entry.file, range.startRow) ?? 0;
      setSelectedHunkIndex(hunkIndex);
    }
    setSelectionMode("hunk");
    setSelectedRange(null);
  };

  const extendSelectionDown = () => {
    if (selectionMode() !== "line") return;
    const range = selectedRange() ?? {
      startRow: cursorRow(),
      endRow: cursorRow(),
    };
    const next = clampRow(range.endRow + 1);
    setSelectedRange({ startRow: range.startRow, endRow: next });
    setCursorRow(next);
  };

  const extendSelectionUp = () => {
    if (selectionMode() !== "line") return;
    const range = selectedRange() ?? {
      startRow: cursorRow(),
      endRow: cursorRow(),
    };
    const next = clampRow(range.startRow - 1);
    setSelectedRange({ startRow: next, endRow: range.endRow });
    setCursorRow(next);
  };

  // Define all commands with structured keybinds
  const commands = (): Command[] => [
    // Movement
    {
      id: "up",
      title: "up",
      category: "movement",
      keybinds: [{ name: "up" }, { name: "k" }],
      isActive: () => focusPanel() !== "editor",
      onExecute: navigateUp,
    },
    {
      id: "down",
      title: "down",
      category: "movement",
      keybinds: [{ name: "down" }, { name: "j" }],
      isActive: () => focusPanel() !== "editor",
      onExecute: navigateDown,
    },
    {
      id: "back-from-diff",
      title: "back",
      category: "movement",
      keybinds: [{ name: "escape" }],
      isActive: () => focusPanel() === "diff",
      onExecute: () => {
        setFocusPanel("sidebar");
        setSelectedHunkIndex(0);
      },
    },

    {
      id: "quit",
      title: "quit",
      category: "movement",
      keybinds: [
        { name: "c", ctrl: true },
        { name: "d", ctrl: true },
        { name: "q", ctrl: true },
      ],
      isActive: () => focusPanel() !== "editor",
      onExecute: () => exit(),
    },

    {
      id: "cycle-forward",
      title: "cycle forward",
      category: "movement",
      keybinds: [{ name: "tab" }],
      isActive: () => focusPanel() !== "editor",
      onExecute: () => {
        // Cycle: files -> patches -> comments -> diff -> files
        if (focusPanel() === "sidebar") {
          if (sidebarMode() === "files") {
            setSidebarMode("patches");
          } else if (sidebarMode() === "patches") {
            setSidebarMode("comments");
          } else {
            setFocusPanel("diff");
            setSelectedHunkIndex(0);
          }
        } else if (focusPanel() === "diff") {
          setFocusPanel("sidebar");
          setSidebarMode("files");
        }
      },
    },
    {
      id: "cycle-backward",
      title: "cycle backward",
      category: "movement",
      keybinds: [{ name: "tab", shift: true }],
      isActive: () => focusPanel() !== "editor",
      onExecute: () => {
        // Cycle: files <- patches <- comments <- diff <- files
        if (focusPanel() === "sidebar") {
          if (sidebarMode() === "files") {
            setFocusPanel("diff");
            setSelectedHunkIndex(0);
          } else if (sidebarMode() === "patches") {
            setSidebarMode("files");
          } else {
            setSidebarMode("patches");
          }
        } else if (focusPanel() === "diff") {
          setFocusPanel("sidebar");
          setSidebarMode("comments");
        }
      },
    },

    {
      id: "select-hunks",
      title: "select hunks",
      category: "selection",
      keybinds: [{ name: "return" }],
      isActive: () =>
        focusPanel() === "sidebar" &&
        sidebarMode() === "files" &&
        !!selectedEntry() &&
        hunkCount() > 0,
      onExecute: () => {
        setFocusPanel("diff");
        setSelectedHunkIndex(0);
        setSelectionMode("hunk");
        setSelectedRange(null);
      },
    },
    {
      id: "select-lines",
      title: "select by lines",
      category: "selection",
      keybinds: [{ name: "a" }],
      isActive: () => focusPanel() === "diff" && totalRows() > 0,
      onExecute: toggleLineMode,
    },
    {
      id: "toggle-hunk-selection",
      title: "toggle hunk selection",
      category: "selection",
      keybinds: [{ name: "space" }],
      isActive: () =>
        focusPanel() === "diff" &&
        selectionMode() === "hunk" &&
        selectedHunkRange() !== null,
      onExecute: toggleHunkSelection,
    },
    {
      id: "extend-down",
      title: "extend selection down",
      category: "selection",
      keybinds: [
        { name: "j", shift: true },
        { name: "down", shift: true },
      ],
      isActive: () => focusPanel() === "diff" && selectionMode() === "line",
      onExecute: extendSelectionDown,
    },
    {
      id: "extend-up",
      title: "extend selection up",
      category: "selection",
      keybinds: [
        { name: "k", shift: true },
        { name: "up", shift: true },
      ],
      isActive: () => focusPanel() === "diff" && selectionMode() === "line",
      onExecute: extendSelectionUp,
    },
    {
      id: "open-comment",
      title: "open comment",
      category: "selection",
      keybinds: [{ name: "return" }],
      isActive: () =>
        focusPanel() === "sidebar" &&
        sidebarMode() === "comments" &&
        review.comments().length > 0,
      onExecute: () => {
        // Navigate to the comment's file+range and open editor
        const comments = review.comments();
        const idx = selectedCommentIndex();
        const comment = comments[idx];
        if (!comment) return;

        review.setActivePatch(comment.patchId, comment.file);

        const entry = review.entries().find((e) => e.file === comment.file);
        if (!entry) return;
        const hunkIndex =
          getHunkIndexForRow(entry.content, entry.file, comment.startRow) ?? 0;

        // Navigate to the file and hunk
        review.setSelectedFilePath(comment.file);
        setSelectedHunkIndex(hunkIndex);
        setEditorAnchor({
          file: comment.file,
          startRow: comment.startRow,
          endRow: comment.endRow,
          commentId: comment.id,
        });
        setFocusPanel("editor");
      },
    },
    {
      id: "select-patch",
      title: "select patch",
      category: "selection",
      keybinds: [{ name: "return" }],
      isActive: () =>
        focusPanel() === "sidebar" &&
        sidebarMode() === "patches" &&
        review.patches().length > 0,
      onExecute: () => {
        const patches = review
          .patches()
          .slice()
          .sort((a, b) => b.seq - a.seq);
        const idx = selectedPatchIndex();
        // Get current file to preserve selection if possible
        const currentEntry = selectedEntry();
        const currentFile = currentEntry?.file;
        // Index 0 is workspace (null), then patches start at index 1
        if (idx === 0) {
          review.setActivePatch(null, currentFile);
        } else {
          const patch = patches[idx - 1];
          if (patch) {
            review.setActivePatch(patch.id, currentFile);
          }
        }
      },
    },
    // Actions
    {
      id: "comment",
      title: "comment",
      category: "actions",
      keybinds: [{ name: "c" }],
      isActive: () =>
        focusPanel() === "diff" &&
        ((selectionMode() === "hunk" && selectedHunkRange() !== null) ||
          (selectionMode() === "line" && selectedRange() !== null)),
      onExecute: openCommentEditor,
    },
  ];

  // Register commands for palette
  command.register(commands);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "p") {
      dialog.show(() => <CommandPalette />);
      return;
    }

    // Skip if dialog is open (CommandPalette handles its own keys)
    if (dialog.isOpen()) return;

    // Find and execute first matching active command
    for (const cmd of commands()) {
      if (cmd.isActive() && matchAny(key, cmd.keybinds)) {
        cmd.onExecute();
        return;
      }
    }
  });

  const Footer = () => (
    <box height={1} paddingLeft={1} flexDirection="row" gap={2}>
      <box flexDirection="row">
        <text>j/k </text>
        <text fg="brightBlack">navigate</text>
      </box>
      <Show when={focusPanel() === "sidebar"}>
        <box flexDirection="row">
          <text>tab </text>
          <text fg="brightBlack">switch</text>
        </box>
      </Show>
      <Show when={focusPanel() === "sidebar" && sidebarMode() === "comments"}>
        <box flexDirection="row">
          <text>h/l </text>
          <text fg="brightBlack">collapse/expand</text>
        </box>
      </Show>
      <Show
        when={
          focusPanel() === "diff" &&
          ((selectionMode() === "hunk" && selectedHunkRange() !== null) ||
            (selectionMode() === "line" && selectedRange()))
        }
      >
        <box flexDirection="row">
          <text>c </text>
          <text fg="brightBlack">comment</text>
        </box>
      </Show>
      <Show when={review.activePatchId() !== null}>
        <box flexDirection="row">
          <text>w </text>
          <text fg="brightBlack">workspace</text>
        </box>
      </Show>
      <Show when={focusPanel() === "editor"}>
        <box flexDirection="row">
          <text>enter </text>
          <text fg="brightBlack">submit</text>
        </box>
        <box flexDirection="row">
          <text>C-j </text>
          <text fg="brightBlack">newline</text>
        </box>
        <box flexDirection="row">
          <text>C-e </text>
          <text fg="brightBlack">editor</text>
        </box>
        <box flexDirection="row">
          <text>esc </text>
          <text fg="brightBlack">cancel</text>
        </box>
      </Show>
      <Show when={focusPanel() !== "editor"}>
        <box flexDirection="row">
          <text>esc </text>
          <text fg="brightBlack">back</text>
        </box>
      </Show>
      <Show when={focusPanel() !== "editor"}>
        <box flexDirection="row">
          <text>C-q </text>
          <text fg="brightBlack">quit</text>
        </box>
      </Show>
    </box>
  );

  return (
    <box
      flexDirection="column"
      width={dims().width}
      height={dims().height}
      backgroundColor={theme.background}
    >
      <box flexGrow={1} flexDirection="row" gap={1}>
        <box
          width={40}
          flexDirection="column"
          gap={1}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          backgroundColor={theme.backgroundPanel}
        >
          <ServerStatus />
          <ProjectStatus
            repoRoot={review.repoRoot}
            projectName={review.projectName}
            noteCount={review.noteCount}
          />

          <SidebarProvider
            activeSection={sidebarMode}
            isFocused={() => focusPanel() === "sidebar"}
          >
            <box flexGrow={1} flexDirection="column" overflow="hidden" gap={1}>
              <box flexGrow={1}>
                <FileList
                  displayItems={displayItems}
                  selectedFileIndex={selectedFileNavIndex}
                  fileIndices={fileIndices}
                  entries={review.entries}
                  loading={review.loading}
                  focused={() =>
                    focusPanel() === "sidebar" && sidebarMode() === "files"
                  }
                />
              </box>

              <box flexGrow={1} flexDirection="column">
                <PatchList
                  patches={review.patches}
                  activePatchId={review.activePatchId}
                  loading={review.patchesLoading}
                  selectedIndex={selectedPatchIndex}
                  focused={() =>
                    focusPanel() === "sidebar" && sidebarMode() === "patches"
                  }
                />
              </box>

              <box flexGrow={1} flexDirection="column">
                <CommentList
                  comments={review.comments}
                  loading={review.commentsLoading}
                  selectedIndex={selectedCommentIndex}
                  focused={() =>
                    focusPanel() === "sidebar" && sidebarMode() === "comments"
                  }
                />
              </box>
            </box>
          </SidebarProvider>
        </box>

        <box flexGrow={1} flexDirection="column" gap={1}>
          <DiffPanel
            entry={selectedEntry}
            hunkCount={hunkCount}
            selectedHunkIndex={selectedHunkIndex}
            selectionMode={selectionMode}
            selectedRange={selectedRange}
            cursorRow={cursorRow}
            focused={() => focusPanel() === "diff"}
          />

          <Show when={focusPanel() === "editor" && editorAnchor()}>
            <EditorPanel
              file={editorAnchor()!.file}
              startRow={editorAnchor()!.startRow}
              endRow={editorAnchor()!.endRow}
              commentId={editorAnchor()!.commentId}
              onClose={() => {
                setFocusPanel("diff");
                setEditorAnchor(null);
              }}
            />
          </Show>
        </box>
      </box>

      {/* Footer */}
      <Footer />

      {/* Dialog overlay */}
      <Show when={dialog.isOpen()}>{dialog.content()}</Show>
    </box>
  );
}
