import * as prompts from "@clack/prompts";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";
import {
  type CommandDef,
  defaultTheme as theme,
  createModelProgressHandler,
  formatStreamError,
} from "@spall/cli/shared";

function splitPath(input: string): { dir: string; name: string } {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized.length === 0) return { dir: "", name: "" };

  const i = normalized.lastIndexOf("/");
  if (i < 0) return { dir: "", name: normalized };

  return {
    dir: normalized.slice(0, i),
    name: normalized.slice(i + 1),
  };
}

function joinPath(dir: string, name: string): string {
  const d = dir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const n = name.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return d.length > 0 ? `${d}/${n}` : n;
}

function collectDirectories(paths: string[]): string[] {
  const dirs = new Set<string>();
  dirs.add("");

  for (const path of paths) {
    const parts = path.split("/");
    if (parts.length <= 1) continue;

    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      prefix = prefix ? `${prefix}/${part}` : part;
      dirs.add(prefix);
    }
  }

  return Array.from(dirs).sort((a, b) => a.localeCompare(b));
}

const NEW_DIRECTORY = "__new_directory__";

function keepServerAlive(client: any, signal: AbortSignal): void {
  (async () => {
    try {
      const { stream } = await client.events({ signal });
      for await (const _event of stream) {
        // keep-alive only
      }
    } catch {
      // ignore
    }
  })();
}

type SubmitInput = {
  client: Awaited<ReturnType<typeof Client.connect>>;
  corpusName: string;
  path: string;
  content: string;
  update?: boolean;
};

export async function submitNote(input: SubmitInput): Promise<{
  action: "added" | "updated";
  info: { path: string; id: number; corpus: number };
}> {
  const corpus = await input.client.corpus
    .get({ name: input.corpusName })
    .catch(() => {
      consola.error(
        `Failed to find corpus: ${theme.primary(String(input.corpusName))}`,
      );
      process.exit(1);
    })
    .then(Client.unwrap);

  const handleProgress = createModelProgressHandler();

  const handleStreamError = (event: any) => {
    if (event?.tag !== "error") return false;
    const formatted = formatStreamError(event.error, input.path);
    const raw = (() => {
      try {
        return JSON.stringify(event.error);
      } catch {
        return String(event.error);
      }
    })();
    consola.error(formatted);
    consola.error(`Raw SSE error payload: ${raw}`);
    process.exit(1);
  };

  if (input.update) {
    const existing = await input.client.note
      .get({ id: corpus.id.toString(), path: input.path })
      .then(Client.unwrap)
      .catch(() => null);

    if (!existing) {
      consola.error(`Note not found: ${theme.primary(input.path)}`);
      process.exit(1);
    }

    const { stream } = await input.client.sse.note.update({
      id: existing.id.toString(),
      content: input.content,
      dupe: true,
    });

    for await (const event of stream as AsyncGenerator<any>) {
      handleProgress(event);
      handleStreamError(event);
      if (event.tag === "note.updated") {
        return { action: "updated", info: event.info };
      }
    }

    throw new Error("Note stream ended without result");
  }

  const { stream } = await input.client.sse.note.add({
    path: input.path,
    content: input.content,
    corpus: corpus.id,
    dupe: true,
  });

  for await (const event of stream as AsyncGenerator<any>) {
    handleProgress(event);
    handleStreamError(event);
    if (event.tag === "note.created") {
      return { action: "added", info: event.info };
    }
  }

  throw new Error("Note stream ended without result");
}

