import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Sse } from "../sse";
import { Corpus, Note, EventUnion } from "@spall/core";

export const SseRoutes = lazy(() =>
  new Hono()
    .post(
      "/corpus/sync",
      describeRoute({
        summary: "Index a directory (SSE)",
        description:
          "Scan a directory and embed all matching notes. Streams progress events.",
        operationId: "sse.note.sync",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(EventUnion),
              },
            },
          },
        },
      }),
      validator("json", Note.sync.schema),
      async (context) => {
        const body = context.req.valid("json");
        return Sse.stream(context, Note.sync, body);
      },
    )
    .post(
      "/corpus/note",
      describeRoute({
        summary: "Add a note (SSE)",
        description:
          "Add a note to a corpus and embed it. Streams progress events.",
        operationId: "sse.note.add",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(EventUnion),
              },
            },
          },
        },
      }),
      validator("json", Note.add.schema),
      async (context) => {
        const body = context.req.valid("json");
        return Sse.stream(context, Note.add, body);
      },
    )
    .put(
      "/corpus/:id/note/:path{.+}",
      describeRoute({
        summary: "Upsert a note (SSE)",
        description:
          "Create or update a note by path. Streams progress events.",
        operationId: "sse.note.upsert",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(EventUnion),
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
        return Sse.stream(context, Note.upsert, {
          corpus: Corpus.Id.parse(id),
          path,
          ...body,
        });
      },
    )
    .put(
      "/note/:id",
      describeRoute({
        summary: "Update a note (SSE)",
        description:
          "Update a note's content by ID. Re-embeds the content. Streams progress events.",
        operationId: "sse.note.update",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(EventUnion),
              },
            },
          },
        },
      }),
      validator("json", Note.update.schema.omit({ id: true })),
      async (context) => {
        const id = context.req.param("id");
        const body = context.req.valid("json");
        return Sse.stream(context, Note.update, {
          id: Note.Id.parse(id),
          ...body,
        });
      },
    ),
);
