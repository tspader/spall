import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";
import { table } from "./layout";
import { defaultTheme as theme } from "./theme";

export namespace Status {
  export const summary = "List available corpora and workspace status";
  export const description = `List available corpora, and which will be included by default in searches (i.e. included in workspace)`;

  export type Corpus = {
    id: number | string;
    name: string;
    noteCount: number;
    createdAt: number;
    updatedAt: number;
  };

  export type SuccessResult = {
    corpora: Corpus[];
    included: Set<string>;
  };

  export type RunResult = SuccessResult | { error: unknown };

  export type PrintOptions = {
    highlightWorkspace?: boolean;
  };

  export const formatTime = (ts: number) =>
    new Date(ts).toISOString().slice(0, 19).replace("T", " ");

  export async function run(): Promise<RunResult> {
    const client = await Client.connect();
    const result = await client.corpus.list();

    if (result.error || !result.data) {
      return { error: result.error };
    }

    const corpora = result.data as Corpus[];
    const config = WorkspaceConfig.load(process.cwd());
    const included = new Set(config.scope.read);

    return { corpora, included };
  }

  export function print(result: SuccessResult, opts?: PrintOptions): void {
    const { corpora, included } = result;

    if (corpora.length === 0) {
      console.log("No corpora found.");
      return;
    }

    table(
      ["name", "id", "notes", "workspace", "created", "updated"],
      [
        corpora.map((p) => p.name),
        corpora.map((p) => String(p.id)),
        corpora.map((p) => String(p.noteCount)),
        corpora.map((p) => (included.has(p.name) ? "yes" : "no")),
        corpora.map((p) => Status.formatTime(p.createdAt)),
        corpora.map((p) => Status.formatTime(p.updatedAt)),
      ],
      opts?.highlightWorkspace
        ? {
            format: [
              (s: string) => s,
              (s: string) => s,
              (s: string) => s,
              (s: string) => {
                const trimmed = s.trimEnd();
                const pad = s.slice(trimmed.length);
                return trimmed === "yes"
                  ? theme.primary("yes") + pad
                  : "no" + pad;
              },
              (s: string) => s,
              (s: string) => s,
            ],
          }
        : undefined,
    );
  }
}
