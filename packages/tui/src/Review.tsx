import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import {
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core";
import { createSignal, createEffect, createMemo, Show } from "solid-js";
import {
  FileList,
  DiffPanel,
  EditorPanel,
  CommandPalette,
  ServerStatus,
  ProjectStatus,
} from "./components";
import {
  type Selection,
  createSelectionState,
  moveDown,
  moveUp,
} from "./lib/selection";
import {
  type HunkSelections,
  createHunkSelections,
  toggleHunkSelection,
  clearHunkSelections,
  getHunkSelectionCount,
  hasSelectedHunks,
} from "./lib/hunk-selection";
import {
  type LineSelections,
  createLineSelections,
  addLineSelection,
  clearLineSelections,
  getLineSelectionCount,
  hasLineSelections,
} from "./lib/line-selection";
import {
  buildFileTree,
  flattenTree,
  getFileIndices,
  type DisplayItem,
} from "./lib/tree";
import { DialogProvider, useDialog } from "./context/dialog";
import { CommandProvider, useCommand } from "./context/command";
import { ThemeProvider, useTheme } from "./context/theme";
import { ExitProvider, useExit } from "./context/exit";
import { ReviewProvider, useReview } from "./context/review";
import { type Command, matchAny } from "./lib/keybind";

// Generate random string for filename
function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

type FocusPanel = "sidebar" | "diff" | "editor";

export interface ReviewProps {
  /** Path to the git repository. Defaults to process.argv[2] or "." */
  repoPath?: string;
}

export function Review(props: ReviewProps = {}) {
  const repoPath = props.repoPath ?? process.argv[2] ?? ".";
  return (
    <ThemeProvider>
      <ExitProvider>
        <ReviewProvider repoPath={repoPath}>
          <DialogProvider>
            <CommandProvider>
              <App repoPath={repoPath} />
            </CommandProvider>
          </DialogProvider>
        </ReviewProvider>
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

  // Navigation state - selectedFileIndex is index into fileIndices (files only)
  const [selectedFileIndex, setSelectedFileIndex] = createSignal(0);
  const [focusPanel, setFocusPanel] = createSignal<FocusPanel>("sidebar");
  const [selectedHunkIndex, setSelectedHunkIndex] = createSignal(0);

  // Line selection state
  const [lineMode, setLineMode] = createSignal(false);
  const [selection, setSelection] = createSignal<Selection>({
    start: 0,
    end: 0,
  });

  // Hunk selection state (for multi-hunk comments)
  const [selectedHunks, setSelectedHunks] = createSignal<HunkSelections>(
    createHunkSelections(),
  );

  // Line selection state (for line-by-line mode)
  const [lineSelections, setLineSelections] = createSignal<LineSelections>(
    createLineSelections(),
  );

  // Editor state
  const [editorInitialContent, setEditorInitialContent] = createSignal("");
  const [editorFilename, setEditorFilename] = createSignal("");

  // Pending comment state (captured when editor opens, used on escape/quit)
  const [pendingHunks, setPendingHunks] = createSignal<HunkSelections>(
    createHunkSelections(),
  );
  const [pendingLines, setPendingLines] = createSignal<LineSelections>(
    createLineSelections(),
  );

  // Refs
  let diffScrollbox: ScrollBoxRenderable | null = null;
  let editorTextarea: TextareaRenderable | null = null;

  // Derived state - map navigation index to actual entry
  const selectedEntry = () => {
    const entryIndex = fileIndices()[selectedFileIndex()];
    return entryIndex !== undefined ? review.entries()[entryIndex] : undefined;
  };

  // Hunk count for the selected entry (computed from diff content)
  const hunkCount = createMemo(() => {
    const entry = selectedEntry();
    if (!entry) return 0;
    // Count @@ markers in the diff content
    const matches = entry.content.match(/^@@/gm);
    return matches?.length ?? 0;
  });

  // Count total lines in the diff for line mode
  const totalDiffLines = () => {
    const entry = selectedEntry();
    if (!entry) return 0;
    return entry.content.split("\n").length;
  };

  // Get current selection for display (used in line mode)
  const currentSelection = createMemo((): Selection => {
    return selection();
  });

  // Scroll to hunk when selection changes
  createEffect(() => {
    const panel = focusPanel();
    if (panel !== "diff" || !diffScrollbox) return;

    if (lineMode()) {
      const sel = selection();
      diffScrollbox.scrollTo(sel.start);
    } else {
      // Scroll to start of selected hunk
      // TODO: Calculate hunk start line from selectedHunkIndex
      // For now, just scroll to top when hunk changes
      const hunkIdx = selectedHunkIndex();
      if (hunkIdx === 0) {
        diffScrollbox.scrollTo(0);
      }
    }
  });

  // Reset selection when file changes
  createEffect(() => {
    selectedFileIndex();
    setSelectedHunkIndex(0);
    setSelection({ start: 0, end: 0 });
  });

  // Helper functions for commands
  const navigateUp = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      setSelectedFileIndex((i) => Math.max(0, i - 1));
    } else if (panel === "diff") {
      if (lineMode()) {
        const state = createSelectionState(totalDiffLines());
        state.selection = selection();
        const newState = moveUp(state, false);
        setSelection(newState.selection);
      } else {
        setSelectedHunkIndex((i: number) => Math.max(0, i - 1));
      }
    }
  };

  const navigateDown = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      setSelectedFileIndex((i) => Math.min(fileIndices().length - 1, i + 1));
    } else if (panel === "diff") {
      if (lineMode()) {
        const state = createSelectionState(totalDiffLines());
        state.selection = selection();
        const newState = moveDown(state, false);
        setSelection(newState.selection);
      } else {
        setSelectedHunkIndex((i: number) => Math.min(hunkCount() - 1, i + 1));
      }
    }
  };

  const extendSelectionUp = () => {
    if (focusPanel() === "diff" && lineMode()) {
      const state = createSelectionState(totalDiffLines());
      state.selection = selection();
      const newState = moveUp(state, true);
      setSelection(newState.selection);
    }
  };

  const extendSelectionDown = () => {
    if (focusPanel() === "diff" && lineMode()) {
      const state = createSelectionState(totalDiffLines());
      state.selection = selection();
      const newState = moveDown(state, true);
      setSelection(newState.selection);
    }
  };

  const enterLineMode = () => {
    setLineMode(true);
    // Start at the beginning of the diff
    setSelection({ start: 0, end: 0 });
  };

  const openCommentEditor = () => {
    // Capture current selections before opening editor
    setPendingHunks(selectedHunks());
    setPendingLines(lineSelections());

    const tmpFilename = `${randomId()}.md`;
    setEditorFilename(tmpFilename);
    setEditorInitialContent("");
    setFocusPanel("editor");
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
        // Keep lineMode active when going back - user can continue in line mode
      },
    },
    {
      id: "back-from-editor",
      title: "back",
      category: "movement",
      keybinds: [{ name: "escape" }],
      isActive: () => focusPanel() === "editor",
      onExecute: async () => {
        // Auto-save comment if there's content
        const content = editorTextarea?.editBuffer?.getText() ?? "";
        if (content.trim()) {
          await review.saveComment(content, pendingHunks(), pendingLines());
        }

        // Clear selections and pending state
        setSelectedHunks(clearHunkSelections());
        setLineSelections(clearLineSelections());
        setPendingHunks(createHunkSelections());
        setPendingLines(createLineSelections());
        setFocusPanel("diff");
      },
    },
    {
      id: "quit",
      title: "quit",
      category: "movement",
      keybinds: [
        { name: "c", ctrl: true },
        { name: "d", ctrl: true },
        { name: "q" },
      ],
      isActive: () => focusPanel() !== "editor",
      onExecute: () => exit(),
    },
    {
      id: "quit-from-editor",
      title: "quit",
      category: "movement",
      keybinds: [
        { name: "c", ctrl: true },
        { name: "d", ctrl: true },
      ],
      isActive: () => focusPanel() === "editor",
      onExecute: async () => {
        // Auto-save comment if there's content before quitting
        const content = editorTextarea?.editBuffer?.getText() ?? "";
        if (content.trim()) {
          await review.saveComment(content, pendingHunks(), pendingLines());
        }
        exit();
      },
    },
    // Selection
    {
      id: "extend-up",
      title: "extend selection up",
      category: "selection",
      keybinds: [
        { name: "up", shift: true },
        { name: "k", shift: true },
      ],
      isActive: () => focusPanel() === "diff" && lineMode(),
      onExecute: extendSelectionUp,
    },
    {
      id: "extend-down",
      title: "extend selection down",
      category: "selection",
      keybinds: [
        { name: "down", shift: true },
        { name: "j", shift: true },
      ],
      isActive: () => focusPanel() === "diff" && lineMode(),
      onExecute: extendSelectionDown,
    },
    {
      id: "select-hunks",
      title: "select hunks",
      category: "selection",
      keybinds: [{ name: "return" }],
      isActive: () =>
        focusPanel() === "sidebar" && !!selectedEntry() && hunkCount() > 0,
      onExecute: () => {
        setFocusPanel("diff");
        setSelectedHunkIndex(0);
      },
    },
    {
      id: "select-by-lines",
      title: "select by lines",
      category: "selection",
      keybinds: [{ name: "a" }],
      isActive: () => focusPanel() === "diff" && !lineMode(),
      onExecute: enterLineMode,
    },
    {
      id: "select-by-hunks",
      title: "select by hunks",
      category: "selection",
      keybinds: [{ name: "a" }],
      isActive: () => focusPanel() === "diff" && lineMode(),
      onExecute: () => setLineMode(false),
    },
    {
      id: "toggle-hunk",
      title: "toggle hunk",
      category: "selection",
      keybinds: [{ name: "space" }],
      isActive: () => focusPanel() === "diff" && !lineMode() && hunkCount() > 0,
      onExecute: () => {
        const entry = selectedEntry();
        const hunkIdx = selectedHunkIndex();
        if (entry) {
          setSelectedHunks(
            toggleHunkSelection(selectedHunks(), entry.file, hunkIdx),
          );
        }
      },
    },
    {
      id: "add-line-selection",
      title: "add selection",
      category: "selection",
      keybinds: [{ name: "space" }],
      isActive: () => focusPanel() === "diff" && lineMode(),
      onExecute: () => {
        const entry = selectedEntry();
        if (entry) {
          const sel = selection();
          setLineSelections(
            addLineSelection(lineSelections(), entry.file, sel.start, sel.end),
          );
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
        focusPanel() !== "editor" &&
        (getHunkSelectionCount(selectedHunks()) > 0 ||
          getLineSelectionCount(lineSelections()) > 0),
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
      <Show when={focusPanel() === "diff"}>
        <box flexDirection="row">
          <text>space </text>
          <text fg="brightBlack">select</text>
        </box>
      </Show>
      <Show when={getHunkSelectionCount(selectedHunks()) > 0}>
        <box flexDirection="row">
          <text>c </text>
          <text fg="brightBlack">comment</text>
        </box>
      </Show>
      <box flexDirection="row">
        <text>esc </text>
        <text fg="brightBlack">back</text>
      </box>
      <box flexDirection="row">
        <text>q </text>
        <text fg="brightBlack">quit</text>
      </box>
    </box>
  );

  return (
    <box
      flexDirection="column"
      width="100%"
      height={dims().height}
      backgroundColor={theme.background}
    >
      <box flexGrow={0} flexDirection="row" gap={1}>
        <box
          width={35}
          flexDirection="column"
          gap={1}
          padding={1}
          backgroundColor={theme.backgroundPanel}
        >
          <ServerStatus
            url={review.serverUrl}
            connected={review.serverConnected}
            event={review.serverEvent}
          />
          <ProjectStatus
            repoRoot={review.repoRoot}
            projectName={review.projectName}
            noteCount={review.noteCount}
          />

          <box flexGrow={1} backgroundColor={theme.secondary}>
            <FileList
              displayItems={displayItems}
              selectedFileIndex={selectedFileIndex}
              fileIndices={fileIndices}
              loading={review.loading}
              focused={() => focusPanel() === "sidebar"}
              hasSelectedHunks={(filePath) =>
                hasSelectedHunks(selectedHunks(), filePath) ||
                hasLineSelections(lineSelections(), filePath)
              }
            />
          </box>
        </box>

        <box flexGrow={1} flexDirection="column" gap={1}>
          <DiffPanel
            entry={selectedEntry}
            hunkCount={hunkCount}
            selectedHunkIndex={selectedHunkIndex}
            focused={() => focusPanel() === "diff"}
            selection={currentSelection}
            lineMode={lineMode}
            selectedHunks={selectedHunks}
            lineSelections={lineSelections}
            currentFilePath={() => selectedEntry()?.file}
            onScrollboxRef={(ref) => (diffScrollbox = ref)}
          />

          <Show when={focusPanel() === "editor"}>
            <EditorPanel
              filename={editorFilename}
              initialContent={editorInitialContent}
              focused={() => true}
              onTextareaRef={(ref) => (editorTextarea = ref)}
              onSubmit={async (content) => {
                await review.saveComment(
                  content,
                  selectedHunks(),
                  lineSelections(),
                );

                setSelectedHunks(clearHunkSelections());
                setLineSelections(clearLineSelections());
                setFocusPanel("diff");
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
