import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Bus } from "./event";
import { Sql } from "./sql";
import { Error } from "./error";

export namespace Project {
  export const Id = z.coerce.number().brand<"ProjectId">();
  export type Id = z.infer<typeof Id>;

  export class NotFoundError extends Error.SpallError {
    constructor(message: string) {
      super("project.not_found", message);
      this.name = "NotFoundError";
    }
  }

  export const Info = z.object({
    id: Id,
    name: z.string(),
    noteCount: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  });
  export type Info = z.infer<typeof Info>;

  export const Event = {
    Created: Bus.define("project.created", {
      info: Info,
    }),
    Updated: Bus.define("project.updated", {
      info: Info,
    }),
  };

  export const DEFAULT_NAME = "default";

  type Row = {
    id: number;
    name: string;
    created_at: number;
    updated_at: number;
  };

  function countNotes(
    db: ReturnType<typeof Store.get>,
    projectId: number,
  ): number {
    const result = db.prepare(Sql.COUNT_NOTES).get(projectId) as {
      count: number;
    };
    return result.count;
  }

  export const get = api(
    z.object({
      name: z.string().optional(),
      id: z.coerce.number().optional(),
    }),
    (input): Info => {
      const db = Store.ensure();

      let row: Row | null;

      if (input.id !== undefined) {
        row = db.prepare(Sql.GET_PROJECT_BY_ID).get(input.id) as Row | null;
        if (!row) {
          throw new NotFoundError(`Project not found: id=${input.id}`);
        }
      } else {
        const name = input.name ?? DEFAULT_NAME;
        row = db.prepare(Sql.GET_PROJECT_BY_NAME).get(name) as Row | null;
        if (!row) {
          throw new NotFoundError(`Project not found: ${name}`);
        }
      }

      return {
        id: Id.parse(row.id),
        name: row.name,
        noteCount: countNotes(db, row.id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  );

  export const list = api(z.object({}), async (): Promise<Info[]> => {
    const db = Store.ensure();

    const rows = db.prepare(Sql.LIST_PROJECTS).all() as Row[];

    return rows.map((row) => ({
      id: Id.parse(row.id),
      name: row.name,
      noteCount: countNotes(db, row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });

  export const create = api(
    z.object({
      name: z.string(),
    }),
    async (input): Promise<Info> => {
      const db = Store.ensure();

      const name = input.name;

      // Check if project already exists
      const existing = db
        .prepare(Sql.GET_PROJECT_BY_NAME)
        .get(name) as Row | null;
      if (existing) {
        return get({ id: existing.id });
      }

      // Create new project
      const now = Date.now();
      const row = db.prepare(Sql.UPSERT_PROJECT).get(name, now, now) as {
        id: number;
      };

      const project = get({ id: row.id });
      await Bus.publish({ tag: "project.created", info: project });
      return project;
    },
  );

  export const remove = api(
    z.object({
      id: Id,
    }),
    async (input): Promise<void> => {
      const db = Store.ensure();

      // Verify project exists
      const existing = db
        .prepare(Sql.GET_PROJECT_BY_ID)
        .get(input.id) as Row | null;
      if (!existing) {
        throw new NotFoundError(`Project not found: id=${input.id}`);
      }

      // Delete vectors first (references embeddings), then notes (cascades to embeddings), then project
      db.transaction(() => {
        db.prepare(Sql.DELETE_VECTORS_BY_PROJECT).run(input.id);
        db.prepare(Sql.DELETE_NOTES_BY_PROJECT).run(input.id);
        db.prepare(Sql.DELETE_PROJECT).run(input.id);
      })();
    },
  );
}
