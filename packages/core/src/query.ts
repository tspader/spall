import z from "zod";
import { api, asyncApi } from "./api";
import { Store } from "./store";
import { Sql } from "./sql";
import { Workspace } from "./workspace";
import { Corpus } from "./corpus";
import { Note } from "./note";
import { Error } from "./error";
import { Model } from "./model";

export namespace Query {
  export const Id = z.coerce.number().brand<"QueryId">();
  export type Id = z.infer<typeof Id>;

  export const Info = z.object({
    id: Id,
    viewer: Workspace.Id,
    tracked: z.boolean(),
    corpora: z.array(Corpus.Id),
    createdAt: z.number(),
  });
  export type Info = z.infer<typeof Info>;

  export const SearchItem = z.object({
    id: Note.Id,
    corpus: Corpus.Id,
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
    corpus: Corpus.Id,
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
    viewer: number;
    tracked: number;
    corpora: string;
    created_at: number;
  };

  function parse(row: Row): Info {
    return {
      id: Id.parse(row.id),
      viewer: Workspace.Id.parse(row.viewer),
      tracked: Boolean(row.tracked),
      corpora: JSON.parse(row.corpora).map((id: number) => Corpus.Id.parse(id)),
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
      viewer: Workspace.Id,
      tracked: z.boolean().optional(),
      corpora: z.array(Corpus.Id),
    }),
    (input): Info => {
      const db = Store.ensure();

      // validate viewer workspace exists
      Workspace.get({ id: input.viewer });

      // validate corpora exist
      for (const id of input.corpora) {
        Corpus.get({ id });
      }

      const tracked = input.tracked ?? false;

      const row = db
        .prepare(Sql.INSERT_QUERY)
        .get(
          input.viewer,
          tracked ? 1 : 0,
          JSON.stringify(input.corpora),
          Date.now(),
        ) as Row;

      return parse(row);
    },
  );

  export const RecentResults = z.object({
    queries: Info.array(),
  });
  export type RecentResults = z.infer<typeof RecentResults>;

  export const recent = api(
    z.object({
      limit: z.coerce.number().int().positive().optional(),
    }),
    (input): RecentResults => {
      const db = Store.ensure();
      const limit = input.limit ?? 10;
      const rows = db.prepare(Sql.LIST_RECENT_QUERIES).all(limit) as Row[];
      return { queries: rows.map(parse) };
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
      const corpora = JSON.stringify(query.corpora);
      const path = input.path ?? "*";
      const limit = input.limit ?? 100;
      const after = input.after ?? "";

      const rows = db
        .prepare(Sql.LIST_QUERY_NOTES_PAGINATED)
        .all(corpora, path, after, limit) as unknown[];

      const notes = rows.map((r) => Note.Row.parse(r));
      const nextCursor =
        notes.length === limit ? notes[notes.length - 1]!.path : null;

      return { notes, nextCursor };
    },
  );

  const SearchRow = z
    .object({
      id: z.number(),
      corpus_id: z.number(),
      path: z.string(),
      snippet: z.string(),
      score: z.number(),
    })
    .transform(
      (r): SearchItem => ({
        id: Note.Id.parse(r.id),
        corpus: Corpus.Id.parse(r.corpus_id),
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
      const corpora = JSON.stringify(scope.corpora);

      const mode: Mode = input.mode ?? "plain";
      const match = mode === "fts" ? input.q.trim() : ftsQuery(input.q);
      if (!match) return { results: [] };

      const path = input.path ?? "*";
      const limit = input.limit ?? 20;

      const rows = db
        .prepare(Sql.SEARCH_QUERY_FTS)
        .all(match, corpora, path, limit) as unknown[];

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
    corpus_id: number;
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
      const corpusSet = new Set(scope.corpora.map(Number));

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
        if (!corpusSet.has(row.corpus_id)) continue;
        if (pathGlob !== "*" && !matchGlob(pathGlob, row.path)) continue;

        results.push({
          id: Note.Id.parse(row.note_id),
          corpus: Corpus.Id.parse(row.corpus_id),
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

  export const FetchResults = z.object({
    notes: Note.Info.array(),
  });
  export type FetchResults = z.infer<typeof FetchResults>;

  export const PathsItem = z.object({
    corpus: Corpus.Id,
    paths: z.array(z.string()),
  });
  export type PathsItem = z.infer<typeof PathsItem>;

  export const PathsResults = z.object({
    paths: PathsItem.array(),
  });
  export type PathsResults = z.infer<typeof PathsResults>;

  export const fetch = api(
    z.object({
      id: Id,
      ids: z.array(Note.Id),
    }),
    (input): FetchResults => {
      const db = Store.ensure();

      // validate the query exists
      const query = get({ id: input.id });

      const notes = Note.getByIds({ ids: input.ids });

      if (query.tracked && notes.length > 0) {
        const createdAt = Date.now();
        const payload = "{}";
        const statement = db.prepare(Sql.INSERT_STAGING);
        db.transaction(() => {
          for (const note of notes) {
            statement.run(
              Number(note.id),
              Number(query.id),
              1,
              createdAt,
              payload,
            );
          }
        })();
      }
      return { notes };
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

  export const paths = api(
    z.object({
      id: Id,
      path: z.string().optional(),
    }),
    (input): PathsResults => {
      const db = Store.ensure();

      const query = get({ id: input.id });
      const corpora = JSON.stringify(query.corpora);
      const path = input.path ?? "*";

      const rows = db.prepare(Sql.LIST_QUERY_PATHS).all(corpora, path) as {
        corpus_id: number;
        paths: string;
      }[];

      const results: PathsItem[] = rows.map((row) => ({
        corpus: Corpus.Id.parse(row.corpus_id),
        paths: JSON.parse(row.paths) as string[],
      }));

      return { paths: results };
    },
  );
}
