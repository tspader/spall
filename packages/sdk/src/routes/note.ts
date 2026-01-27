import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";

import { lazy } from "../util";
import { Note } from "@spall/core";

export const NoteRoutes = lazy(() =>
  new Hono().get(
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
        return c.json({ error: error.message }, 404);
      }
    },
  ),
);
