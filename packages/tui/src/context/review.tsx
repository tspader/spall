import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { Client, SpallClient } from "@spall/sdk/client";
import { Git } from "../lib/git";
import {
  Repo,
  Review as ReviewStore,
  Patch,
  ReviewComment,
  type SelectionsJson,
} from "../store";
import { useExit } from "./exit";
import {
  type HunkSelections,
  getHunkSelectionCount,
} from "../lib/hunk-selection";
import {
  type LineSelections,
  getLineSelectionCount,
} from "../lib/line-selection";

export interface ReviewContextValue {
  // Server state
  serverUrl: Accessor<string | null>;
  serverConnected: Accessor<boolean>;
  serverEvent: Accessor<string>;

  // Project state
  projectId: Accessor<number | null>;
  projectName: Accessor<string | null>;
  noteCount: Accessor<number>;

  // Repo state
  repoRoot: Accessor<string | null>;
  repoPath: Accessor<string>;

  // Review state
  reviewId: Accessor<number | null>;
  commitSha: Accessor<string | null>;
  patchSeq: Accessor<number | null>;

  // Diff state
  entries: Accessor<Git.Entry[]>;
  loading: Accessor<boolean>;

  // Actions
  saveComment: (
    content: string,
    hunks: HunkSelections,
    lines: LineSelections,
  ) => Promise<number | null>;
}

const ReviewContext = createContext<ReviewContextValue>();

export interface ReviewProviderProps extends ParentProps {
  repoPath: string;
}

// Generate random string for filename
function randomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Get repo name from path (last segment)
function repoName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || "unknown";
}

// Convert HunkSelections/LineSelections to JSON-serializable format
function toSelectionsJson(
  hunks: HunkSelections,
  lines: LineSelections,
): SelectionsJson | undefined {
  const hunkCount = getHunkSelectionCount(hunks);
  const lineCount = getLineSelectionCount(lines);

  if (hunkCount === 0 && lineCount === 0) {
    return undefined;
  }

  const hunksObj: Record<string, number[]> = {};
  for (const [file, indices] of hunks) {
    hunksObj[file] = Array.from(indices);
  }

  const linesObj: Record<string, Array<[number, number]>> = {};
  for (const [file, ranges] of lines) {
    linesObj[file] = ranges.map((r) => [r.startLine, r.endLine]);
  }

  return { hunks: hunksObj, lines: linesObj };
}

export function ReviewProvider(props: ReviewProviderProps) {
  const { registerCleanup } = useExit();

  // Server state
  const [serverUrl, setServerUrl] = createSignal<string | null>(null);
  const [serverConnected, setServerConnected] = createSignal(false);
  const [serverEvent, setServerEvent] = createSignal("");
  const [client, setClient] = createSignal<SpallClient | null>(null);

  // Project state
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectName, setProjectName] = createSignal<string | null>(null);
  const [noteCount, setNoteCount] = createSignal<number>(0);

  // Repo state
  const [repoRoot, setRepoRoot] = createSignal<string | null>(null);

  // Review state
  const [reviewId, setReviewId] = createSignal<number | null>(null);
  const [commitSha, setCommitSha] = createSignal<string | null>(null);
  const [patchSeq, setPatchSeq] = createSignal<number | null>(null);

  // Diff state
  const [entries, setEntries] = createSignal<Git.Entry[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Abort controller for client
  const clientAbort = new AbortController() as {
    signal: AbortSignal;
    abort: () => void;
  };
  registerCleanup(() => clientAbort.abort());

  onMount(async () => {
    // Detect repo root
    const root = await Git.root(props.repoPath);
    setRepoRoot(root);

    // Get current HEAD commit
    const head = await Git.head(props.repoPath);
    setCommitSha(head);

    // Load diff entries
    const diffEntries = await Git.entries(props.repoPath);
    setEntries(diffEntries);
    setLoading(false);

    // Check if we have an existing review for this repo+commit
    if (root && head) {
      const repo = Repo.getByPath(root);
      if (repo) {
        const review = ReviewStore.getByRepoAndCommit(repo.id, head);
        if (review) {
          setReviewId(review.id);
          // Check current patch against stored patches
          const fullDiff = await Git.diff(props.repoPath);
          const hash = String(Bun.hash(fullDiff));
          const existingPatch = Patch.getByHash(review.id, hash);
          if (existingPatch) {
            setPatchSeq(existingPatch.seq);
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
          setPatchSeq(null);
        }
      } catch {
        // Repo probably gone (deleted/moved) - stop polling
        clearInterval(pollInterval);
      }
    }, 1000);
    onCleanup(() => clearInterval(pollInterval));

    // Connect to server
    try {
      const connectedClient = await Client.connect(clientAbort.signal);
      const result = await connectedClient.health();

      // Subscribe to server events
      (async () => {
        const { stream } = await connectedClient.events();
        for await (const e of stream) {
          if (e.tag.length === 0) {
            setServerEvent("nothing");
          } else {
            setServerEvent(e.tag);
          }
        }
      })();

      if (result.response.ok) {
        setServerUrl(result.response.url.replace("/health", ""));
        setServerConnected(true);
        setClient(connectedClient);

        // Get or create project for this repo
        if (root) {
          const { stream } = await connectedClient.project.create({
            dir: root,
          });
          for await (const e of stream) {
            if (e.tag === "project.created") {
              setProjectId(e.info.id);
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

  const saveComment = async (
    content: string,
    hunks: HunkSelections,
    lines: LineSelections,
  ): Promise<number | null> => {
    const root = repoRoot();
    const head = commitSha();
    const c = client();
    const pid = projectId();

    if (!root || !head) return null;
    if (!content.trim()) return null;

    // Get or create repo in local DB
    const repo = Repo.getOrCreate(root);

    // Get or create review for this repo+commit
    let revId = reviewId();
    if (!revId) {
      const review = ReviewStore.getOrCreate(repo.id, head);
      revId = review.id;
      setReviewId(revId);
    }

    // Get or create patch for current diff state
    const fullDiff = await Git.diff(props.repoPath);
    const patch = Patch.getOrCreate(revId, fullDiff);
    setPatchSeq(patch.seq);

    // Convert selections to JSON format
    const selections = toSelectionsJson(hunks, lines);

    // If we have a server connection, create note via SDK
    if (c && pid) {
      const name = repoName(root);
      const path = `review/${name}/${head}/${patch.seq}/${randomId()}.md`;

      const { stream } = await c.note.add({
        project: pid,
        path,
        content,
      });

      const event = await Client.until(stream, "note.created");
      const noteId = event.info.id;

      // Create review comment linking to the note
      ReviewComment.create({ review: revId, noteId, selections });
      setNoteCount((n) => n + 1);

      return noteId;
    }

    // No server connection - can't save note
    // TODO: Queue for later sync?
    return null;
  };

  const value: ReviewContextValue = {
    // Server
    serverUrl,
    serverConnected,
    serverEvent,
    // Project
    projectId,
    projectName,
    noteCount,
    // Repo
    repoRoot,
    repoPath: () => props.repoPath,
    // Review
    reviewId,
    commitSha,
    patchSeq,
    // Diff
    entries,
    loading,
    // Actions
    saveComment,
  };

  return (
    <ReviewContext.Provider value={value}>
      {props.children}
    </ReviewContext.Provider>
  );
}

export function useReview(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within ReviewProvider");
  return ctx;
}
