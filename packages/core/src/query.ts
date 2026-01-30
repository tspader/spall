import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Sql } from "./sql";
import { Project } from "./project";
import { Note } from "./note";
import { Error } from "./error";

export namespace Query {
  export const Id = z.coerce.number().brand<"QueryId">();
  export type Id = z.infer<typeof Id>;

  export const Info = z.object({
    id: Id,
    projects: z.array(Project.Id),
    createdAt: z.number(),
  });
  export type Info = z.infer<typeof Info>;

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
      Store.ensure();
      const db = Store.get();

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
      Store.ensure();
      const db = Store.get();

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
      Store.ensure();
      const db = Store.get();

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
}
