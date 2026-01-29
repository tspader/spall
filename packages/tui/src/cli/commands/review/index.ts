import type { CommandDef } from "../../yargs";
import { list } from "./list";
import { create } from "./create";
import { latest } from "./latest";
import { comments } from "./comments";
import { patches } from "./patches";

export const review: CommandDef = {
  description: "Manage reviews",
  commands: { list, create, latest, comments, patches },
};
