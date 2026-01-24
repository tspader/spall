import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { logger } from "hono/logger";
import {
  describeRoute,
  generateSpecs,
  resolver,
  validator,
} from "hono-openapi";
import { z } from "zod";

import {
  InitInput,
  InitResponse,
  IndexInput,
  SearchInput,
  SearchResult,
  IndexResponse,
} from "@spall/core/src/schema";

import {
  init,
  index,
  search,
} from "./api"

import { Bus, type Event } from "@spall/core/src/event";

import { Server } from "./server";

export namespace App {
  const app = new Hono();
  let loaded = false;

  export function ensure() {
    if (loaded) return;

    app
    .use(async (_, next) => {
      Server.markRequest();
      try {
        await next();
      } finally {
        Server.unmarkRequest();
      }
    })
    .use(logger())
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
                schema: resolver(InitResponse),
              },
            },
          },
        },
      }),
      validator("json", InitInput),
      (context) => {
        const input = context.req.valid("json");
        return sse(context, init, input);
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
                schema: resolver(IndexResponse),
              },
            },
          },
        },
      }),
      validator("json", IndexInput),
      (context) => {
        const input = context.req.valid("json");
        return sse(context, index, input);
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

  // small helper to wrap hono's sse streaming with code to
  //   - track the sse connection
  //   - clean up subscriptions when finished
  type SseContext = Parameters<typeof streamSSE>[0];

  function sse<T>(context: SseContext, handler: (arg: T) => Promise<void>, input: T) {
    return streamSSE(context, async (stream) => {
      Server.markSSE();

      const write = async (event: Event) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      const unsubscribe = Bus.listen(write);

      try {
        await handler(input)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        await stream.writeSSE({ data: JSON.stringify({ error: message }) });
      }
      finally {
        unsubscribe();
        Server.unmarkSSE();
      }
    });
  }

  export async function spec() {
    return generateSpecs(app, {
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

