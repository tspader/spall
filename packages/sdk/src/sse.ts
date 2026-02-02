import { streamSSE } from "hono/streaming";

import { Bus, Context, EventUnion, Error, Store } from "@spall/core";
import { Server } from "./server";

export namespace Sse {
  type SseContext = Parameters<typeof streamSSE>[0];

  // wrap hono's sse streaming with code to
  //   - track the sse connection
  //   - clean up subscriptions when finished
  //   - give access to a per-request cancellation signal
  export function stream<T>(
    context: SseContext,
    handler: (arg: T) => Promise<unknown>,
    input: T,
  ) {
    return streamSSE(context, async (stream) => {
      Server.Sse.track()

      const write = async (event: EventUnion) => {
        if (stream.aborted) return;
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      let unsubscribe = Bus.subscribe(write);

      // run the actual work we want to do through a thin wrapper that gives
      // access to the cancellation signal
      const [result, ctx] = Context.run(() => handler(input));

      stream.onAbort(() => {
        ctx.aborted = true;
        unsubscribe();
        unsubscribe = () => false;
      });

      try {
        await result;
      } catch (error) {
        if (!(error instanceof Store.CancelledError)) {
          await write({ tag: "error", error: Error.from(error) });
        }
      } finally {
        unsubscribe();
        Server.Sse.untrack();
      }
    });
  }

  // the same, but for permanent stream
  export function subscribe(context: SseContext) {
    return streamSSE(context, async (stream) => {
      Server.Sse.track();

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
      Server.Sse.untrack();
    });
  }
}
