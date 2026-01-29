import { db, Repo, Review } from "@spall/tui/store";
import { Git } from "@spall/tui/lib/git";
import { table } from "../../layout";
import type { CommandDef } from "../../yargs";

export const create: CommandDef = {
  description: "Create a review for the current repo and commit",
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
    name: {
      alias: "n",
      type: "string",
      description: "Optional name for the review",
    },
  },
  handler: async (argv) => {
    db.init();

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

    const repo = Repo.getOrCreate(root);
    const existing = Review.getByRepoAndCommit(repo.id, commitSha);
    const review = existing ?? Review.create({ repo: repo.id, commitSha, name: argv.name });

    table(
      ["id", "commit", "name", "created"],
      [
        [String(review.id)],
        [review.commitSha.slice(0, 7)],
        [review.name ?? ""],
        [new Date(review.createdAt).toISOString()],
      ],
    );
  },
};
