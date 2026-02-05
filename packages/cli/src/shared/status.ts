import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";

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

  export type RunResult =
    | {
        corpora: Corpus[];
        included: Set<string>;
      }
    | {
        error: unknown;
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
    const included = new Set(config.include);

    return {
      corpora,
      included,
    };
  }
}
