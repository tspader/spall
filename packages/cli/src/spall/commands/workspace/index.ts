import type { CommandDef } from "@spall/cli/shared";
import { init } from "./init";
import { add } from "./add";
import { remove } from "./remove";
import { edit } from "./edit";
import { defaultTheme as theme } from "@spall/cli/shared";

export const workspace: CommandDef = {
  summary: "Manage the current workspace",
  description:
  `A workspace allows you to define which corpora are included in ${theme.guide("searches")}, per directory. Separately, it provides a context for spall to automatically learn note weights based on access patterns.

It's very useful to ingest documentation with spall, but you don't want TypeScript documentation polluting ${theme.guide("search")} results for a C project. Workspaces solve this by allowing you to restrict which corpora are included in ${theme.guide("searches")} within a directory.`,
  commands: { init, add, remove, edit },
};
