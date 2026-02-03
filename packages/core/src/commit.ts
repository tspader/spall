import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Sql } from "./sql";

export namespace Commit {
  export const Result = z.object({
    moved: z.number(),
    committedAt: z.number(),
  });
  export type Result = z.infer<typeof Result>;

  export const run = api(z.object({}), (): Result => {
    const db = Store.ensure();

    const countRow = db.prepare(Sql.COUNT_STAGING).get() as { count: number };
    const moved = Number(countRow?.count ?? 0);
    const committedAt = Date.now();

    if (moved === 0) return { moved: 0, committedAt };

    const statements = {
      move: db.prepare(Sql.COMMIT_STAGING_TO_COMMITTED),
      clear: db.prepare(Sql.CLEAR_STAGING),
    };

    db.transaction(() => {
      statements.move.run(committedAt);
      statements.clear.run();
    })();

    return { moved, committedAt };
  });
}
