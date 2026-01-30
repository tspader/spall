import { db, Repo, Review, Patch } from "@spall/tui/store";
import { Git } from "@spall/tui/lib/git";
import { table, type CommandDef } from "@spall/cli/shared";

export const patches: CommandDef = {
  description: "View patches for a review",
  positionals: {
    seq: {
      type: "number",
      description: "Patch sequence number to display",
    },
  },
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
        console.log("No patches found.");
        return;
      }

      const review = Review.getByRepoAndCommit(repo.id, commitSha);
      if (!review) {
        console.log("No patches found.");
        return;
      }

      reviewId = review.id;
    }

    // If a seq number is given, show that specific patch's diff
    if (argv.seq != null) {
      const allPatches = Patch.list(reviewId);
      const patch = allPatches.find((p) => p.seq === argv.seq);
      if (!patch) {
        console.error(`Patch #${argv.seq} not found.`);
        process.exit(1);
      }

      if (argv.output === "json") {
        console.log(JSON.stringify(patch, null, 2));
      } else {
        console.log(patch.content);
      }
      return;
    }

    // Otherwise, list all patches
    const allPatches = Patch.list(reviewId);
    if (allPatches.length === 0) {
      console.log("No patches found.");
      return;
    }

    switch (argv.output) {
      case "json":
        console.log(JSON.stringify(allPatches, null, 2));
        break;
      default:
        table(
          ["seq", "hash", "lines", "created"],
          [
            allPatches.map((p) => String(p.seq)),
            allPatches.map((p) => p.hash.slice(0, 12)),
            allPatches.map((p) => String(Git.lines(p.content))),
            allPatches.map((p) => new Date(p.createdAt).toISOString()),
          ],
        );
    }
  },
};
