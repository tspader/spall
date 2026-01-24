export * from "./gen/types.gen";

import { createClient } from "./gen/client/client.gen";
import type { Config } from "./gen/client/types.gen";
import { SpallClient } from "./gen/sdk.gen";

export type { Config as SpallClientConfig };
export { SpallClient };

export type SpallClientOptions = Config & {
  directory?: string;
};

export function spall(options?: SpallClientOptions): SpallClient {
  const config: Config = { ...options };

  if (options?.directory) {
    config.headers = {
      ...config.headers,
      "x-spall-directory": options.directory,
    };
  }

  const client = createClient(config);
  return new SpallClient({ client });
}
