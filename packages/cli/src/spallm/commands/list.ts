import type { CommandDef } from "@spall/cli/shared";

export const list: CommandDef = {
  summary: "Browse notes as a directory tree",
  description: `List notes as a directory tree. Shows paths and IDs, no content.

Use a path glob to drill into subtrees. Use \`fetch\` to get full content.

Example:
  spallm list "docs/cloudflare/*"
`,
  positionals: {
    path: {
      type: "string",
      description: "Path glob filter (default: *)",
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name (default: from spall.json)",
    },
    limit: {
      alias: "n",
      type: "number",
      description: "Max notes to list (default: 50)",
    },
  },
  handler: async (_argv) => {
    // TODO: implement
    // 1. Resolve project(s) from --project or spall.json
    // 2. Create ephemeral query
    // 3. Call client.query.notes with path glob
    // 4. Print directory tree:
    //    - Directories as "dir/"
    //    - Files as "filename (id: N)"
    //    - Truncate deep trees, show "... N more"
    // 5. Print footer: "Query ID: <id>"
  },
};
