import { db, Repo, Review } from "@spall/tui/store";
import { Git } from "@spall/tui/lib/git";
import { table, type CommandDef } from "@spall/tui/cli/shared";

export const latest: CommandDef = {
  description: "Get the latest review for the current repo",
  options: {
    path: {
      alias: "p",
      type: "string",
      description: "Path to git repo",
      default: ".",
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

    const root = await Git.root(argv.path);
    if (!root) {
      console.error("Not a git repository.");
      process.exit(1);
    }

    const repo = Repo.getByPath(root);
    if (!repo) {
      console.error("No reviews found.");
      process.exit(1);
    }

    const review = Review.latest(repo.id);
    if (!review) {
      console.error("No reviews found.");
      process.exit(1);
    }

    switch (argv.output) {
      case "json":
        console.log(JSON.stringify(review, null, 2));
        break;
      default:
        table(
          ["id", "commit", "name", "created"],
          [
            [String(review.id)],
            [review.commitSha.slice(0, 7)],
            [review.name ?? ""],
            [new Date(review.createdAt).toISOString()],
          ],
        );
    }
  },
};
