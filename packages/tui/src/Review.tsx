import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/solid";
import {
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core";
import {
  createSignal,
  createEffect,
  createMemo,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import {
  getDiffEntries,
  getDiffHash,
  parseChangeBlocks,
  type DiffEntry,
} from "./lib/git";
import {
  FileList,
  DiffPanel,
  EditorPanel,
  CommandPalette,
  ServerStatus,
  HalfLineShadow,
} from "./components";
import { Client } from "@spall/sdk";
import {
  type Selection,
  createSelectionState,
  moveDown,
  moveUp,
} from "./lib/selection";
import {
  type SelectedHunk,
  toggleHunkSelection,
  clearSelection as clearHunkSelection,
  getFileSelectionCount,
} from "./lib/hunk-selection";
import {
  type LineSelection,
  addLineSelection,
  clearLineSelections,
  getLineSelectionsForFile,
  getFileLineSelectionCount,
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
      <DialogProvider>
        <CommandProvider>
          <App repoPath={repoPath} />
        </CommandProvider>
      </DialogProvider>
    </ThemeProvider>
  );
}

interface AppProps {
  repoPath: string;
}

function App(props: AppProps) {
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  const dialog = useDialog();
  const command = useCommand();
  const { theme, themeName, setTheme } = useTheme();

  // Server state
  const [serverUrl, setServerUrl] = createSignal<string | null>(null);
  const [serverConnected, setServerConnected] = createSignal(false);

  // Data state
  const [entries, setEntries] = createSignal<DiffEntry[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Derived tree state
  const displayItems = createMemo<DisplayItem[]>(() => {
    const e = entries();
    if (e.length === 0) return [];
    const tree = buildFileTree(e);
    return flattenTree(tree);
  });

  const fileIndices = createMemo(() => getFileIndices(displayItems()));

  // Navigation state - selectedFileIndex is index into fileIndices (files only)
  const [selectedFileIndex, setSelectedFileIndex] = createSignal(0);
  const [focusPanel, setFocusPanel] = createSignal<FocusPanel>("sidebar");
  const [selectedBlockIndex, setSelectedBlockIndex] = createSignal(0);

  // Line selection state
  const [lineMode, setLineMode] = createSignal(false);
  const [selection, setSelection] = createSignal<Selection>({
    start: 0,
    end: 0,
  });

  // Hunk selection state (for multi-hunk comments)
  const [selectedHunks, setSelectedHunks] = createSignal<SelectedHunk[]>([]);

  // Line selection state (for line-by-line mode)
  const [lineSelections, setLineSelections] = createSignal<LineSelection[]>([]);

  // Editor state
  const [editorInitialContent, setEditorInitialContent] = createSignal("");
  const [editorFilename, setEditorFilename] = createSignal("");

  // Refs
  let diffScrollbox: ScrollBoxRenderable | null = null;
  let editorTextarea: TextareaRenderable | null = null;

  // Derived state - map navigation index to actual entry
  const selectedEntry = () => {
    const entryIndex = fileIndices()[selectedFileIndex()];
    return entryIndex !== undefined ? entries()[entryIndex] : undefined;
  };
  const blocks = createMemo(() =>
    selectedEntry() ? parseChangeBlocks(selectedEntry()!.content) : [],
  );
  const selectedBlock = () => blocks()[selectedBlockIndex()];

  // Count total lines in the diff for line mode
  const totalDiffLines = () => {
    const entry = selectedEntry();
    if (!entry) return 0;
    return entry.content.split("\n").length;
  };

  // Show block indicator in diff/editor panels
  const showBlockIndicator = () => {
    const panel = focusPanel();
    if (panel !== "diff" && panel !== "editor") return false;
    if (lineMode()) return true;
    return selectedBlock() !== undefined;
  };

  // Get current selection for display
  const currentSelection = createMemo((): Selection => {
    if (lineMode()) {
      return selection();
    }
    const block = selectedBlock();
    if (block) {
      return {
        start: block.startLine,
        end: block.startLine + block.lineCount - 1,
      };
    }
    return { start: 0, end: 0 };
  });

  // Scroll to selection when it changes
  createEffect(() => {
    const panel = focusPanel();
    if (panel !== "diff" || !diffScrollbox) return;

    if (lineMode()) {
      const sel = selection();
      diffScrollbox.scrollTo(sel.start);
    } else {
      const blockIndex = selectedBlockIndex();
      const currentBlocks = blocks();
      if (currentBlocks.length > 0 && blockIndex < currentBlocks.length) {
        const block = currentBlocks[blockIndex];
        if (block) {
          diffScrollbox.scrollTo(block.startLine);
        }
      }
    }
  });

  // Reset selection when file changes
  createEffect(() => {
    selectedFileIndex();
    setSelectedBlockIndex(0);
    setSelection({ start: 0, end: 0 });
  });

  onMount(async () => {
    const diffEntries = await getDiffEntries(props.repoPath);
    setEntries(diffEntries);
    setLoading(false);

    // Poll for git changes every second
    let lastHash = await getDiffHash(props.repoPath);
    const pollInterval = setInterval(async () => {
      const hash = await getDiffHash(props.repoPath);
      if (hash !== lastHash) {
        lastHash = hash;
        const newEntries = await getDiffEntries(props.repoPath);
        setEntries(newEntries);
      }
    }, 1000);
    onCleanup(() => clearInterval(pollInterval));

    // Connect to server
    try {
      const client = await Client.connect();
      const result = await client.health();
      if (result.response.ok) {
        setServerUrl(result.response.url.replace("/health", ""));
        setServerConnected(true);
      }
    } catch {
      setServerConnected(false);
    }
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
        setSelectedBlockIndex((i) => Math.max(0, i - 1));
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
        setSelectedBlockIndex((i) => Math.min(blocks().length - 1, i + 1));
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
    const block = selectedBlock();
    if (block) {
      setSelection({ start: block.startLine, end: block.startLine });
    } else {
      setSelection({ start: 0, end: 0 });
    }
  };

  const openCommentEditor = () => {
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
        setSelectedBlockIndex(0);
        // Keep lineMode active when going back - user can continue in line mode
      },
    },
    {
      id: "back-from-editor",
      title: "back",
      category: "movement",
      keybinds: [{ name: "escape" }],
      isActive: () => focusPanel() === "editor",
      onExecute: () => setFocusPanel("diff"),
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
      onExecute: () => renderer.destroy(),
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
        focusPanel() === "sidebar" && !!selectedEntry() && blocks().length > 0,
      onExecute: () => {
        setFocusPanel("diff");
        setSelectedBlockIndex(0);
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
      isActive: () =>
        focusPanel() === "diff" && !lineMode() && blocks().length > 0,
      onExecute: () => {
        const fileIdx = fileIndices()[selectedFileIndex()];
        const blockIdx = selectedBlockIndex();
        if (fileIdx !== undefined) {
          setSelectedHunks(
            toggleHunkSelection(selectedHunks(), fileIdx, blockIdx),
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
        const fileIdx = fileIndices()[selectedFileIndex()];
        if (fileIdx !== undefined) {
          const sel = selection();
          setLineSelections(
            addLineSelection(lineSelections(), fileIdx, sel.start, sel.end),
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
        (selectedHunks().length > 0 || lineSelections().length > 0),
      onExecute: openCommentEditor,
    },
  ];

  // Register commands for palette
  command.register(commands);

  // Single keyboard handler
  useKeyboard((key) => {
    // Command palette with Ctrl+P (always available)
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
      <Show when={selectedHunks().length > 0}>
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
      padding={1}
    >
      <box flexGrow={1} flexDirection="row" gap={1}>
        <box
          width={35}
          flexDirection="column"
          gap={1}
          padding={1}
          backgroundColor={theme.backgroundPanel}
        >
          <ServerStatus url={serverUrl} connected={serverConnected} />
          <FileList
            displayItems={displayItems}
            selectedFileIndex={selectedFileIndex}
            fileIndices={fileIndices}
            loading={loading}
            focused={() => focusPanel() === "sidebar"}
            hasSelectedHunks={(fileIndex) =>
              getFileSelectionCount(selectedHunks(), fileIndex) > 0 ||
              getFileLineSelectionCount(lineSelections(), fileIndex) > 0
            }
          />
        </box>

        <box flexGrow={1} flexDirection="column">
          <DiffPanel
            entry={selectedEntry}
            blocks={blocks}
            selectedBlockIndex={selectedBlockIndex}
            focused={() => focusPanel() === "diff"}
            showBlockIndicator={showBlockIndicator}
            selection={currentSelection}
            lineMode={lineMode}
            selectedHunks={selectedHunks}
            lineSelections={lineSelections}
            currentFileIndex={() => fileIndices()[selectedFileIndex()]}
            onScrollboxRef={(ref) => (diffScrollbox = ref)}
          />

          <Show when={focusPanel() === "editor"}>
            <EditorPanel
              filename={editorFilename}
              initialContent={editorInitialContent}
              focused={() => true}
              onTextareaRef={(ref) => (editorTextarea = ref)}
              onSubmit={(content) => {
                console.log("Saved annotation:", content);
                console.log("Selected hunks:", selectedHunks());
                setSelectedHunks(clearHunkSelection());
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
