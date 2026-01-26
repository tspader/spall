import { Hono } from "hono";
import { logger } from "hono/logger";
import {
  describeRoute,
  generateSpecs,
  resolver,
} from "hono-openapi";
import { z } from "zod";

import { Server } from "./server";
import { ProjectRoutes } from "./routes/project";

export namespace App {
  const app = new Hono();
  let loaded = false;

  export function ensure() {
    if (loaded) return;

    app
      .use(async (_, next) => {
        Server.increment();
        try {
          await next();
        } finally {
          Server.decrement();
        }
      })
      .use(logger())
      .route(
        "/project",
        ProjectRoutes()
      )
      .get(
        "/health",
        describeRoute({
          summary: "Health check",
          description: "Check if the server is running",
          operationId: "health",
          responses: {
            200: {
              description: "Server is healthy",
              content: {
                "text/plain": {
                  schema: resolver(z.string()),
                },
              },
            },
          },
        }),
        (c) => {
          return c.text("ok");
        },
      );
    return app;
  }

  export function get(): Hono {
    ensure();
    return app;
  }

  export async function spec(): Promise<Record<string, unknown>> {
    return generateSpecs(App.get(), {
      documentation: {
        info: {
          title: "spall",
          version: "0.0.1",
          description: "Local semantic note store with embeddings",
        },
        openapi: "3.1.1",
      },
    });
  }
}
