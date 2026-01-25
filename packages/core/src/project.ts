import z from "zod";
import { Uuid } from "./uuid"
import { api } from "./api"
import { Store } from "./store"
import { Bus } from "./event"

export namespace Project {
  export const Info = z.object({
    id: z.number(),
    name: z.string(),
    dir: z.string()
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: Bus.define("project.created", {
      info: Info
    }),
    Updated: Bus.define("project.updated", {
      foo: z.number(),
    }),

  }

  export const create = api(
    z.object({
      dir: z.string()
    }),
    async (input) => {
      Store.ensure()
      const project: Info = {
        id: 0,
        name: "",
        dir: ""
      };
      Bus.publish({ tag: "project.created", info: project });
    }
  )
}
