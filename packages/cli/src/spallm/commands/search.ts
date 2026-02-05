import { type CommandDef, displayLlmSearch, Search } from "@spall/cli/shared";

export const search: CommandDef = {
  summary: Search.summary,
  description: Search.description("spallm"),
  positionals: Search.positionals,
  options: Search.options,
  handler: async (argv) => {
    const { query, results } = await Search.run({
      query: argv.query,
      corpus: (argv as any).corpus,
      path: argv.path,
      limit: argv.limit,
      tracked: true,
    });

    displayLlmSearch(results, {
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      score: (r: any) => r.score,
      preview: (r: any) => r.snippet,
      queryId: query.id,
    });
  },
};
