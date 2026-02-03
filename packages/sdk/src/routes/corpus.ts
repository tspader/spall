import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Corpus, Note, Error } from "@spall/core";

export const CorpusRoutes = lazy(() =>
  new Hono()
    .get(
      "/:id/list",
      describeRoute({
        summary: "List notes",
        description: "List all note paths in a corpus.",
        operationId: "note.list",
        responses: {
          200: {
            description: "List of notes",
            content: {
              "application/json": {
                schema: resolver(Note.ListItem.array()),
              },
            },
          },
          404: {
            description: "Corpus not found",
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
        const result = await Note.list({
          corpus: Corpus.Id.parse(id),
        })
          .then((result) => c.json(result))
          .catch((error: any) => c.json(Error.from(error), 404));
        return result;
      },
    )
    .get(
      "/:id/notes",
      describeRoute({
        summary: "List notes by path",
        description:
          "List notes under a path prefix with keyset pagination. Returns full note content.",
        operationId: "note.listByPath",
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
            description: "Corpus not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("query", Note.listByPath.schema.omit({ corpus: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = Note.listByPath({
            corpus: Corpus.Id.parse(id),
            ...query,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .get(
      "/:id/note/:path{.+}",
      describeRoute({
        summary: "Get a note",
        description: "Get a note by path within a corpus.",
        operationId: "note.get",
        responses: {
          200: {
            description: "Note with content",
            content: {
              "application/json": {
                schema: resolver(Note.Info),
              },
            },
          },
          404: {
            description: "Corpus or note not found",
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
        const path = c.req.param("path");
        try {
          const result = Note.get({
            corpus: Corpus.Id.parse(id),
            path,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
        }
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create a corpus",
        description:
          "Get or create a corpus. Returns existing corpus if name matches, creates new one otherwise.",
        operationId: "corpus.create",
        responses: {
          200: {
            description: "Corpus info",
            content: {
              "application/json": {
                schema: resolver(Corpus.Info),
              },
            },
          },
        },
      }),
      validator("json", Corpus.create.schema),
      async (context) => {
        const input = context.req.valid("json") ?? {};
        const result = await Corpus.create(input);
        return context.json(result);
      },
    )
    .get(
      "/list",
      describeRoute({
        summary: "List corpora",
        description: "List all corpora.",
        operationId: "corpus.list",
        responses: {
          200: {
            description: "List of corpora",
            content: {
              "application/json": {
                schema: resolver(Corpus.Info.array()),
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        try {
          const result = await Corpus.list({});
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 500);
        }
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "Get corpus",
        description:
          "Look up a corpus by name or id. Returns default corpus if neither specified.",
        operationId: "corpus.get",
        responses: {
          200: {
            description: "Corpus info",
            content: {
              "application/json": {
                schema: resolver(Corpus.Info),
              },
            },
          },
          404: {
            description: "Corpus not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("query", Corpus.get.schema),
      async (context) => {
        const query = context.req.valid("query");
        try {
          const result = await Corpus.get(query);
          return context.json(result);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    )
    .delete(
      "/:id",
      describeRoute({
        summary: "Delete corpus",
        description: "Delete a corpus and all associated notes by ID.",
        operationId: "corpus.delete",
        responses: {
          204: {
            description: "Corpus deleted successfully",
          },
          404: {
            description: "Corpus not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      async (context) => {
        try {
          const id = context.req.param("id");
          await Corpus.remove({ id: Corpus.Id.parse(id) });
          return context.body(null, 204);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    )
    .post(
      "/sync",
      describeRoute({
        summary: "Sync a directory as notes",
        description: "Scan a directory, add matching notes, remove non-matches",
        operationId: "note.sync",
        responses: {
          204: {
            description: "Index complete",
          },
        },
      }),
      validator("json", Note.sync.schema),
      async (context) => {
        const body = context.req.valid("json");
        await Note.sync(body);
        return context.body(null, 204);
      },
    )
    .post(
      "/note",
      describeRoute({
        summary: "Add a note",
        description: "Add a note to a corpus and embed it. Requires corpus ID.",
        operationId: "note.add",
        responses: {
          200: {
            description: "Created note",
            content: {
              "application/json": {
                schema: resolver(Note.Info),
              },
            },
          },
          404: {
            description: "Corpus not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("json", Note.add.schema),
      async (context) => {
        const body = context.req.valid("json");
        try {
          const result = await Note.add(body);
          return context.json(result);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    )
    .put(
      "/:id/note/:path{.+}",
      describeRoute({
        summary: "Upsert a note",
        description:
          "Create or update a note by path. Creates if not exists, updates if exists.",
        operationId: "note.upsert",
        responses: {
          200: {
            description: "Created or updated note",
            content: {
              "application/json": {
                schema: resolver(Note.Info),
              },
            },
          },
          404: {
            description: "Corpus not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("json", Note.upsert.schema.omit({ corpus: true, path: true })),
      async (context) => {
        const id = context.req.param("id");
        const path = context.req.param("path");
        const body = context.req.valid("json");
        try {
          const result = await Note.upsert({
            corpus: Corpus.Id.parse(id),
            path,
            ...body,
          });
          return context.json(result);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    ),
);
