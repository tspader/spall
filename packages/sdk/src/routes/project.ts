import { Hono } from "hono";
import { logger } from "hono/logger";
import {
  describeRoute,
  generateSpecs,
  resolver,
  validator,
} from "hono-openapi";

import { lazy } from "../util";
import { Sse } from "../sse";
import { Project, EventUnion } from "@spall/core";

export const ProjectRoutes = lazy(() =>
  new Hono()
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
        const input = context.req.valid("json") ?? {}
        return Sse.stream(context, Project.create, input);
      }
    )
)
