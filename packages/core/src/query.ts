import z from "zod";
import { api, asyncApi } from "./api";
import { Store } from "./store";
import { Sql } from "./sql";
import { Project } from "./project";
import { Note } from "./note";
import { Error } from "./error";
import { Model } from "./model";

export namespace Query {
  export const Id = z.coerce.number().brand<"QueryId">();
  export type Id = z.infer<typeof Id>;

  export const Info = z.object({
    id: Id,
    projects: z.array(Project.Id),
    createdAt: z.number(),
  });
  export type Info = z.infer<typeof Info>;

  export const SearchItem = z.object({
    id: Note.Id,
    project: Project.Id,
    path: z.string(),
    snippet: z.string(),
    score: z.number(),
  });
  export type SearchItem = z.infer<typeof SearchItem>;

  export const SearchResults = z.object({
    results: SearchItem.array(),
  });
  export type SearchResults = z.infer<typeof SearchResults>;

  export const VSearchItem = z.object({
    id: Note.Id,
    project: Project.Id,
    path: z.string(),
    chunk: z.string(),
    chunkPos: z.number(),
    score: z.number(),
  });
  export type VSearchItem = z.infer<typeof VSearchItem>;

  export const VSearchResults = z.object({
    results: VSearchItem.array(),
  });
  export type VSearchResults = z.infer<typeof VSearchResults>;

  type Row = {
    id: number;
    projects: string;
    created_at: number;
  };

  function parse(row: Row): Info {
    return {
      id: Id.parse(row.id),
      projects: JSON.parse(row.projects).map((id: number) =>
        Project.Id.parse(id),
      ),
      createdAt: row.created_at,
    };
  }

  function ftsQuery(q: string): string {
    const parts = q
      .trim()
      .split(/\s+/)
      .flatMap((s) => s.split(/[^A-Za-z0-9_]+/))
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return "";
    return parts.map((s) => `"${s.replace(/"/g, '""')}"`).join(" AND ");
  }

  type Mode = "plain" | "fts";

  export class NotFoundError extends Error.SpallError {
    constructor(id: number) {
      super("query.not_found", `Query not found: ${id}`);
      this.name = "NotFoundError";
    }
  }

  export const create = api(
    z.object({
      projects: z.array(Project.Id),
    }),
    (input): Info => {
      const db = Store.ensure();

      const row = db
        .prepare(Sql.INSERT_QUERY)
        .get(JSON.stringify(input.projects), Date.now()) as Row;

      return parse(row);
    },
  );

  export const get = api(
    z.object({
      id: Id,
    }),
    (input): Info => {
      const db = Store.ensure();

      const row = db.prepare(Sql.GET_QUERY).get(input.id) as Row | null;
      if (!row) throw new NotFoundError(input.id);

      return parse(row);
    },
  );

  export const notes = api(
    z.object({
      id: Id,
      path: z.string().optional(),
      limit: z.coerce.number().optional(),
      after: z.string().optional(),
    }),
    (input): Note.Page => {
      const db = Store.ensure();

      const query = get({ id: input.id });
      const projects = JSON.stringify(query.projects);
      const path = input.path ?? "*";
      const limit = input.limit ?? 100;
      const after = input.after ?? "";

      const rows = db
        .prepare(Sql.LIST_QUERY_NOTES_PAGINATED)
        .all(projects, path, after, limit) as unknown[];

      const notes = rows.map((r) => Note.Row.parse(r));
      const nextCursor =
        notes.length === limit ? notes[notes.length - 1]!.path : null;

      return { notes, nextCursor };
    },
  );

  const SearchRow = z
    .object({
      id: z.number(),
      project_id: z.number(),
      path: z.string(),
      snippet: z.string(),
      score: z.number(),
    })
    .transform(
      (r): SearchItem => ({
        id: Note.Id.parse(r.id),
        project: Project.Id.parse(r.project_id),
        path: r.path,
        snippet: r.snippet,
        score: r.score,
      }),
    );

  export const search = api(
    z.object({
      id: Id,
      q: z.string(),
      path: z.string().optional(),
      limit: z.coerce.number().optional(),
      mode: z.enum(["plain", "fts"]).optional(),
    }),
    (input): SearchResults => {
      const db = Store.ensure();

      const scope = get({ id: input.id });
      const projects = JSON.stringify(scope.projects);

      const mode: Mode = input.mode ?? "plain";
      const match = mode === "fts" ? input.q.trim() : ftsQuery(input.q);
      if (!match) return { results: [] };

      const path = input.path ?? "*";
      const limit = input.limit ?? 20;

      const rows = db
        .prepare(Sql.SEARCH_QUERY_FTS)
        .all(match, projects, path, limit) as unknown[];

      return { results: rows.map((r) => SearchRow.parse(r)) };
    },
  );

  const CHUNK_SIZE = 512 * 4;

  function extractChunk(content: string, pos: number): string {
    const end = Math.min(pos + CHUNK_SIZE, content.length);
    return content.slice(pos, end);
  }

  type VSearchRow = {
    embedding_id: string;
    note_id: number;
    project_id: number;
    path: string;
    content: string;
    chunk_pos: number;
    distance: number;
  };

  export const vsearch = asyncApi(
    z.object({
      id: Id,
      q: z.string(),
      path: z.string().optional(),
      limit: z.coerce.number().optional(),
    }),
    async (input): Promise<VSearchResults> => {
      const db = Store.ensure();

      const scope = get({ id: input.id });
      const projectSet = new Set(scope.projects.map(Number));

      const pathGlob = input.path ?? "*";
      const limit = input.limit ?? 20;
      const overselect = limit * 3;

      await Model.load();
      const queryVector = await Model.embed(input.q);

      const rows = db
        .prepare(Sql.SEARCH_VECTORS_ENRICHED)
        .all(new Float32Array(queryVector), overselect) as VSearchRow[];

      const results: VSearchItem[] = [];
      for (const row of rows) {
        if (!projectSet.has(row.project_id)) continue;
        if (pathGlob !== "*" && !matchGlob(pathGlob, row.path)) continue;

        results.push({
          id: Note.Id.parse(row.note_id),
          project: Project.Id.parse(row.project_id),
          path: row.path,
          chunk: extractChunk(row.content, row.chunk_pos),
          chunkPos: row.chunk_pos,
          score: 1 - row.distance,
        });

        if (results.length >= limit) break;
      }

      return { results };
    },
  );

  function matchGlob(pattern: string, path: string): boolean {
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") +
        "$",
    );
    return regex.test(path);
  }
}
