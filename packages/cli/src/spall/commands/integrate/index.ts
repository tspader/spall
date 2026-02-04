import * as prompts from "@clack/prompts";

import type { CommandDef } from "@spall/cli/shared";

import { bash, zsh } from "./shell";

export type Integration = {
  label: string;
  handler: () => Promise<void>;
};

const integrations: Record<string, Integration> = {
  bash,
  zsh,
};

export const integrate: CommandDef = {
  description: "Set up integrations",
  handler: async () => {
    prompts.intro("Integrations");

    const choice = await prompts.select({
      message: "Select a tool to install integrations for",
      options: Object.entries(integrations).map(([key, cfg]) => ({
        value: key,
        label: cfg.label,
      })),
    });

    if (prompts.isCancel(choice)) {
      prompts.cancel("Cancelled");
      return;
    }

    await integrations[choice]!.handler();
  },
};
