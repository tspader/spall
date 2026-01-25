import z from "zod";
import { Uuid } from "./uuid"
import { api } from "./api"
import { Store } from "./store"

export namespace Project {
  export const Info = z.object({
    id: z.number(),
    name: z.string(),
    dir: z.string()
  })
  export type Info = z.infer<typeof Info>

  export const create = api(
    z.object({
      dir: z.string()
    }),
    async (input) => {
      Store.open(input.dir)
      return
    }
  )
}
