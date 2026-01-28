import { Review } from "../../../store";
import type { CommandDef } from "../../yargs";

export const latest: CommandDef = {
  description: "Get the latest review for a repo",
  positionals: {
    repo: {
      type: "number",
      description: "Repo ID",
      required: true,
    },
  },
  handler: (argv) => {
    const review = Review.latest(argv.repo);
    if (!review) {
      console.error(`No reviews found for repo #${argv.repo}.`);
      process.exit(1);
    }
    console.log(JSON.stringify(review, null, 2));
  },
};
