import consola from "consola";
import { ProjectConfig, type ProjectConfigSchema } from "@spall/core";
import { Client, type SpallClient } from "@spall/sdk/client";

import { defaultTheme as theme } from "./theme";

export type ResolvedProjectScope = {
  config: ProjectConfigSchema;
  located: ProjectConfig.Located | null;
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
  project?: string;
}): Promise<ResolvedProjectScope> {
  const cwd = input.cwd ?? process.cwd();
  const config = ProjectConfig.load(cwd);
  const located = ProjectConfig.locate(cwd);

  const includeNames: string[] = input.project
    ? [input.project]
    : config.include;

  const viewer = await input.client.project
    .create({ name: config.project.name })
    .then(Client.unwrap);

  if (located && config.project.id !== viewer.id) {
    ProjectConfig.patch(located.root, {
      project: { name: config.project.name, id: viewer.id },
    });
  }

  const projects = (await input.client.project.list().then(Client.unwrap)) as {
    id: number;
    name: string;
  }[];
  const byName = new Map(projects.map((p) => [p.name, p.id]));

  const includeIds = includeNames.map((name) => {
    const id = byName.get(name);
    if (id === undefined) {
      fail(`Project not found: ${theme.command(name)}`);
    }
    return id;
  });

  return { config, located, viewer, includeNames, includeIds };
}

export async function createEphemeralQuery(input: {
  client: SpallClient;
  cwd?: string;
  project?: string;
  tracked?: boolean;
}): Promise<ResolvedProjectScope & { query: any }> {
  const scope = await resolveProjectScope(input);
  const query = await input.client.query
    .create({
      viewer: scope.viewer.id,
      tracked: input.tracked,
      projects: scope.includeIds,
    })
    .then(Client.unwrap);
  return { ...scope, query };
}