export const add: CommandDef = {
  description: "Add a note to a corpus",
  positionals: {
    path: {
      type: "string",
      description: "Path/name for the note",
      required: false,
    },
  },
  options: {
    text: {
      alias: "t",
      type: "string",
      description: "Note content",
    },
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name",
    },
    update: {
      alias: "u",
      type: "boolean",
      description: "Update if note exists (upsert)",
    },
  },
  handler: async (argv) => {
    const hasPathArg = typeof argv.path === "string" && argv.path.length > 0;
    const hasTextArg = typeof argv.text === "string";
    const interactive = !hasPathArg || !hasTextArg;

    const defaultCorpusName = WorkspaceConfig.load(process.cwd()).scope.write;

    let corpusName: string =
      typeof (argv as any).corpus === "string"
        ? String((argv as any).corpus)
        : defaultCorpusName;
    let path = hasPathArg ? String(argv.path) : "";
    let content = hasTextArg ? String(argv.text) : "";

    const client = await Client.connect();
    const keepAlive = interactive ? new AbortController() : null;
    if (keepAlive) {
      keepServerAlive(client, keepAlive.signal);
    }

    try {
      if (interactive) {
        prompts.intro("spall add");

        if (typeof (argv as any).corpus !== "string") {
          const corpora = await client.corpus.list().then(Client.unwrap);
          const corpusOptions = (corpora as any[])
            .map((c) => {
              const name = String(c.name);
              const noteCount =
                typeof c.noteCount === "number" ? c.noteCount : undefined;
              return {
                label: name,
                value: name,
                hint:
                  noteCount === undefined
                    ? undefined
                    : `${noteCount} ${noteCount === 1 ? "note" : "notes"}`,
              };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

          const pickedCorpus = await prompts.autocomplete<string>({
            message: "Select corpus",
            options: corpusOptions,
            placeholder: "Type to filter...",
            maxItems: 12,
            initialValue: corpusName,
          });
          if (prompts.isCancel(pickedCorpus)) {
            prompts.outro("Cancelled");
            return;
          }
          corpusName = String(pickedCorpus);
        }

        const corpusForPath = await client.corpus
          .get({ name: corpusName })
          .catch(() => {
            consola.error(
              `Failed to find corpus: ${theme.primary(corpusName)}`,
            );
            process.exit(1);
          })
          .then(Client.unwrap);

        const existing = await client.note
          .list({ id: String(corpusForPath.id) })
          .then(Client.unwrap)
          .catch(() => []);

        const existingPaths = (existing as any[])
          .map((item) => String(item.path))
          .sort((a, b) => a.localeCompare(b));

        const initial = hasPathArg ? splitPath(path) : { dir: "", name: "" };
        const directories = collectDirectories(existingPaths);
        const dirOptions = [
          {
            label: "(new directory)",
            value: NEW_DIRECTORY,
            hint: "type custom path",
          },
          ...directories.map((dir) => ({
            label: dir.length === 0 ? "(root)" : dir,
            value: dir,
          })),
        ];

        const pickedDir = await prompts.autocomplete<string>({
          message: "Select directory",
          options: dirOptions,
          placeholder: "Type to filter...",
          maxItems: 16,
          initialValue: directories.includes(initial.dir)
            ? initial.dir
            : NEW_DIRECTORY,
        });
        if (prompts.isCancel(pickedDir)) {
          prompts.outro("Cancelled");
          return;
        }

        let dir = String(pickedDir);
        if (dir === NEW_DIRECTORY) {
          const enteredDir = await prompts.text({
            message: "Directory",
            placeholder: "(root)",
            initialValue: initial.dir,
            validate: (s) => {
              const value = String(s ?? "");
              if (value.startsWith("/") || value.endsWith("/")) {
                return "Do not start or end with '/'";
              }
              if (value.includes("\\")) return "Use '/' as path separator";
              return undefined;
            },
          });
          if (prompts.isCancel(enteredDir)) {
            prompts.outro("Cancelled");
            return;
          }
          dir = String(enteredDir);
        }

        const docName = await prompts.text({
          message: "Document name",
          placeholder: "e.g. overview.md",
          initialValue: initial.name,
          validate: (s) => {
            const name = String(s ?? "");
            if (name.length === 0) return "Document name is required";
            if (name.includes("/") || name.includes("\\")) {
              return "Use directory picker for folders";
            }
            return undefined;
          },
        });
        if (prompts.isCancel(docName)) {
          prompts.outro("Cancelled");
          return;
        }

        path = joinPath(dir, String(docName));

        if (!hasTextArg) {
          const entered = await prompts.text({
            message: "Note content",
            placeholder: "Write note content",
            validate: (s) =>
              (s ?? "").length > 0 ? undefined : "Content is required",
          });
          if (prompts.isCancel(entered)) {
            prompts.outro("Cancelled");
            return;
          }

          content = String(entered);
        }

        const action = argv.update ? "Update" : "Add";
        const confirmed = await prompts.confirm({
          message: `${action} ${theme.primary(path)} in corpus ${theme.primary(corpusName)}?`,
          initialValue: true,
        });

        if (prompts.isCancel(confirmed) || !confirmed) {
          prompts.outro("Cancelled");
          return;
        }
      }

      if (path.length === 0) {
        consola.error("Path is required");
        process.exit(1);
      }

      if (content.length === 0) {
        consola.error(`Note content cannot be empty: ${theme.primary(path)}`);
        process.exit(1);
      }

      let result: Awaited<ReturnType<typeof submitNote>>;
      try {
        result = await submitNote({
          client,
          corpusName,
          path,
          content,
          update: argv.update,
        });
      } catch (error: any) {
        const msg = error?.message ?? String(error);
        const stack = error?.stack ? `\n${String(error.stack)}` : "";
        consola.error(`add submit failed: ${msg}${stack}`);
        throw error;
      }

      if (result.action === "updated") {
        consola.success(
          `Updated note ${theme.primary(result.info.path)} (id: ${result.info.id}, corpus: ${result.info.corpus})`,
        );
      } else {
        consola.success(
          `Added note ${theme.primary(result.info.path)} (id: ${result.info.id}, corpus: ${result.info.corpus})`,
        );
      }

      if (interactive) {
        prompts.outro("Done");
      }
    } finally {
      keepAlive?.abort();
    }
  },
};
