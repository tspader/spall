import z from "zod";
import { basename } from "path";
import { api } from "./api";
import { Store } from "./store";
import { Bus } from "./event";
import { Sql } from "./sql";
import { Model } from "./model";

export namespace Project {
  export const Info = z.object({
    id: z.number(),
    name: z.string(),
    dir: z.string(),
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

  export const create = api(
    z.object({
      dir: z.string(),
      name: z.string().optional(),
    }),
    async (input) => {
      await Store.ensure();
      const db = Store.get();

      const name = input.name ?? basename(input.dir);
      const row = db.prepare(Sql.INSERT_PROJECT).get(name, input.dir) as {
        id: number;
      };

      await Model.fakeDownload()

      const project: Info = {
        id: row.id,
        name,
        dir: input.dir,
      };
      Bus.publish({ tag: "project.created", info: project });
    },
  );
}
