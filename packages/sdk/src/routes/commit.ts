import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Commit } from "@spall/core";

export const CommitRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Commit staged events",
      description: "Move all rows from staging to committed.",
      operationId: "commit.run",
      responses: {
        200: {
          description: "Commit result",
          content: {
            "application/json": {
              schema: resolver(Commit.Result),
            },
          },
        },
      },
    }),
    validator("json", Commit.run.schema),
    async (c) => {
      const body = c.req.valid("json");
      const result = Commit.run(body);
      return c.json(result);
    },
  ),
);
