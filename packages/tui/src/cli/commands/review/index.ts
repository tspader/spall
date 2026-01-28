import type { CommandDef } from "../../yargs";
import { list } from "./list";
import { create } from "./create";
import { get } from "./get";
import { latest } from "./latest";
import { comments } from "./comments";

export const review: CommandDef = {
  description: "Manage reviews",
  commands: { list, create, get, latest, comments },
};
