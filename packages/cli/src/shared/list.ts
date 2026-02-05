import { Client } from "@spall/sdk/client";
import { createEphemeralQuery } from "./workspace";
import type { Options, Positionals } from "./yargs";
import consola from "consola";

export namespace List {
  export const positionals: Positionals = {
    path: {
      type: "string",
      description: "Path or glob to filter notes",
      default: "*",
    },
  };

  export const options: Options = {
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name",
    },
    all: {
      type: "boolean",
      description: "List all files (default: directories only)",
      default: false,
    },
  };

  export function normalizePath(
    rawInput: unknown,
    completion: boolean,
  ): string {
    let path = String(rawInput ?? "*");

    // normalize path: if doesn't end with glob char, treat as prefix
    if (!/[*?\]]$/.test(path)) {
      if (completion && !path.endsWith("/")) {
        // For completion, "ai-gateway/conf" should glob "ai-gateway/conf*"
        path = path + "*";
      } else {
        path = path.replace(/\/?$/, "/*");
      }
    }

    return path;
  }

  export async function run(argv: {
    path?: string;
    corpus?: string;
    tracked: boolean;
    completion?: boolean;
  }) {
    const client = await Client.connect();

    const { query, located, includeNames } = await createEphemeralQuery({
      client,
      corpus: argv.corpus,
      tracked: argv.tracked,
    });

    const path = normalizePath(argv.path, Boolean(argv.completion));

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

    return { client, query, notes, path, located, includeNames };
  }
}
