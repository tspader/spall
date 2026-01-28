import { ReviewComment } from "../../../store";
import type { CommandDef } from "../../yargs";

export const comments: CommandDef = {
  description: "List comments for a review",
  positionals: {
    review: {
      type: "number",
      description: "Review ID",
      required: true,
    },
  },
  handler: (argv) => {
    const comments = ReviewComment.list(argv.review);
    if (comments.length === 0) {
      console.log("No comments found.");
      return;
    }
    for (const c of comments) {
      console.log(`#${c.id} -> note:${c.noteId}`);
    }
  },
};
