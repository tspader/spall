import { Hono } from "hono";
import { logger } from "hono/logger";
import { describeRoute, generateSpecs, resolver } from "hono-openapi";
import { z } from "zod";

import { Server } from "./server";
import { CorpusRoutes } from "./routes/corpus";
import { WorkspaceRoutes } from "./routes/workspace";
import { NoteRoutes } from "./routes/note";
import { QueryRoutes } from "./routes/query";
import { CommitRoutes } from "./routes/commit";
import { SseRoutes } from "./routes/sse";
import { Sse } from "./sse";
import { EventUnion } from "@spall/core";

export namespace App {
  const app = new Hono();
  let loaded = false;

  export function ensure() {
    if (loaded) return;
    loaded = true;

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
      .route("/workspace", WorkspaceRoutes())
      .route("/corpus", CorpusRoutes())
      .route("/note", NoteRoutes())
      .route("/query", QueryRoutes())
      .route("/commit", CommitRoutes())
      .route("/sse", SseRoutes())
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
      )
      .get(
        "/events",
        describeRoute({
          summary: "Event stream",
          description: "Subscribe to all server events via SSE",
          operationId: "events",
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
        (c) => {
          return Sse.subscribe(c);
        },
      );

    app.post(
      "/shutdown",
      describeRoute({
        summary: "Shutdown server",
        description: "Request the server to stop.",
        operationId: "server.shutdown",
        responses: {
          200: {
            description: "Shutdown acknowledged",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.literal(true) })),
              },
            },
          },
        },
      }),
      async (c) => {
        // Let the response flush before stopping.
        setTimeout(() => {
          try {
            process.kill(process.pid, "SIGTERM");
          } catch {
            // ignore
          }
        }, 0);
        return c.json({ ok: true as const });
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
