import { existsSync, readFileSync, appendFileSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

import * as prompts from "@clack/prompts";

import { snippets, type Shell } from "@spall/integration";
import { defaultTheme as theme } from "@spall/cli/shared";

import { type Integration } from "./index";

type ShellConfig = {
  defaultRc: string;
};

export const bash: Integration = {
  label: "bash",
  hint: "path completions, cli completions",
  handler: () => shellIntegration("bash"),
};

export const zsh: Integration = {
  label: "zsh",
  hint: "path completions, cli completions",
  handler: () => shellIntegration("zsh"),
};

const SPALL_CANARY = "@spall_canary";

const configs: Record<Shell, ShellConfig> = {
  bash: {
    defaultRc: join(
      homedir(),
      platform() === "darwin" ? ".bash_profile" : ".bashrc",
    ),
  },
  zsh: {
    defaultRc: join(homedir(), ".zshrc"),
  },
};

export async function shellIntegration(shell: Shell): Promise<void> {
  const cfg = configs[shell];
  const snippet = snippets[shell];

  const rcFile = await prompts.text({
    message: "Where should the hook be installed?",
    initialValue: cfg.defaultRc,
    validate: (s) => (s && s.trim() ? undefined : "Required"),
  });

  if (prompts.isCancel(rcFile)) {
    prompts.cancel("Cancelled");
    return;
  }

  const rc = String(rcFile).trim();

  if (existsSync(rc)) {
    const contents = readFileSync(rc, "utf-8");
    if (contents.includes(SPALL_CANARY)) {
      prompts.outro(`Hook is already installed in ${theme.primary(rc)}`);
      return;
    }
  }

  appendFileSync(rc, "\n" + snippet);
  prompts.log.info(`Added hook to ${theme.primary(rc)}`);
  prompts.note(
`Run ${theme.code(`source ${rc}`)} or restart your shell to activate

Get completions for available commands:
> ${theme.code("spall")} <tab>

Get completions for paths:
> ${theme.code("spall list ai-gateway/tutorials/")} <tab>
ai-gateway/tutorials/create-first-aig-workers.mdx
ai-gateway/tutorials/index.mdx
ai-gateway/tutorials/deploy-aig-worker.mdx`
  );
}
