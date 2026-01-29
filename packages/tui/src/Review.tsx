import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createSignal, createEffect, createMemo, Show } from "solid-js";
import {
  FileList,
  CommentList,
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
import { parseFileDiff } from "./lib/diff";
import { DialogProvider, useDialog } from "./context/dialog";
import { CommandProvider, useCommand } from "./context/command";
import { ThemeProvider, useTheme } from "./context/theme";
import { ExitProvider, useExit } from "./context/exit";
import { ServerProvider } from "./context/server";
import { ReviewProvider, useReview } from "./context/review";
import { SidebarProvider } from "./context/sidebar";
import { type Command, matchAny } from "./lib/keybind";

type FocusPanel = "sidebar" | "diff" | "editor";
type SidebarMode = "files" | "comments";

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

  // Navigation state - selectedFileIndex is index into fileIndices (files only)
  const [selectedFileIndex, setSelectedFileIndex] = createSignal(0);
  const [focusPanel, setFocusPanel] = createSignal<FocusPanel>("sidebar");
  const [sidebarMode, setSidebarMode] = createSignal<SidebarMode>("files");
  const [selectedHunkIndex, setSelectedHunkIndex] = createSignal(0);

  // Comment list state
  const [selectedCommentIndex, setSelectedCommentIndex] = createSignal(0);

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

  const selectedHunkRange = createMemo(() => {
    const entry = selectedEntry();
    if (!entry) return null;
    const hunks = parseFileDiff(entry.content, entry.file).hunks;
    const hunk = hunks[selectedHunkIndex()];
    if (!hunk) return null;
    return { startRow: hunk.startRow, endRow: hunk.endRow };
  });

  // Reset selection when file changes
  createEffect(() => {
    selectedFileIndex();
    setSelectedHunkIndex(0);
  });

  // Helper functions for commands
  const navigateUp = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      if (sidebarMode() === "files") {
        setSelectedFileIndex((i) => Math.max(0, i - 1));
      } else {
        setSelectedCommentIndex((i) => Math.max(0, i - 1));
      }
    } else if (panel === "diff") {
      setSelectedHunkIndex((i: number) => Math.max(0, i - 1));
    }
  };

  const navigateDown = () => {
    const panel = focusPanel();
    if (panel === "sidebar") {
      if (sidebarMode() === "files") {
        setSelectedFileIndex((i) => Math.min(fileIndices().length - 1, i + 1));
      } else {
        const maxIndex = review.comments().length - 1;
        setSelectedCommentIndex((i) => Math.min(maxIndex, i + 1));
      }
    } else if (panel === "diff") {
      setSelectedHunkIndex((i: number) => Math.min(hunkCount() - 1, i + 1));
    }
  };

  const openCommentEditor = () => {
    const entry = selectedEntry();
    if (!entry) return;
    setFocusPanel("editor");
  };

  const toggleSidebarMode = () => {
    setSidebarMode((m) => (m === "files" ? "comments" : "files"));
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
        { name: "q" },
      ],
      isActive: () => focusPanel() !== "editor",
      onExecute: () => exit(),
    },

    {
      id: "switch-sidebar",
      title: "switch section",
      category: "movement",
      keybinds: [{ name: "tab" }, { name: "tab", shift: true }],
      isActive: () => focusPanel() === "sidebar",
      onExecute: toggleSidebarMode,
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
      },
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
        // Navigate to the comment's file+hunk and open editor
        const comments = review.comments();
        const idx = selectedCommentIndex();
        const comment = comments[idx];
        if (!comment) return;

        // Find the file index for this comment's file
        const entries = review.entries();
        const entryIndex = entries.findIndex((e) => e.file === comment.file);
        if (entryIndex === -1) return;

        // Find the navigation index (into fileIndices)
        const navIndex = fileIndices().indexOf(entryIndex);
        if (navIndex === -1) return;

        // Navigate to the file and hunk
        setSelectedFileIndex(navIndex);
        setSelectedHunkIndex(comment.hunkIndex);
        setFocusPanel("editor");
      },
    },
    // Actions
    {
      id: "comment",
      title: "comment",
      category: "actions",
      keybinds: [{ name: "c" }],
      isActive: () => focusPanel() === "diff" && hunkCount() > 0,
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
      <Show when={focusPanel() === "diff"}>
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
      width={dims().width}
      height={dims().height}
      backgroundColor={theme.background}
    >
      <box flexGrow={1} flexDirection="row" gap={1}>
        <box
          width={35}
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

          <SidebarProvider activeSection={sidebarMode}>
            <box flexGrow={1} flexDirection="column" overflow="hidden" gap={1}>
              <box flexGrow={1}>
                <FileList
                  displayItems={displayItems}
                  selectedFileIndex={selectedFileIndex}
                  fileIndices={fileIndices}
                  loading={review.loading}
                  focused={() =>
                    focusPanel() === "sidebar" && sidebarMode() === "files"
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
            focused={() => focusPanel() === "diff"}
          />

          <Show when={focusPanel() === "editor" && selectedEntry()}>
            <EditorPanel
              file={selectedEntry()!.file}
              hunkIndex={selectedHunkIndex()}
              startRow={selectedHunkRange()?.startRow}
              endRow={selectedHunkRange()?.endRow}
              onClose={() => setFocusPanel("diff")}
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
