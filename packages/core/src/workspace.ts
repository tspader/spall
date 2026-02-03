import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Bus } from "./event";
import { Sql } from "./sql";
import { Error } from "./error";

export namespace Workspace {
  export const Id = z.coerce.number().brand<"WorkspaceId">();
  export type Id = z.infer<typeof Id>;

  export class NotFoundError extends Error.SpallError {
    constructor(message: string) {
      super("workspace.not_found", message);
      this.name = "NotFoundError";
    }
  }

  export const Info = z.object({
    id: Id,
    name: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  });
  export type Info = z.infer<typeof Info>;

  export const Event = {
    Created: Bus.define("workspace.created", { info: Info }),
    Updated: Bus.define("workspace.updated", { info: Info }),
  };

  type Row = {
    id: number;
    name: string;
    created_at: number;
    updated_at: number;
  };

  export const get = api(
    z.object({
      name: z.string().optional(),
      id: z.coerce.number().optional(),
    }),
    (input): Info => {
      const db = Store.ensure();

      let row: Row | null;
      if (input.id !== undefined) {
        row = db.prepare(Sql.GET_WORKSPACE_BY_ID).get(input.id) as Row | null;
        if (!row) {
          throw new NotFoundError(`Workspace not found: id=${input.id}`);
        }
      } else {
        const name = input.name;
        if (!name) {
          throw new NotFoundError("Workspace not found: missing name/id");
        }
        row = db.prepare(Sql.GET_WORKSPACE_BY_NAME).get(name) as Row | null;
        if (!row) {
          throw new NotFoundError(`Workspace not found: ${name}`);
        }
      }

      return {
        id: Id.parse(row.id),
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  );

  export const list = api(z.object({}), async (): Promise<Info[]> => {
    const db = Store.ensure();
    const rows = db.prepare(Sql.LIST_WORKSPACES).all() as Row[];
    return rows.map((row) => ({
      id: Id.parse(row.id),
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });

  // get-or-create
  export const create = api(
    z.object({
      name: z.string(),
    }),
    async (input): Promise<Info> => {
      const db = Store.ensure();
      const name = input.name;

      const existing = db
        .prepare(Sql.GET_WORKSPACE_BY_NAME)
        .get(name) as Row | null;
      if (existing) {
        return get({ id: existing.id });
      }

      const now = Date.now();
      const row = db.prepare(Sql.UPSERT_WORKSPACE).get(name, now, now) as {
        id: number;
      };

      const ws = get({ id: row.id });
      await Bus.publish({ tag: "workspace.created", info: ws });
      return ws;
    },
  );

  export const remove = api(
    z.object({
      id: Id,
    }),
    async (input): Promise<void> => {
      const db = Store.ensure();

      const existing = db
        .prepare(Sql.GET_WORKSPACE_BY_ID)
        .get(input.id) as Row | null;
      if (!existing) {
        throw new NotFoundError(`Workspace not found: id=${input.id}`);
      }

      // Queries should be considered workspace-owned.
      // Deleting a workspace should remove queries; corpora are independent.
      db.transaction(() => {
        db.prepare(Sql.DELETE_QUERIES_BY_VIEWER).run(input.id);
        db.prepare(Sql.DELETE_WORKSPACE).run(input.id);
      })();
    },
  );
}
