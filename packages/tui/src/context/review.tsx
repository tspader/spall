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
import { Client, SpallClient } from "@spall/sdk/client";
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
  entries: Accessor<Git.Entry[]>;
  loading: Accessor<boolean>;

  // Comments state
  comments: Accessor<CommentWithNote[]>;
  commentsLoading: Accessor<boolean>;

  // Actions
  setActivePatch: (patchId: number | null) => void;
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

  // Comments state
  const [comments, setComments] = createSignal<CommentWithNote[]>([]);
  const [commentsLoading, setCommentsLoading] = createSignal(false);

  const setActivePatch = (patchId: number | null) => {
    if (patchId === null) {
      setActivePatchIdState(null);
      setEntries(workspaceEntries());
      return;
    }

    const patch = Patch.get(patchId);
    if (!patch) return;

    setActivePatchIdState(patchId);
    setEntries(parsePatchEntries(patch.content));
  };

  // Track if we've initialized project for current connection
  const [projectInitialized, setProjectInitialized] = createSignal(false);

  // Load comments for a review, hydrating note details from server
  const loadComments = async (revId: number, c: SpallClient) => {
    setCommentsLoading(true);
    try {
      const localComments = ReviewComment.list(revId);
      const hydrated: CommentWithNote[] = [];

      for (const comment of localComments) {
        let notePath: string | null = null;
        let noteContent: string | null = null;

        try {
          const result = await c.note.getById({
            id: comment.noteId.toString(),
          });
          if (result.data) {
            notePath = result.data.path;
            noteContent = result.data.content;
          }
        } catch {
          // Note might have been deleted or server unavailable
        }

        hydrated.push({
          id: comment.id,
          reviewId: comment.review,
          noteId: comment.noteId,
          file: comment.file,
          patchId: comment.patchId,
          startRow: comment.startRow,
          endRow: comment.endRow,
          createdAt: comment.createdAt,
          notePath,
          noteContent,
        });
      }

      setComments(hydrated);
    } finally {
      setCommentsLoading(false);
    }
  };

  // React to server connection changes
  createEffect(async () => {
    const c = server.client();
    const root = repoRoot();
    const revId = reviewId();

    if (!c || !root) {
      // Disconnected - reset project state but keep comments
      setProjectInitialized(false);
      return;
    }

    // Already initialized for this connection
    if (projectInitialized()) return;

    try {
      // Get or create project for this repo
      const result = await c.project.create({ dir: root });
      if (result.data) {
        setProjectId(result.data.id);
        setProjectName(result.data.name);
        setNoteCount(result.data.noteCount);
      }

      // Load existing comments if we have a review
      if (revId) {
        await loadComments(revId, c);
      }

      setProjectInitialized(true);
    } catch {
      // Connection lost during initialization
    }
  });

  onMount(async () => {
    // Detect repo root
    const root = await Git.root(props.repoPath);
    setRepoRoot(root);

    // Get current HEAD commit
    const head = await Git.head(props.repoPath);
    setCommitSha(head);

    // Load diff entries
    const diffEntries = await Git.entries(props.repoPath);
    setWorkspaceEntries(diffEntries);
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
            setActivePatch(existingPatch.id);
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
          // Update workspace entries if viewing live diff
          setWorkspaceEntries(newEntries);
          if (activePatchId() === null) {
            setEntries(newEntries);
          }
        }
      } catch {
        // Repo probably gone (deleted/moved) - stop polling
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
    const patchId = activePatchId();
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
    let patch = activePatchId() ? Patch.get(activePatchId()!) : null;
    if (!patch) {
      const fullDiff = await Git.diff(props.repoPath);
      patch = Patch.getOrCreate(revId, fullDiff);
      setActivePatch(patch.id);
    }

    if (!patch) return null;

    // If we have a server connection, create note via SDK
    if (c && pid) {
      const name = repoName(root);
      const shortFile = file.split("/").pop() ?? file;
      const path = `review/${name}/${head}/${patch.seq}/${shortFile}:${startRow}-${endRow}.md`;

      const { stream } = await c.note.add({
        project: pid,
        path,
        content,
        dupe: true,
      });

      let noteId: number | null = null;
      for await (const event of stream as AsyncGenerator<any>) {
        if (event?.tag === "error") {
          return null;
        }
        if (event.tag === "note.created") {
          noteId = event.info.id;
          break;
        }
      }

      if (noteId === null) return null;

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
    const { stream } = await c.note.update({
      id: comment.noteId.toString(),
      content,
      dupe: true,
    });

    for await (const event of stream as AsyncGenerator<any>) {
      if (event?.tag === "error") return;
      if (event.tag === "note.updated") break;
    }

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
    entries,
    loading,
    // Comments
    comments,
    commentsLoading,
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
