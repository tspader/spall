import { Hono } from "hono";
import { logger } from "hono/logger";
import {
  describeRoute,
  generateSpecs,
  resolver,
  validator,
} from "hono-openapi";
import { z } from "zod";

import {} from "@spall/core/src/schema";

import {
  init,
  index,
  search,
  Event,
  InitInput,
  InitEvents,
  IndexInput,
  IndexEvents,
  SearchInput,
  SearchResult,
  EventUnion,
} from "@spall/core";

import { ProjectRoutes } from "./routes/project";

import { Server } from "./server";
import { Sse } from "./sse";

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
      .post(
        "/init",
        describeRoute({
          summary: "Initialize project",
          description:
            "Initialize a spall project in a directory, creating the database and downloading models. Emits progress events via SSE.",
          operationId: "init",
          responses: {
            200: {
              description: "Initialization events stream",
              content: {
                "text/event-stream": {
                  schema: resolver(EventUnion),
                },
              },
            },
          },
        }),
        validator("json", InitInput),
        (context) => {
          const input = context.req.valid("json");
          return Sse.stream(context, init, input);
        },
      )
      .post(
        "/index",
        describeRoute({
          summary: "Index files",
          description:
            "Index files in a project directory, emitting progress events via SSE",
          operationId: "index",
          responses: {
            200: {
              description: "Indexing events stream",
              content: {
                "text/event-stream": {
                  schema: resolver(IndexEvents),
                },
              },
            },
          },
        }),
        validator("json", IndexInput),
        (context) => {
          const input = context.req.valid("json");
          return Sse.stream(context, index, input);
        },
      )
      .post(
        "/search",
        describeRoute({
          summary: "Search",
          description: "Search for similar content using embeddings",
          operationId: "search",
          responses: {
            200: {
              description: "Search results",
              content: {
                "application/json": {
                  schema: resolver(SearchResult.array()),
                },
              },
            },
          },
        }),
        validator("json", SearchInput),
        async (c) => {
          const input = c.req.valid("json");
          const results = await search(input);
          return c.json(results);
        },
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
