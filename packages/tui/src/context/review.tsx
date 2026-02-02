import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { Git } from "../lib/git";
import { parsePatchEntries } from "../lib/diff";
import { Repo, Review as ReviewStore, Patch, ReviewComment } from "../store";
import { useServer } from "./server";

// Comment with hydrated note details
export interface CommentWithNote {
  id: number;
  reviewId: number;
  noteId: number;
  file: string;
  patchId: number;
  startRow: number;
  endRow: number;
  createdAt: number;
  // Hydrated from server
  notePath: string | null;
  noteContent: string | null;
}

export interface ReviewContextValue {
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
  activePatchId: Accessor<number | null>;

  // Diff state
  workspaceEntries: Accessor<Git.Entry[]>;
  entries: Accessor<Git.Entry[]>;
  loading: Accessor<boolean>;

  // Patches state
  patches: Accessor<Patch.Info[]>;
  patchesLoading: Accessor<boolean>;

  // Comments state
  comments: Accessor<CommentWithNote[]>;
  commentsLoading: Accessor<boolean>;

  // File selection state
  selectedFilePath: Accessor<string | null>;
  setSelectedFilePath: (path: string | null) => void;

  // Actions
  setActivePatch: (patchId: number | null, preserveFilePath?: string) => void;
  getCommentById: (commentId: number) => CommentWithNote | null;
  getCommentForRange: (
    file: string,
    startRow: number,
    endRow: number,
  ) => CommentWithNote | null;
  createComment: (
    file: string,
    startRow: number,
    endRow: number,
    content: string,
  ) => Promise<CommentWithNote | null>;
  updateComment: (commentId: number, content: string) => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue>();

export interface ReviewProviderProps extends ParentProps {
  repoPath: string;
}

// Get repo name from path (last segment)
function repoName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || "unknown";
}

function projectDbName(root: string): string {
  const base = repoName(root).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const h = Bun.hash(root);
  const n = typeof h === "bigint" ? Number(h % 0xffffffffn) : h;
  const suffix = Math.abs(n).toString(36).slice(0, 6);
  return `spall-review-${base}-${suffix}`;
}

