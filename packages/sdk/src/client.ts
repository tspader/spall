import { createClient } from "./gen/client/client.gen";
import { SpallClient } from "./gen/sdk.gen";
import { ensure } from "./lock";

export { SpallClient };

export * from "./gen/types.gen";

type TaggedEvent = { tag: string };
export namespace Client {
  export function unwrap<T>(
    result: { data?: T; error?: unknown } | undefined,
  ): T {
    if (!result || result.error || !result.data) {
      throw result?.error ?? new Error("No data");
    }
    return result.data;
  }

  export async function connect(signal?: AbortSignal): Promise<SpallClient> {
    const url = await ensure();
    return attach(url, signal);
  }

  export function attach(url: string, signal?: AbortSignal): SpallClient {
    const client = createClient({ baseUrl: url, signal });
    return new SpallClient({ client });
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
