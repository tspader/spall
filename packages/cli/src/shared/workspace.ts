import consola from "consola";
import { WorkspaceConfig, type WorkspaceConfigSchema } from "@spall/core";
import { Client, type SpallClient } from "@spall/sdk/client";

import { defaultTheme as theme } from "./theme";

export type ResolvedScope = {
  config: WorkspaceConfigSchema;
  located: WorkspaceConfig.Located | null;
  viewer: { id: number; name: string };
  names: string[];
  ids: number[];
};

function fail(message: string): never {
  consola.error(message);
  process.exit(1);
}

export async function gitRoot(start: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      cwd: start,
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
    });
    const exit = await proc.exited;
    if (exit !== 0) return null;
    const out = (await new Response(proc.stdout).text()).trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function resolveScope(input: {
  client: SpallClient;
  cwd?: string;
  corpus?: string;
  tracked?: boolean;
}): Promise<ResolvedScope> {
  const cwd = input.cwd ?? process.cwd();
  const config = WorkspaceConfig.load(cwd);
  const located = WorkspaceConfig.locate(cwd);

  const names: string[] = input.corpus
    ? [input.corpus]
    : config.scope.read;

  const tracked = input.tracked ?? false;

  let viewer: { id: number; name: string } = { id: 1, name: "default" };
  if (tracked && located) {
    const ensured = await input.client.workspace
      .create({ name: config.workspace.name })
      .then(Client.unwrap);
    viewer = { id: ensured.id, name: ensured.name };

    if (config.workspace.id !== viewer.id) {
      WorkspaceConfig.patch(located.root, {
        workspace: { name: config.workspace.name, id: viewer.id },
      });
    }
  }

  const corpora = (await input.client.corpus.list().then(Client.unwrap)) as {
    id: number;
    name: string;
  }[];
  const byName = new Map(corpora.map((c) => [c.name, c.id]));

  const ids = names.map((name) => {
    const id = byName.get(name);
    if (id === undefined) {
      fail(`Corpus not found: ${theme.command(name)}`);
    }
    return id;
  });

  return { config, located, viewer, names, ids };
}

export async function createQuery(input: {
  client: SpallClient;
  cwd?: string;
  corpus?: string;
  tracked?: boolean;
}): Promise<ResolvedScope & { query: any }> {
  const scope = await resolveScope({
    client: input.client,
    cwd: input.cwd,
    corpus: input.corpus,
    tracked: input.tracked,
  });

  const tracked = Boolean(input.tracked && scope.located);
  const query = await input.client.query
    .create({
      viewer: scope.viewer.id,
      tracked,
      corpora: scope.ids,
    })
    .then(Client.unwrap);
  return { ...scope, query };
}
