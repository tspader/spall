import { createClient } from "./gen/client/client.gen";
import { SpallClient } from "./gen/sdk.gen";
import { ensure } from "./lock";

export * from "./gen/types.gen";

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
}
