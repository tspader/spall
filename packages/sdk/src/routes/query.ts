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
          "Create a query scope for aggregating notes across multiple corpora.",
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
      "/recent",
      describeRoute({
        summary: "List recent queries",
        description: "Get the most recently created queries.",
        operationId: "query.recent",
        responses: {
          200: {
            description: "Recent queries",
            content: {
              "application/json": {
                schema: resolver(Query.RecentResults),
              },
            },
          },
        },
      }),
      validator("query", Query.recent.schema),
      async (c) => {
        const query = c.req.valid("query");
        const result = Query.recent(query);
        return c.json(result);
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
          "List notes across all corpora in a query with keyset pagination.",
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
    )
    .get(
      "/:id/search",
      describeRoute({
        summary: "Keyword search",
        description:
          "Search note content across all corpora in a query using FTS5.",
        operationId: "query.search",
        responses: {
          200: {
            description: "Search results",
            content: {
              "application/json": {
                schema: resolver(Query.SearchResults),
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
      validator("query", Query.search.schema.omit({ id: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = Query.search({
            id: Query.Id.parse(id),
            ...query,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .get(
      "/:id/vsearch",
      describeRoute({
        summary: "Vector search",
        description:
          "Semantic search across all corpora in a query using embeddings.",
        operationId: "query.vsearch",
        responses: {
          200: {
            description: "Search results",
            content: {
              "application/json": {
                schema: resolver(Query.VSearchResults),
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
      validator("query", Query.vsearch.schema.omit({ id: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = await Query.vsearch({
            id: Query.Id.parse(id),
            ...query,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .post(
      "/:id/fetch",
      describeRoute({
        summary: "Fetch notes by ID",
        description:
          "Fetch full note content for a list of note IDs through a query scope. Records access for reweighting.",
        operationId: "query.fetch",
        responses: {
          200: {
            description: "Fetched notes",
            content: {
              "application/json": {
                schema: resolver(Query.FetchResults),
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
      validator("json", Query.fetch.schema.omit({ id: true })),
      async (c) => {
        const id = c.req.param("id");
        const body = c.req.valid("json");
        try {
          const result = Query.fetch({
            id: Query.Id.parse(id),
            ...body,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .get(
      "/:id/paths",
      describeRoute({
        summary: "List paths",
        description:
          "List all note paths across corpora in a query, grouped by corpus.",
        operationId: "query.paths",
        responses: {
          200: {
            description: "Paths grouped by corpus",
            content: {
              "application/json": {
                schema: resolver(Query.PathsResults),
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
      validator("query", Query.paths.schema.omit({ id: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = Query.paths({
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
