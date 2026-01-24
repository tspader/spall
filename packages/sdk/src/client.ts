export * from "./gen/types.gen";

import { createClient } from "./gen/client/client.gen";
import type { Config } from "./gen/client/types.gen";
import { SpallClient } from "./gen/sdk.gen";
import { Server } from "./server"

export type { Config as SpallClientConfig };
export { SpallClient };

export function createSpallClient(options?: Config): SpallClient {
  const client = createClient(options);
  return new SpallClient({ client });
}

export namespace Client {
  export async function connect(): Promise<SpallClient> {
    const url = await Server.ensure();
    return attach(url);
  }

  export function attach(url: string): SpallClient {
    const client = createClient({ baseUrl: url });
    return new SpallClient({ client });
  }
}
