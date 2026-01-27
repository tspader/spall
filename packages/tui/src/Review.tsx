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
import { Git } from "./lib/git";
import { Repo, Review as ReviewStore, Patch } from "./store";
import {
  FileList,
  DiffPanel,
  EditorPanel,
  CommandPalette,
  ServerStatus,
  ProjectStatus,
} from "./components";
import { Client } from "@spall/sdk";
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
        <DialogProvider>
          <CommandProvider>
            <App repoPath={repoPath} />
          </CommandProvider>
        </DialogProvider>
      </ExitProvider>
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
  const { exit, registerCleanup } = useExit();

  // Server state
  const [serverUrl, setServerUrl] = createSignal<string | null>(null);
  const [serverConnected, setServerConnected] = createSignal(false);

  // Repo/project state
  const [repoRoot, setRepoRoot] = createSignal<string | null>(null);
  const [projectName, setProjectName] = createSignal<string | null>(null);
  const [noteCount, setNoteCount] = createSignal<number>(0);

  // Review state (for patch tracking)
  const [commitSha, setCommitSha] = createSignal<string | null>(null);
  const [currentReviewId, setCurrentReviewId] = createSignal<number | null>(
    null,
  );
  const [currentPatchSeq, setCurrentPatchSeq] = createSignal<number | null>(
    null,
  );

  // Data state
  const [entries, setEntries] = createSignal<Git.Entry[]>([]);
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

  const [event, setEvent] = createSignal("");

  // Refs
  let diffScrollbox: ScrollBoxRenderable | null = null;
  let editorTextarea: TextareaRenderable | null = null;
  const clientAbort = new AbortController() as {
    signal: AbortSignal;
    abort: () => void;
  };

  // Register cleanup for client abort
  registerCleanup(() => clientAbort.abort());

  // Derived state - map navigation index to actual entry
  const selectedEntry = () => {
    const entryIndex = fileIndices()[selectedFileIndex()];
    return entryIndex !== undefined ? entries()[entryIndex] : undefined;
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

  onMount(async () => {
    // Detect repo root
    const root = await Git.root(props.repoPath);
    setRepoRoot(root);

    // Get current HEAD commit
    const head = await Git.head(props.repoPath);
    setCommitSha(head);

    const diffEntries = await Git.entries(props.repoPath);
    setEntries(diffEntries);
    setLoading(false);

    // Check if we have an existing review for this repo+commit
    if (root && head) {
      const repo = Repo.getByPath(root);
      if (repo) {
        const review = ReviewStore.getByRepoAndCommit(repo.id, head);
        if (review) {
          setCurrentReviewId(review.id);
          // Check current patch against stored patches
          const fullDiff = await Git.diff(props.repoPath);
          const hash = String(Bun.hash(fullDiff));
          const existingPatch = Patch.getByHash(review.id, hash);
          if (existingPatch) {
            setCurrentPatchSeq(existingPatch.seq);
          }
        }
      }
    }

    // Poll for git changes every second
    let lastHash = await Git.hash(props.repoPath);
    const pollInterval = setInterval(async () => {
      try {
        const hash = await Git.hash(props.repoPath);
        if (hash !== lastHash) {
          lastHash = hash;
          const newEntries = await Git.entries(props.repoPath);
          setEntries(newEntries);
          // Reset current patch seq - diff changed, need to re-check on next comment
          setCurrentPatchSeq(null);
        }
      } catch {
        // Repo probably gone (deleted/moved) - stop polling
        clearInterval(pollInterval);
      }
    }, 1000);
    onCleanup(() => clearInterval(pollInterval));

    // Connect to server
    try {
      const client = await Client.connect(clientAbort.signal);
      const result = await client.health();

      // Subscribe to server events
      (async () => {
        const { stream } = await client.events();
        for await (const e of stream) {
          if (e.tag.length == 0) {
            setEvent("nothing");
          } else {
            setEvent(e.tag);
          }
        }
      })();

      if (result.response.ok) {
        setServerUrl(result.response.url.replace("/health", ""));
        setServerConnected(true);

        // Get or create project for this repo
        if (root) {
          const { stream } = await client.project.create({ dir: root });
          for await (const e of stream) {
            if (e.tag === "project.created") {
              setProjectName(e.info.name);
              setNoteCount(e.info.noteCount);
            }
          }
        }
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
      onExecute: () => exit(),
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
            url={serverUrl}
            connected={serverConnected}
            event={event}
          />
          <ProjectStatus
            repoRoot={repoRoot}
            projectName={projectName}
            noteCount={noteCount}
          />

          <box flexGrow={1} backgroundColor={theme.secondary}>
          <FileList
            displayItems={displayItems}
            selectedFileIndex={selectedFileIndex}
            fileIndices={fileIndices}
            loading={loading}
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
                const root = repoRoot();
                const head = commitSha();

                if (root && head) {
                  // Get or create repo
                  const repo = Repo.getOrCreate(root);

                  // Get or create review for this repo+commit
                  let reviewId = currentReviewId();
                  if (!reviewId) {
                    const review = ReviewStore.getOrCreate(repo.id, head);
                    reviewId = review.id;
                    setCurrentReviewId(reviewId);
                  }

                  // Get or create patch for current diff state
                  const fullDiff = await Git.diff(props.repoPath);
                  const patch = Patch.getOrCreate(reviewId, fullDiff);
                  setCurrentPatchSeq(patch.seq);

                  // TODO: Create the actual comment with patch.seq as anchor
                  console.log("Comment on patch", patch.seq, ":", content);
                  console.log("Selected hunks:", selectedHunks());
                }

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
