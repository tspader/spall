import * as prompts from "@clack/prompts";

import type { CommandDef } from "@spall/cli/shared";

import { bash, zsh } from "./shell";
import { opencode } from "./opencode";

export type Integration = {
  label: string;
  hint?: string;
  handler: () => Promise<void>;
};

const integrations: Record<string, Integration> = {
  bash,
  zsh,
  opencode,
};

export const integrate: CommandDef = {
  description: "Set up integrations with third party tools",
  handler: async () => {
    prompts.intro("Integrations");

    const choice = await prompts.select({
      message: "Select a tool",
      options: Object.entries(integrations).map(([key, cfg]) => ({
        value: key,
        hint: cfg.hint,
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
