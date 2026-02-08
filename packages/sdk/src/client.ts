import { createClient } from "./gen/client/client.gen";
import { SpallClient } from "./gen/sdk.gen";
import { ensure } from "./lock";
import { Config } from "@spall/core/config";

export { SpallClient };

export * from "./gen/types.gen";

const URL_KEY = Symbol.for("spall.client.url");

type TaggedEvent = { tag: string };
export namespace Client {
  /** Get the base URL a client was connected to. */
  export function url(client: SpallClient): string {
    return (client as any)[URL_KEY];
  }

  export function unwrap<T>(
    result: { data?: T; error?: unknown } | undefined,
  ): T {
    if (!result || result.error || !result.data) {
      throw result?.error ?? new Error("No data");
    }
    return result.data;
  }

  export async function connect(signal?: AbortSignal): Promise<SpallClient> {
    const remoteUrl = Config.get().server.url;
    if (remoteUrl) {
      try {
        const res = await fetch(`${remoteUrl}/health`, { signal });
        if (!res.ok) throw new Error(`Remote server returned ${res.status}`);
      } catch (err: any) {
        throw new Error(
          `Cannot reach remote server at ${remoteUrl}: ${err?.message ?? err}`,
        );
      }
      return attach(remoteUrl, signal);
    }

    const url = await ensure();
    return attach(url, signal);
  }

  export function attach(url: string, signal?: AbortSignal): SpallClient {
    const client = createClient({ baseUrl: url, signal });
    const spall = new SpallClient({ client });
    (spall as any)[URL_KEY] = url;
    return spall;
  }

  // consume an SSE stream until you see the event you want; useful for
  // endpoints that return a stream for progress but for which you just want
  // to get the final result
  export async function until<TEvent extends TaggedEvent, TTag extends string>(
    stream: AsyncGenerator<TEvent, unknown, unknown>,
    tag: TTag,
    handler?: (event: TEvent) => void,
  ): Promise<Extract<TEvent, { tag: TTag }>> {
    const isErrorEvent = (
      event: TEvent,
    ): event is TEvent & {
      tag: "error";
      error?: { code?: string; message?: string };
    } => event.tag === "error" && "error" in (event as Record<string, unknown>);

    for await (const event of stream) {
      handler?.(event);

      if (isErrorEvent(event)) {
        const e = event.error;
        const err = new Error(e?.message ?? "unknown error");
        (err as any).code = e?.code ?? "error";
        throw err;
      }

      if (event?.tag === tag) {
        return event as Extract<TEvent, { tag: TTag }>;
      }
    }
    throw new Error(`Stream ended without receiving '${tag}' event`);
  }
}
