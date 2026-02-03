import consola from "consola";
import { WorkspaceConfig, type WorkspaceConfigSchema } from "@spall/core";
import { Client, type SpallClient } from "@spall/sdk/client";

import { defaultTheme as theme } from "./theme";

export type ResolvedProjectScope = {
  config: WorkspaceConfigSchema;
  located: WorkspaceConfig.Located | null;
  viewer: { id: number; name: string };
  includeNames: string[];
  includeIds: number[];
};

function fail(message: string): never {
  consola.error(message);
  process.exit(1);
}

export async function resolveProjectScope(input: {
  client: SpallClient;
  cwd?: string;
  corpus?: string;
}): Promise<ResolvedProjectScope> {
  const cwd = input.cwd ?? process.cwd();
  const config = WorkspaceConfig.load(cwd);
  const located = WorkspaceConfig.locate(cwd);

  const includeNames: string[] = input.corpus ? [input.corpus] : config.include;

  const viewer = await input.client.workspace
    .create({ name: config.workspace.name })
    .then(Client.unwrap);

  if (located && config.workspace.id !== viewer.id) {
    WorkspaceConfig.patch(located.root, {
      workspace: { name: config.workspace.name, id: viewer.id },
    });
  }

  const corpora = (await input.client.corpus.list().then(Client.unwrap)) as {
    id: number;
    name: string;
  }[];
  const byName = new Map(corpora.map((c) => [c.name, c.id]));

  const includeIds = includeNames.map((name) => {
    const id = byName.get(name);
    if (id === undefined) {
      fail(`Corpus not found: ${theme.command(name)}`);
    }
    return id;
  });

  return { config, located, viewer, includeNames, includeIds };
}

export async function createEphemeralQuery(input: {
  client: SpallClient;
  cwd?: string;
  corpus?: string;
  tracked?: boolean;
}): Promise<ResolvedProjectScope & { query: any }> {
  const scope = await resolveProjectScope(input);
  const query = await input.client.query
    .create({
      viewer: scope.viewer.id,
      tracked: input.tracked,
      corpora: scope.includeIds,
    })
    .then(Client.unwrap);
  return { ...scope, query };
}
