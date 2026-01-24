import { createClient } from "./gen/client/client.gen";
import { SpallClient } from "./gen/sdk.gen";
import { Server } from "./server"

export * from "./gen/types.gen";

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
