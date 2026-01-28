import { Review } from "../../../store";
import type { CommandDef } from "../../yargs";

export const get: CommandDef = {
  description: "Get a review by ID",
  positionals: {
    id: { type: "number", description: "Review ID", required: true },
  },
  handler: (argv) => {
    const review = Review.get(argv.id);
    if (!review) {
      console.error(`Review #${argv.id} not found.`);
      process.exit(1);
    }
    console.log(JSON.stringify(review, null, 2));
  },
};
