import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Query, Note, Error } from "@spall/core";

export const QueryRoutes = lazy(() =>
  new Hono()
    .post(
      "/",
      describeRoute({
        summary: "Create a query",
        description:
          "Create a query scope for aggregating notes across multiple projects.",
        operationId: "query.create",
        responses: {
          200: {
            description: "Query info",
            content: {
              "application/json": {
                schema: resolver(Query.Info),
              },
            },
          },
          404: {
            description: "Query not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("json", Query.create.schema),
      async (c) => {
        const body = c.req.valid("json");
        try {
          const result = Query.create(body);
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .get(
      "/:id",
      describeRoute({
        summary: "Get a query",
        description: "Get a query by ID.",
        operationId: "query.get",
        responses: {
          200: {
            description: "Query info",
            content: {
              "application/json": {
                schema: resolver(Query.Info),
              },
            },
          },
          404: {
            description: "Query not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const id = c.req.param("id");
        try {
          const result = Query.get({ id: Query.Id.parse(id) });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .get(
      "/:id/notes",
      describeRoute({
        summary: "Query notes",
        description:
          "List notes across all projects in a query with keyset pagination.",
        operationId: "query.notes",
        responses: {
          200: {
            description: "Paginated notes",
            content: {
              "application/json": {
                schema: resolver(Note.Page),
              },
            },
          },
          404: {
            description: "Query not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("query", Query.notes.schema.omit({ id: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = Query.notes({
            id: Query.Id.parse(id),
            ...query,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    ),
);
