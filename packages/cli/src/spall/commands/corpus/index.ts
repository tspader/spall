import type { CommandDef } from "@spall/cli/shared";
import { create } from "./create";
import { remove } from "./delete";

export const corpus: CommandDef = {
  description: "Manage corpora",
  commands: { create, delete: remove },
};
