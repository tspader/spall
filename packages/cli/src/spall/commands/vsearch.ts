import { type CommandDef, displayResults, Vsearch } from "@spall/cli/shared";

function rgb(r: number, g: number, b: number): (s: string) => string {
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function heatColor(score: number): (s: string) => string {
  const shifted = (score - 0.5) / 0.35;
  const t = Math.max(0, Math.min(1, shifted));
  const sat = t * t;
  const [r, g, b] = hsvToRgb(140, sat, 0.85);
  return rgb(r, g, b);
}

export const vsearch: CommandDef = {
  summary: Vsearch.summary,
  description: Vsearch.description("spall"),
  positionals: Vsearch.positionals,
  options: {
    ...Vsearch.options,
    output: {
      alias: "o",
      type: "string",
      description: "Output format: table | json | tree | list",
      default: "table",
    },
  },
  handler: async (argv) => {
    const out = String(argv.output ?? "table");

    const { results } = await Vsearch.run({
      query: argv.query,
      corpus: (argv as any).corpus,
      path: argv.path,
      limit: argv.limit,
      tracked: false,
    });

    const scoreMap = new Map(
      results.map((r: any, i: number) => [i, r.score as number]),
    );

    displayResults(results, {
      output: out,
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      preview: (r: any) => Vsearch.collapseWhitespace(r.chunk),
      extraColumns: [
        {
          header: "score",
          value: (r: any) => r.score.toFixed(3),
          flex: 0,
          noTruncate: true,
          format: (s, row) => heatColor(scoreMap.get(row) ?? 0)(s),
        },
      ],
    });
  },
};