export function ReviewProvider(props: ReviewProviderProps) {
  const server = useServer();

  // Project state
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectName, setProjectName] = createSignal<string | null>(null);
  const [noteCount, setNoteCount] = createSignal<number>(0);

  // Repo state
  const [repoRoot, setRepoRoot] = createSignal<string | null>(null);

  // Review state
  const [reviewId, setReviewId] = createSignal<number | null>(null);
  const [commitSha, setCommitSha] = createSignal<string | null>(null);
  const [activePatchId, setActivePatchIdState] = createSignal<number | null>(
    null,
  );

  // Diff state
  const [workspaceEntries, setWorkspaceEntries] = createSignal<Git.Entry[]>([]);
  const [entries, setEntries] = createSignal<Git.Entry[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Patch id for the current working-tree snapshot (if any). Used for comment
  // lookup/editing while viewing the working tree.
  const [workspacePatchId, setWorkspacePatchId] = createSignal<number | null>(
    null,
  );

  // Patches state
  const [patches, setPatches] = createSignal<Patch.Info[]>([]);
  const [patchesLoading, setPatchesLoading] = createSignal(false);

  // Comments state
  const [comments, setComments] = createSignal<CommentWithNote[]>([]);
  const [commentsLoading, setCommentsLoading] = createSignal(false);

  // File selection state (stable across entry ordering)
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(
    null,
  );

  const preserveSelectedFilePath = (
    list: Git.Entry[],
    preferred?: string | null,
  ) => {
    if (!preferred) return null;
    return list.some((e) => e.file === preferred) ? preferred : null;
  };

  const setActivePatch = (
    patchId: number | null,
    preserveFilePath?: string,
  ) => {
    if (patchId === null) {
      setActivePatchIdState(null);
      const ws = workspaceEntries();
      setEntries(ws);
      setSelectedFilePath(
        preserveSelectedFilePath(ws, preserveFilePath ?? selectedFilePath()),
      );
      return;
    }

    const patch = Patch.get(patchId);
    if (!patch) return;

    setActivePatchIdState(patchId);
    const newEntries = parsePatchEntries(patch.content);
    setEntries(newEntries);

    setSelectedFilePath(
      preserveSelectedFilePath(
        newEntries,
        preserveFilePath ?? selectedFilePath(),
      ),
    );
  };

  // gate hydration work that touches either database with:
  // - a signal, to ensure data we use is ready
  // - some plain booleans, to make sure we don't double-pull from the db
  const [projectInitialized, setProjectInitialized] = createSignal(false);
  let projectCreated = false;
  let commentsHydrated = false;

  createEffect(() => {
    const client = server.client();
    if (!client || !projectInitialized()) return;

    if (!projectCreated) {
      projectCreated = true;
      const root = repoRoot()!;
      void (async () => {
        try {
          const result = await client.project.create({
            name: projectDbName(root),
          });
          if (result.data) {
            setProjectId(result.data.id);
            setProjectName(repoName(root));
            setNoteCount(result.data.noteCount);
          }
        } catch {
          // we failed to create a project; since project.create() is a
          // get-or-create operation, either the connection dropped or we have
          // a bad bug in the backend
        } finally {
          projectCreated = false;
        }
      })();
    }

    if (!commentsHydrated) {
      const pending = comments().filter(
        (c) => c.notePath === null || c.noteContent === null,
      );
      if (pending.length === 0) {
        commentsHydrated = true;
        return;
      }
      commentsHydrated = true;
      setCommentsLoading(true);
      void (async () => {
        try {
          const results = await Promise.all(
            pending.map(async (comment) => {
              try {
                const result = await client.note.getById({
                  id: comment.noteId.toString(),
                });
                if (!result.data) return null;
                return {
                  id: comment.id,
                  notePath: result.data.path,
                  noteContent: result.data.content,
                };
              } catch {
                return null;
              }
            }),
          );

          const byId = new Map(
            results.filter(Boolean).map((r) => [r!.id, r!] as const),
          );

          setComments((prev) =>
            prev.map((c) => {
              const upd = byId.get(c.id);
              return upd
                ? { ...c, notePath: upd.notePath, noteContent: upd.noteContent }
                : c;
            }),
          );
        } finally {
          setCommentsLoading(false);
        }
      })();
    }
  });

  onMount(async () => {
    // load everything from the tui db
    const root = await Git.root(props.repoPath);
    setRepoRoot(root);
    if (root) setProjectName(repoName(root));

    const head = await Git.head(props.repoPath);
    setCommitSha(head);

    const diffEntries = await Git.entries(props.repoPath);
    setWorkspaceEntries(diffEntries);
    setEntries(diffEntries);
    setLoading(false);

    // reviews are unique to (repo, commit), so grab current one if exists
    if (root && head) {
      const repo = Repo.getByPath(root);
      if (repo) {
        const review = ReviewStore.getByRepoAndCommit(repo.id, head);
        if (review) {
          setReviewId(review.id);

          // Load comments from local DB
          const local = ReviewComment.list(review.id);
          setComments(
            local.map((c) => ({
              id: c.id,
              reviewId: c.review,
              noteId: c.noteId,
              file: c.file,
              patchId: c.patchId,
              startRow: c.startRow,
              endRow: c.endRow,
              createdAt: c.createdAt,
              notePath: null,
              noteContent: null,
            })),
          );

          // Load all patches for this review
          setPatchesLoading(true);
          const reviewPatches = Patch.list(review.id);
          setPatches(reviewPatches);
          setPatchesLoading(false);

          // Check current patch against stored patches
          const fullDiff = await Git.diff(props.repoPath);
          const hash = String(Bun.hash(fullDiff));
          const existingPatch = Patch.getByHash(review.id, hash);
          if (existingPatch) {
            // Stay on working tree view, but remember which patch matches it
            // so existing comments can be found/edited without switching views.
            setWorkspacePatchId(existingPatch.id);
          }
        }
      }
    }

    setProjectInitialized(true);

    // Poll for git changes every second
    let lastHash = await Git.hash(props.repoPath);
    const pollInterval = setInterval(async () => {
      try {
        const hash = await Git.hash(props.repoPath);
        if (hash === lastHash) return;

        lastHash = hash;
        const newEntries = await Git.entries(props.repoPath);

        // Update workspace entries if viewing live diff
        setWorkspaceEntries(newEntries);
        if (activePatchId() === null) {
          setEntries(newEntries);
          setSelectedFilePath(
            preserveSelectedFilePath(newEntries, selectedFilePath()),
          );
        }

        // Working tree changed; any previous snapshot id is stale.
        setWorkspacePatchId(null);
      } catch {
        // something very bad happened; we're probably just fucked
        clearInterval(pollInterval);
      }
    }, 1000);
    onCleanup(() => clearInterval(pollInterval));
  });

  const getCommentById = (commentId: number): CommentWithNote | null => {
    return comments().find((c) => c.id === commentId) ?? null;
  };

  const getCommentForRange = (
    file: string,
    startRow: number,
    endRow: number,
  ): CommentWithNote | null => {
    const patchId = activePatchId() ?? workspacePatchId();
    if (patchId === null) return null;
    return (
      comments().find(
        (c) =>
          c.patchId === patchId &&
          c.file === file &&
          c.startRow === startRow &&
          c.endRow === endRow,
      ) ?? null
    );
  };

  const createComment = async (
    file: string,
    startRow: number,
    endRow: number,
    content: string,
  ): Promise<CommentWithNote | null> => {
    const root = repoRoot();
    const head = commitSha();
    const c = server.client();
    const pid = projectId();

    if (!root || !head) return null;
    if (!content.trim()) return null;

    // ensure an entry in the reviews table
    const repo = Repo.getOrCreate(root);

    let revId = reviewId();
    if (!revId) {
      const review = ReviewStore.getOrCreate(repo.id, head);
      revId = review.id;
      setReviewId(revId);
    }

    // ensure the current changeset exists in the patches table
    let patch = activePatchId() ? Patch.get(activePatchId()!) : null;
    if (!patch) {
      const fullDiff = await Git.diff(props.repoPath);
      patch = Patch.getOrCreate(revId, fullDiff);

      // If we're viewing the working tree, don't switch to the patch snapshot.
      if (activePatchId() === null) {
        setWorkspacePatchId(patch.id);
      } else {
        setActivePatch(patch.id);
      }

      setPatches((prev) => {
        if (prev.some((p) => p.id === patch!.id)) return prev;
        return [...prev, patch!].sort((a, b) => a.seq - b.seq);
      });
    }

    if (!patch) return null;

    // If we have a server connection, create note via SDK
    if (c && pid) {
      const name = repoName(root);
      const shortFile = file.split("/").pop() ?? file;
      const path = `review/${name}/${head}/${patch.seq}/${shortFile}_${startRow}-${endRow}.md`;

      const result = await c.note.add({
        project: pid,
        path,
        content,
        dupe: true,
      });

      if (result.error || !result.data) {
        return null;
      }
      const noteId = result.data.id;

      // Create review comment linking to the note
      const localComment = ReviewComment.create({
        review: revId,
        noteId,
        file,
        patchId: patch.id,
        startRow,
        endRow,
      });
      setNoteCount((n) => n + 1);

      // Build the hydrated comment
      const newComment: CommentWithNote = {
        id: localComment.id,
        reviewId: revId,
        noteId,
        file,
        patchId: localComment.patchId,
        startRow: localComment.startRow,
        endRow: localComment.endRow,
        createdAt: localComment.createdAt,
        notePath: path,
        noteContent: content,
      };

      // Add to comments list
      setComments((prev) => [...prev, newComment]);

      return newComment;
    }

    // No server connection - can't save note
    return null;
  };

  const updateComment = async (
    commentId: number,
    content: string,
  ): Promise<void> => {
    const c = server.client();

    if (!c) return;
    if (!content.trim()) return;

    // Find the comment to get its noteId
    const comment = comments().find((c) => c.id === commentId);
    if (!comment) return;

    // Update the note via SDK
    const result = await c.note.update({
      id: comment.noteId.toString(),
      content,
      dupe: true,
    });

    if (result.error) return;

    // Update local state
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, noteContent: content } : c,
      ),
    );
  };

  const value: ReviewContextValue = {
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
    activePatchId,
    // Diff
    workspaceEntries,
    entries,
    loading,
    // Patches
    patches,
    patchesLoading,
    // Comments
    comments,
    commentsLoading,
    // File selection
    selectedFilePath,
    setSelectedFilePath,
    // Actions
    setActivePatch,
    getCommentById,
    getCommentForRange,
    createComment,
    updateComment,
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
