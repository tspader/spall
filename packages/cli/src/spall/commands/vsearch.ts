import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  displayResults,
} from "@spall/cli/shared";

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

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
  // nonlinearly spread 0.5-0.8 range, concentrate high values
  const shifted = (score - 0.5) / 0.35;
  const t = Math.max(0, Math.min(1, shifted));
  const sat = t * t;

  // Fixed hue (140 = green), vary saturation, fixed value
  const [r, g, b] = hsvToRgb(140, sat, 0.85);
  return rgb(r, g, b);
}

export const vsearch: CommandDef = {
  description: "Semantic search (vector)",
  positionals: {
    q: {
      type: "string",
      description: "Search query",
      required: true,
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
    },
    path: {
      type: "string",
      description: "Path glob filter (default: *)",
    },
    limit: {
      alias: "n",
      type: "number",
      description: "Maximum number of results (default: 20)",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: table | json | tree | list",
      default: "table",
    },
  },
  handler: async (argv) => {
    const out = String(argv.output ?? "table");

    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      project: argv.project,
      tracked: false,
    });

    const res = await client.query
      .vsearch({
        id: String(query.id),
        q: argv.q,
        path: argv.path,
        limit: argv.limit,
      })
      .then(Client.unwrap);

    const scoreMap = new Map(
      res.results.map((r: any, i: number) => [i, r.score as number]),
    );

    displayResults(res.results, {
      output: out,
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      preview: (r: any) => collapseWhitespace(r.chunk),
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
