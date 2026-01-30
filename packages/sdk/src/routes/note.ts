import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Note, Error } from "@spall/core";

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
          const result = Note.getById({
            id: Note.Id.parse(id),
          });
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 404);
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
            description: "Updated note",
            content: {
              "application/json": {
                schema: resolver(Note.Info),
              },
            },
          },
          404: {
            description: "Note not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("json", Note.update.schema.omit({ id: true })),
      async (context) => {
        const id = context.req.param("id");
        const body = context.req.valid("json");
        try {
          const result = await Note.update({
            id: Note.Id.parse(id),
            ...body,
          });
          return context.json(result);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    ),
);
