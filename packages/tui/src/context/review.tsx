import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onMount,
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

export function pickCommentForRange(
  list: CommentWithNote[],
  preferredPatchId: number | null,
  file: string,
  startRow: number,
  endRow: number,
): CommentWithNote | null {
  if (preferredPatchId !== null) {
    const exact =
      list.find(
        (c) =>
          c.patchId === preferredPatchId &&
          c.file === file &&
          c.startRow === startRow &&
          c.endRow === endRow,
      ) ?? null;
    if (exact) return exact;
  }

  const matches = list.filter(
    (c) => c.file === file && c.startRow === startRow && c.endRow === endRow,
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, c) => (c.createdAt > best.createdAt ? c : best));
}

export interface ReviewContextValue {
  // Corpus state
  corpusId: Accessor<number | null>;
  corpusName: Accessor<string>;

  // Current working tree snapshot (stored as a patch)
  workingTreePatchId: Accessor<number | null>;

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
  refreshWorkingTree: (preserveFilePath?: string) => Promise<void>;
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

const REVIEW_CORPUS_NAME = "spall-review";

function repoKey(root: string): string {
  const base = repoName(root).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const h = Bun.hash(root);
  const n = typeof h === "bigint" ? Number(h % 0xffffffffn) : h;
  const suffix = Math.abs(n).toString(36).slice(0, 6);
  return `${base}-${suffix}`;
}

function reviewNotePath(input: {
  root: string;
  commitSha: string;
  patchSeq: number;
  file: string;
  startRow: number;
  endRow: number;
}): string {
  const filePath = input.file.replace(/\\/g, "/");
  return `review/${repoKey(input.root)}/${input.commitSha}/p${input.patchSeq}/${filePath}__${input.startRow}-${input.endRow}.md`;
}

export function ReviewProvider(props: ReviewProviderProps) {
  const server = useServer();

  const [corpusId, setCorpusId] = createSignal<number | null>(null);
  const corpusName = () => REVIEW_CORPUS_NAME;

  // Repo state
  const [repoRoot, setRepoRoot] = createSignal<string | null>(null);

  // Review state
  const [reviewId, setReviewId] = createSignal<number | null>(null);
  const [commitSha, setCommitSha] = createSignal<string | null>(null);
  const [activePatchId, setActivePatchIdState] = createSignal<number | null>(
    null,
  );

  const [workingTreePatchId, setWorkingTreePatchId] = createSignal<
    number | null
  >(null);

  // Diff state
  const [workspaceEntries, setWorkspaceEntries] = createSignal<Git.Entry[]>([]);
  const [workspaceDiff, setWorkspaceDiff] = createSignal<string>("");
  const [entries, setEntries] = createSignal<Git.Entry[]>([]);
  const [loading, setLoading] = createSignal(true);

  const ensureReviewId = (root: string, head: string): number => {
    const current = reviewId();
    if (current !== null) return current;
    const repo = Repo.getOrCreate(root);
    const review = ReviewStore.getOrCreate(repo.id, head);
    setReviewId(review.id);
    return review.id;
  };

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
      const wt = workingTreePatchId();
      if (wt !== null) {
        setActivePatch(wt, preserveFilePath);
        return;
      }

      setActivePatchIdState(null);
      const ws = parsePatchEntries(workspaceDiff());
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

  const refreshWorkingTree = async (preserveFilePath?: string) => {
    const newEntries = await Git.entries(props.repoPath);
    setWorkspaceEntries(newEntries);
    const fullDiff = newEntries.map((x) => x.content).join("\n");
    setWorkspaceDiff(fullDiff);

    const root = repoRoot();
    const head = commitSha();

    // If we can't associate this with a review yet, still update the view.
    if (!root || !head) {
      if (activePatchId() === null) {
        const ws = parsePatchEntries(fullDiff);
        setEntries(ws);
        setSelectedFilePath(
          preserveSelectedFilePath(ws, preserveFilePath ?? selectedFilePath()),
        );
      }
      setWorkingTreePatchId(null);
      return;
    }

    const revId = ensureReviewId(root, head);
    const patch = Patch.getOrCreate(revId, fullDiff);

    const prevWt = workingTreePatchId();
    setWorkingTreePatchId(patch.id);

    setPatches((prev) => {
      if (prev.some((p) => p.id === patch.id)) return prev;
      return [...prev, patch].sort((a, b) => a.seq - b.seq);
    });

    // If we were viewing the working tree snapshot, advance it.
    const active = activePatchId();
    if (active === null || (prevWt !== null && active === prevWt)) {
      setActivePatch(patch.id, preserveFilePath);
    }
  };

  // Gate hydration work that touches either database with:
  // - a signal, to ensure local review/comments are loaded
  // - some booleans, to keep it one-shot
  const [initialized, setInitialized] = createSignal(false);
  let corpusInitInFlight = false;
  let commentsHydrated = false;

  createEffect(() => {
    const client = server.client();
    if (!client || !initialized()) return;

    if (corpusId() === null && !corpusInitInFlight) {
      corpusInitInFlight = true;
      void (async () => {
        try {
          const result = await client.corpus.create({
            name: REVIEW_CORPUS_NAME,
          });
          if (result.data) {
            setCorpusId(result.data.id);
          }
        } catch {
          // no-op: we'll try again if the client reconnects
        } finally {
          corpusInitInFlight = false;
        }
      })();
    }

    if (commentsHydrated) return;
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
  });

  onMount(async () => {
    // load everything from the tui db
    const root = await Git.root(props.repoPath);
    setRepoRoot(root);

    const head = await Git.head(props.repoPath);
    setCommitSha(head);

    // Ensure a review exists for this (repo, commit) so the working tree
    // snapshot can be treated as a normal patch.
    if (root && head) {
      ensureReviewId(root, head);
    }

    const revId = reviewId();
    if (revId) {
      // Load comments from local DB
      const local = ReviewComment.list(revId);
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

      // Load patches
      setPatchesLoading(true);
      setPatches(Patch.list(revId));
      setPatchesLoading(false);
    }

    // Capture the working tree snapshot and select it.
    await refreshWorkingTree(selectedFilePath() ?? undefined);

    // Prune unreferenced patches; keep the current working tree snapshot.
    if (revId) {
      const wt = workingTreePatchId();
      Patch.pruneUnreferenced(revId, wt !== null ? [wt] : []);
      setPatches(Patch.list(revId));
    }

    setLoading(false);

    setInitialized(true);

    // No automatic polling; user refreshes explicitly.
  });

  const getCommentById = (commentId: number): CommentWithNote | null => {
    return comments().find((c) => c.id === commentId) ?? null;
  };

  const getCommentForRange = (
    file: string,
    startRow: number,
    endRow: number,
  ): CommentWithNote | null => {
    const patchId = activePatchId();
    return pickCommentForRange(comments(), patchId, file, startRow, endRow);
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
    let cid = corpusId();

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
      const wt = workingTreePatchId();
      patch = wt !== null ? Patch.get(wt) : null;

      // As a fallback (shouldn't happen), persist the current working tree diff.
      if (!patch) {
        const fullDiff = workspaceDiff();
        patch = Patch.getOrCreate(revId, fullDiff);
        setWorkingTreePatchId(patch.id);
        setPatches((prev) => {
          if (prev.some((p) => p.id === patch!.id)) return prev;
          return [...prev, patch!].sort((a, b) => a.seq - b.seq);
        });
        if (activePatchId() === null) setActivePatch(patch.id);
      }
    }

    if (!patch) return null;

    // If we have a server connection, upsert the note via SDK
    if (c) {
      if (cid === null) {
        try {
          const ensured = await c.corpus.create({ name: REVIEW_CORPUS_NAME });
          if (ensured.data) {
            cid = ensured.data.id;
            setCorpusId(cid);
          }
        } catch {
          // ignore
        }
      }
      if (cid === null) return null;

      const path = reviewNotePath({
        root,
        commitSha: head,
        patchSeq: patch.seq,
        file,
        startRow,
        endRow,
      });

      const result = await c.note.upsert({
        id: cid.toString(),
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
    // Corpus
    corpusId,
    corpusName,
    // Working tree snapshot
    workingTreePatchId,
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
    refreshWorkingTree,
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
