import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";

import { lazy } from "../util";
import { Workspace, Error } from "@spall/core";

export const WorkspaceRoutes = lazy(() =>
  new Hono()
    .post(
      "/",
      describeRoute({
        summary: "Create a workspace",
        description:
          "Get or create a workspace. Returns existing workspace if name matches, creates new one otherwise.",
        operationId: "workspace.create",
        responses: {
          200: {
            description: "Workspace info",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info),
              },
            },
          },
        },
      }),
      validator("json", Workspace.create.schema),
      async (context) => {
        const input = context.req.valid("json") ?? {};
        const result = await Workspace.create(input);
        return context.json(result);
      },
    )
    .get(
      "/list",
      describeRoute({
        summary: "List workspaces",
        description: "List all workspaces.",
        operationId: "workspace.list",
        responses: {
          200: {
            description: "List of workspaces",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info.array()),
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
          const result = await Workspace.list({});
          return c.json(result);
        } catch (error: any) {
          return c.json(Error.from(error), 500);
        }
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "Get workspace",
        description: "Look up a workspace by name or id.",
        operationId: "workspace.get",
        responses: {
          200: {
            description: "Workspace info",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info),
              },
            },
          },
          404: {
            description: "Workspace not found",
            content: {
              "application/json": {
                schema: resolver(Error.Info),
              },
            },
          },
        },
      }),
      validator("query", Workspace.get.schema),
      async (context) => {
        const query = context.req.valid("query");
        try {
          const result = await Workspace.get(query);
          return context.json(result);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    )
    .delete(
      "/:id",
      describeRoute({
        summary: "Delete workspace",
        description: "Delete a workspace by ID.",
        operationId: "workspace.delete",
        responses: {
          204: {
            description: "Workspace deleted successfully",
          },
          404: {
            description: "Workspace not found",
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
          await Workspace.remove({ id: Workspace.Id.parse(id) });
          return context.body(null, 204);
        } catch (error: any) {
          return context.json(Error.from(error), 404);
        }
      },
    ),
);
