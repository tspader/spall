import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Sse } from "../sse";
import { Project, Note, EventUnion, Error } from "@spall/core";

export const ProjectRoutes = lazy(() =>
  new Hono()
    .get(
      "/:id/list",
      describeRoute({
        summary: "List notes",
        description: "List all note paths in a project.",
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
            description: "Project not found",
          },
        },
      }),
      async (c) => {
        const id = c.req.param("id");
        const result = await Note.list({
          project: Project.Id.parse(id),
        })
          .then((result) => {
            return c.json(result);
          })
          .catch((error: any) => {
            return c.json({ error: Error.from(error) }, 404);
          });

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
            description: "Project not found",
          },
        },
      }),
      validator("query", Note.listByPath.schema.omit({ project: true })),
      async (c) => {
        const id = c.req.param("id");
        const query = c.req.valid("query");
        try {
          const result = Note.listByPath({
            project: Project.Id.parse(id),
            ...query,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json({ error: Error.from(error) }, 404);
        }
      },
    )
    .get(
      "/:id/note/:path{.+}",
      describeRoute({
        summary: "Get a note",
        description: "Get a note by path within a project.",
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
            description: "Project or note not found",
          },
        },
      }),
      async (c) => {
        const id = c.req.param("id");
        const path = c.req.param("path");
        try {
          const result = Note.get({
            project: Project.Id.parse(id),
            path,
          });
          return c.json(result);
        } catch (error: any) {
          return c.json({ error: Error.from(error) }, 404);
        }
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create a project",
        description:
          "Get or create a project. Returns existing project if name matches, creates new one otherwise.",
        operationId: "project.create",
        responses: {
          200: {
            description: "Project info",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      validator("json", Project.create.schema),
      async (context) => {
        const input = context.req.valid("json") ?? {};
        const result = await Project.create(input);
        return context.json(result);
      },
    )
    .get(
      "/list",
      describeRoute({
        summary: "List projects",
        description: "List all projects.",
        operationId: "project.list",
        responses: {
          200: {
            description: "List of projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        try {
          const result = await Project.list({});
          return c.json(result);
        } catch (error: any) {
          return c.json({ error: Error.from(error) }, 500);
        }
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "Get project",
        description:
          "Look up a project by name or id. Returns default project if neither specified.",
        operationId: "project.get",
        responses: {
          200: {
            description: "Project info",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      validator("query", Project.get.schema),
      async (context) => {
        const query = context.req.valid("query");
        try {
          const result = await Project.get(query);
          return context.json(result);
        } catch (error: any) {
          return context.json({ error: Error.from(error) }, 404);
        }
      },
    )
    .post(
      "/index",
      describeRoute({
        summary: "Index a directory",
        description: "Scan a directory and embed all matching notes.",
        operationId: "note.index",
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
      validator("json", Note.index.schema),
      async (context) => {
        const body = context.req.valid("json");
        return Sse.stream(context, Note.index, body);
      },
    )
    .post(
      "/note",
      describeRoute({
        summary: "Add a note",
        description:
          "Add a note to a project and embed it. Requires project ID.",
        operationId: "note.add",
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
            description: "Project not found",
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
      "/:id/note/:path{.+}",
      describeRoute({
        summary: "Upsert a note",
        description:
          "Create or update a note by path. Creates if not exists, updates if exists.",
        operationId: "note.upsert",
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
            description: "Project not found",
          },
        },
      }),
      validator("json", Note.upsert.schema.omit({ project: true, path: true })),
      async (context) => {
        const id = context.req.param("id");
        const path = context.req.param("path");
        const body = context.req.valid("json");
        return Sse.stream(context, Note.upsert, {
          project: Project.Id.parse(id),
          path,
          ...body,
        });
      },
    ),
);
