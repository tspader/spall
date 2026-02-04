import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  defaultTheme,
  noteTreeEntries,
} from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List note paths as a tree",
  positionals: {
    path: {
      type: "string",
      description: "Path or glob to filter notes",
      default: "*",
    },
  },
  options: {
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name",
    },
    completion: {
      type: "boolean",
      description: "Output bare paths for shell completion",
    },
  },
  handler: async (argv) => {
    const theme = defaultTheme;
    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      corpus: (argv as any).corpus,
      tracked: false,
    });

    // normalize path: if doesn't end with glob char, treat as prefix
    let path = argv.path;
    const isCompletion = (argv as any).completion;
    if (!/[*?\]]$/.test(path)) {
      if (isCompletion && !path.endsWith("/")) {
        // For completion, "ai-gateway/conf" should glob "ai-gateway/conf*"
        path = path + "*";
      } else {
        path = path.replace(/\/?$/, "/*");
      }
    }

    type NoteInfo = { id: number; path: string };
    type Page = { notes: NoteInfo[]; nextCursor: string | null };
    const notes: NoteInfo[] = [];
    let cursor: string | undefined = undefined;

    while (true) {
      const page: Page = await client.query
        .notes({ id: String(query.id), path, limit: 100, after: cursor })
        .then(Client.unwrap);

      for (const n of page.notes) notes.push({ id: n.id, path: n.path });
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    notes.sort((a, b) => a.path.localeCompare(b.path));

    if ((argv as any).completion) {
      printCompletions(
        notes.map((n) => n.path),
        argv.path,
      );
      return;
    }

    if (notes.length === 0) {
      console.log("(no notes matching pattern)");
      return;
    }

    const entries = noteTreeEntries(notes);
    for (const e of entries) {
      const indent = "  ".repeat(e.depth);
      if (e.type === "dir") {
        console.log(`${theme.dim(indent)}${theme.dim(e.name)}`);
      } else {
        console.log(`${theme.dim(indent)}${e.name}${theme.dim(` (id: ${e.id})`)}`);
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
