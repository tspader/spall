import { db, Repo, Review } from "@spall/tui/store";
import { Git } from "@spall/tui/lib/git";
import { table, type CommandDef } from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List reviews for the current repo",
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
      console.log("No reviews found.");
      return;
    }

    const reviews = Review.list(repo.id);
    if (reviews.length === 0) {
      console.log("No reviews found.");
      return;
    }

    switch (argv.output) {
      case "json":
        console.log(JSON.stringify(reviews, null, 2));
        break;
      default:
        table(
          ["id", "commit", "name", "created"],
          [
            reviews.map((r) => String(r.id)),
            reviews.map((r) => r.commitSha.slice(0, 7)),
            reviews.map((r) => r.name ?? ""),
            reviews.map((r) => new Date(r.createdAt).toISOString()),
          ],
        );
    }
  },
};
