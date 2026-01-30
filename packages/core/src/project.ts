import z from "zod";
import { basename } from "path";
import { api } from "./api";
import { Store } from "./store";
import { Bus } from "./event";
import { Sql } from "./sql";

export namespace Project {
  export const Id = z.coerce.number().brand<"ProjectId">();
  export type Id = z.infer<typeof Id>;

  export class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  }

  export const Info = z.object({
    id: Id,
    name: z.string(),
    dir: z.string(),
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
      foo: z.number(),
    }),
  };

  export const DEFAULT_NAME = "default";

  type Row = {
    id: number;
    name: string;
    dir: string;
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
      Store.ensure();
      const db = Store.get();

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
        dir: row.dir,
        noteCount: countNotes(db, row.id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  );

  export const list = api(z.object({}), async (): Promise<Info[]> => {
    Store.ensure();
    const db = Store.get();

    const rows = db.prepare(Sql.LIST_PROJECTS).all() as Row[];

    return rows.map((row) => ({
      id: Id.parse(row.id),
      name: row.name,
      dir: row.dir,
      noteCount: countNotes(db, row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });

  export const create = api(
    z.object({
      dir: z.string(),
      name: z.string().optional(),
    }),
    async (input): Promise<Info> => {
      Store.ensure();
      const db = Store.get();

      const name = input.name ?? basename(input.dir);

      // Check if project already exists
      const existing = db
        .prepare(Sql.GET_PROJECT_BY_NAME)
        .get(name) as Row | null;
      if (existing) {
        return get({ id: existing.id });
      }

      // Create new project
      const now = Date.now();
      const row = db
        .prepare(Sql.UPSERT_PROJECT)
        .get(name, input.dir, now, now) as {
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
      Store.ensure();
      const db = Store.get();

      // Verify project exists
      const existing = db
        .prepare(Sql.GET_PROJECT_BY_ID)
        .get(input.id) as Row | null;
      if (!existing) {
        throw new NotFoundError(`Project not found: id=${input.id}`);
      }

      // Delete project (cascades to notes, embeddings, vectors via FK constraints)
      db.prepare(Sql.DELETE_PROJECT).run(input.id);
    },
  );
}
