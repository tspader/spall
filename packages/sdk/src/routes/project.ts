import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Sse } from "../sse";
import { Project, Note, EventUnion } from "@spall/core";

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
            return c.json({ error: error.message }, 404);
          });
        return result;
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
        const result = await Note.get({
          project: Project.Id.parse(id),
          path,
        })
          .then((result) => {
            return c.json(result);
          })
          .catch((error: any) => {
            return c.json({ error: error.message }, 404);
          });
        return result;
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create a project",
        description: "Create a project",
        operationId: "project.create",
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
      validator("json", Project.create.schema),
      async (context) => {
        const input = context.req.valid("json") ?? {};
        return Sse.stream(context, Project.create, input);
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
        const result = await Project.list({});
        return c.json(result);
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
        const result = await Project.get(query);
        return context.json(result);
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
            description: "Note info",
            content: {
              "application/json": {
                schema: resolver(Note.Info),
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
        try {
          const result = await Note.add(body);
          return context.json(result);
        } catch (e: any) {
          if (e instanceof Project.NotFoundError) {
            return context.json({ error: e.message }, 404);
          }
          throw e;
        }
      },
    ),
);
