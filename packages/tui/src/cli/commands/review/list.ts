import { Review } from "../../../store";
import type { CommandDef } from "../../yargs";

export const list: CommandDef = {
  description: "List reviews for a repo",
  positionals: {
    repo: {
      type: "number",
      description: "Repo ID",
      required: true,
    },
  },
  handler: (argv) => {
    const reviews = Review.list(argv.repo);
    if (reviews.length === 0) {
      console.log("No reviews found.");
      return;
    }
    for (const r of reviews) {
      const date = new Date(r.createdAt).toISOString();
      const name = r.name ? ` (${r.name})` : "";
      console.log(`#${r.id} ${r.commitSha.slice(0, 7)}${name} - ${date}`);
    }
  },
};
