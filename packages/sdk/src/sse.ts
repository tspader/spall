import { streamSSE } from "hono/streaming";

import { Bus, EventUnion } from "@spall/core";
import { Server } from "./server";

export namespace Sse {
  type SseContext = Parameters<typeof streamSSE>[0];

  // wrap hono's sse streaming with code to
  //   - track the sse connection
  //   - clean up subscriptions when finished
  export function stream<T>(
    context: SseContext,
    handler: (arg: T) => Promise<unknown>,
    input: T,
  ) {
    return streamSSE(context, async (stream) => {
      Server.incrementSse();

      const write = async (event: EventUnion) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      const unsubscribe = Bus.subscribe(write);

      try {
        await handler(input);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        await stream.writeSSE({ data: JSON.stringify({ error: message }) });
      } finally {
        unsubscribe();
        Server.decrementSse();
      }
    });
  }

  // the same, but for permanent stream
  export function subscribe(context: SseContext) {
    return streamSSE(context, async (stream) => {
      Server.incrementSse();

      const write = async (event: EventUnion) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      // Send initial connection event so clients know stream is ready
      await write({ tag: "sse.connected" });

      const unsubscribe = Bus.subscribe(write);

      // wait for client disconnect
      await new Promise<void>((resolve) => {
        if (stream.aborted) return resolve();
        stream.onAbort(resolve);
      });

      unsubscribe();
      Server.decrementSse();
    });
  }
}
