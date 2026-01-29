import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Sse } from "../sse";
import { Note, EventUnion, Error } from "@spall/core";

export const NoteRoutes = lazy(() =>
  new Hono()
    .get(
      "/:id",
      describeRoute({
        summary: "Get a note by ID",
        description: "Get a note by its globally unique ID.",
        operationId: "note.getById",
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
            description: "Note not found",
          },
        },
      }),
      async (c) => {
        const id = c.req.param("id");
        try {
          const result = Note.getById({
            id: Note.Id.parse(id),
          });
          return c.json(result);
        } catch (error: any) {
          return c.json({ error: Error.from(error) }, 404);
        }
      },
    )
    .put(
      "/:id",
      describeRoute({
        summary: "Update a note",
        description: "Update a note's content by ID. Re-embeds the content.",
        operationId: "note.update",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(EventUnion),
              },
            },
          },
          404: {
            description: "Note not found",
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
