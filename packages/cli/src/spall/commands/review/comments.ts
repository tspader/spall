import { db, Repo, Review, ReviewComment } from "@spall/tui/store";
import { Git } from "@spall/tui/lib/git";
import { Client } from "@spall/sdk/client";
import { table, type CommandDef } from "@spall/cli/shared";

export const comments: CommandDef = {
  description: "List comments for a review",
  options: {
    path: {
      alias: "p",
      type: "string",
      description: "Path to git repo",
      default: ".",
    },
    commit: {
      alias: "c",
      type: "string",
      description: "Commit SHA (defaults to HEAD)",
    },
    review: {
      alias: "r",
      type: "number",
      description: "Review ID (overrides repo/commit detection)",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: table, json",
      default: "table",
    },
  },
  handler: async (argv) => {
    db.init();

    let reviewId: number;

    if (argv.review != null) {
      reviewId = argv.review;
    } else {
      const root = await Git.root(argv.path);
      if (!root) {
        console.error("Not a git repository.");
        process.exit(1);
      }

      const commitSha = argv.commit ?? (await Git.head(root));
      if (!commitSha) {
        console.error("Could not resolve HEAD commit.");
        process.exit(1);
      }

      const repo = Repo.getByPath(root);
      if (!repo) {
        console.log("No comments found.");
        return;
      }

      const review = Review.getByRepoAndCommit(repo.id, commitSha);
      if (!review) {
        console.log("No comments found.");
        return;
      }

      reviewId = review.id;
    }

    const localComments = ReviewComment.list(reviewId);
    if (localComments.length === 0) {
      console.log("No comments found.");
      return;
    }

    // Hydrate comment content from the server
    const client = await Client.connect();
    type Hydrated = ReviewComment.Info & {
      content: string | null;
    };
    const hydrated: Hydrated[] = [];

    for (const comment of localComments) {
      let content: string | null = null;
      try {
        const result = await client.note.getById({
          id: comment.noteId.toString(),
        });
        if (result.data) {
          content = result.data.content;
        }
      } catch {
        // Note might have been deleted or server unavailable
      }
      hydrated.push({ ...comment, content });
    }

    const oneLine = (s: string) => s.replace(/\n/g, " ");

    switch (argv.output) {
      case "json":
        console.log(JSON.stringify(hydrated, null, 2));
        break;
      default:
        table(
          ["file", "lines", "content"],
          [
            hydrated.map((c) => c.file),
            hydrated.map((c) => `${c.startRow}:${c.endRow}`),
            hydrated.map((c) => oneLine(c.content ?? "(unavailable)")),
          ],
          { flex: [1, 0, 2] },
        );
    }
  },
};
