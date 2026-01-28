import { Review } from "../../../store";
import type { CommandDef } from "../../yargs";

export const create: CommandDef = {
  description: "Create a new review",
  positionals: {
    repo: {
      type: "number",
      description: "Repo ID",
      required: true,
    },
    commit: {
      type: "string",
      description: "Commit SHA",
      required: true,
    },
  },
  options: {
    name: {
      alias: "n",
      type: "string",
      description: "Optional name for the review",
    },
  },
  handler: (argv) => {
    const review = Review.create({
      repo: argv.repo,
      commitSha: argv.commit,
      name: argv.name,
    });
    console.log(`Created review #${review.id}`);
  },
};
