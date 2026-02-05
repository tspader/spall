import {
  type CommandDef,
  defaultTheme,
  List,
  noteDirEntries,
  noteTreeEntries,
} from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List note paths as a tree",
  positionals: List.positionals,
  options: {
    ...List.options,
    completion: {
      type: "boolean",
      description: "Output bare paths for shell completion",
    },
  },
  handler: async (argv) => {
    const theme = defaultTheme;
    const rawInput = String(argv.path ?? "*");
    const isCompletion = Boolean((argv as any).completion);

    const { notes, located, includeNames } = await List.run({
      path: rawInput,
      corpus: (argv as any).corpus,
      tracked: false,
      completion: isCompletion,
    });

    if (isCompletion) {
      printCompletions(
        notes.map((n) => n.path),
        rawInput,
      );
      return;
    }

    if (notes.length === 0) {
      console.log("(no notes found)");
      if (
        !located &&
        includeNames.length === 1 &&
        includeNames[0] === "default"
      ) {
        console.log(
          `hint: no workspace found, only searched default corpus. run ${theme.code("spall corpus list")} to check workspace scope, or ${theme.code("spall workspace init")} to create a workspace)`,
        );
      }
      return;
    }

    const showAll = Boolean((argv as any).all);
    const entries = showAll ? noteTreeEntries(notes) : noteDirEntries(notes);

    for (const e of entries) {
      const indent = "  ".repeat(e.depth);
      if (e.type === "dir") {
        const suffix =
          typeof e.noteCount === "number"
            ? theme.dim(` (${e.noteCount} note${e.noteCount === 1 ? "" : "s"})`)
            : "";
        console.log(`${indent}${e.name}${suffix}`);
      } else {
        console.log(
          `${theme.dim(indent)}${e.name}${theme.dim(` (id: ${e.id})`)}`,
        );
      }
    }
  },
};

/**
 * Print immediate children of the given prefix as bare paths for shell
 * completion. Directories get a trailing `/` so bash knows not to append
 * a space (allows continued tabbing).
 */
function printCompletions(paths: string[], rawInput: string): void {
  // Determine the prefix directory we're completing under.
  // rawInput is what the user typed, e.g. "ai-gateway/" or "ai-gateway/feat"
  // We want the directory part: everything up to and including the last `/`.
  const lastSlash = rawInput.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? rawInput.slice(0, lastSlash + 1) : "";

  const seen = new Set<string>();

  for (const p of paths) {
    // Only consider paths under our prefix
    if (prefix && !p.startsWith(prefix)) continue;

    const rest = p.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      // It's a directory -- emit just the first segment with trailing /
      const dir = prefix + rest.slice(0, slash + 1);
      if (!seen.has(dir)) {
        seen.add(dir);
        console.log(dir);
      }
    } else {
      // It's a file at this level
      if (!seen.has(p)) {
        seen.add(p);
        console.log(p);
      }
    }
  }
}
