import { createClient } from "./gen/client/client.gen";
import { SpallClient } from "./gen/sdk.gen";
import { ensure } from "./lock";

export * from "./gen/types.gen";

type TaggedEvent = { tag: string };

type EventHandler = (event: TaggedEvent) => void;

export namespace Client {
  export function unwrap<T>(
    result: { data?: T; error?: unknown } | undefined,
  ): T {
    if (!result || result.error || !result.data) {
      throw result?.error ?? new Error("No data");
    }
    return result.data;
  }

  export async function connect(): Promise<SpallClient> {
    const url = await ensure();
    return attach(url);
  }

  export function attach(url: string): SpallClient {
    const client = createClient({ baseUrl: url });
    return new SpallClient({ client });
  }

  // subscribe to server events; returns subscription with unsubscribe and abort controller
  export function subscribe(
    client: SpallClient,
    handler: EventHandler,
  ): () => void {
    const controller = new AbortController();

    (async () => {
      const { stream } = await client.events({ signal: controller.signal });
      try {
        for await (const event of stream) {
          handler(event);
        }
      } catch (e) {
        // AbortError is expected on close, ignore it
        if (e instanceof Error && e.name === "AbortError") return;
        throw e;
      }
    })();

    return () => controller.abort();
  }

  // consume an SSE stream until you see the event you want; useful for
  // endpoints that return a stream for progress but for which you just want
  // to get the final result
  export async function until<TEvent extends TaggedEvent, TTag extends string>(
    stream: AsyncGenerator<TEvent, unknown, unknown>,
    tag: TTag,
    handler?: (event: TEvent) => void,
  ): Promise<Extract<TEvent, { tag: TTag }>> {
    for await (const event of stream) {
      handler?.(event);
      if (event.tag === tag) {
        return event as Extract<TEvent, { tag: TTag }>;
      }
    }
    throw new Error(`Stream ended without receiving '${tag}' event`);
  }
}
