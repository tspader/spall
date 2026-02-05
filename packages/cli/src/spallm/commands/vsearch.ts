import { type CommandDef, displayLlmSearch, Vsearch } from "@spall/cli/shared";

export const vsearch: CommandDef = {
  summary: Vsearch.summary,
  description: Vsearch.description("spallm"),
  positionals: Vsearch.positionals,
  options: Vsearch.options,
  handler: async (argv) => {
    const { query, results } = await Vsearch.run({
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
      preview: (r: any) => r.chunk,
      queryId: query.id,
    });
  },
};
