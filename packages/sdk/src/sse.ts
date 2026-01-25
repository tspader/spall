import { streamSSE } from "hono/streaming";

import { Bus, EventUnion } from "@spall/core"
import { Server } from './server'

export namespace Sse {
  // small helper to wrap hono's sse streaming with code to
  //   - track the sse connection
  //   - clean up subscriptions when finished
  type SseContext = Parameters<typeof streamSSE>[0];

  export function stream<T>(
    context: SseContext,
    handler: (arg: T) => Promise<void>,
    input: T,
  ) {
    return streamSSE(context, async (stream) => {
      Server.increment();

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
        Server.decrement();
      }
    });
  }
}
