import consola from "consola";
import { Client } from "@spall/sdk/client";
import { type CommandDef, defaultTheme as theme } from "@spall/cli/shared";

export const commit: CommandDef = {
  description:
    "Move all staged events into committed (used for personalization/weights)",
  handler: async () => {
    const client = await Client.connect();

    // `commit.run` is a POST with an empty JSON body.
    const res = await client.commit.run({ body: {} }).then(Client.unwrap);

    const moved = Number(res?.moved ?? 0);
    if (moved === 0) {
      consola.info("No staged events to commit");
      return;
    }

    consola.success(`Committed ${theme.primary(String(moved))} event(s)`);
  },
};
