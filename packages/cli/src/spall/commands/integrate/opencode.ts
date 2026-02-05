import * as prompts from "@clack/prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

import { defaultTheme as theme } from "@spall/cli/shared";

import type { Integration } from "./index";

const HELLO_PLUGIN_PKG = "@spall/opencode-plugin-hello";

// JSONC editing is intentionally not supported here. If a user has JSONC,
// we ask them to update it manually.

function configCandidates(dir: string): string[] {
  return [join(dir, "opencode.jsonc"), join(dir, "opencode.json")];
}

function pickExistingConfigPath(dir: string): string | null {
  for (const p of configCandidates(dir)) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findOpencodeDir(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, ".opencode");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export const opencode: Integration = {
  label: "opencode",
  hint: "install an OpenCode plugin",
  handler: async () => {
    const scope = await prompts.select({
      message: "Install for",
      options: [
        {
          value: "project",
          label: "This project",
          hint: "uses .opencode/plugins",
        },
        {
          value: "global",
          label: "Global",
          hint: "uses ~/.config/opencode/plugins",
        },
      ],
    });

    if (prompts.isCancel(scope)) {
      prompts.cancel("Cancelled");
      return;
    }

    let configDir: string;
    if (scope === "global") {
      configDir = join(homedir(), ".config", "opencode");
    } else {
      const opencodeDir = findOpencodeDir(process.cwd());
      if (!opencodeDir) {
        prompts.log.error(
          `No ${theme.primary(".opencode")} directory found walking up from ${theme.primary(process.cwd())}`,
        );
        prompts.note(
          `Create one (or run OpenCode in this repo once), then re-run ${theme.code("spall integrate opencode")}.`,
        );
        return;
      }
      configDir = opencodeDir;
    }

    const existingConfig = pickExistingConfigPath(configDir);
    const configPath = existingConfig ?? join(configDir, "opencode.jsonc");

    if (!existsSync(configPath)) {
      const ok = await prompts.confirm({
        message: `Create ${theme.primary(configPath)}?`,
        initialValue: true,
      });
      if (prompts.isCancel(ok) || !ok) {
        prompts.cancel("Cancelled");
        return;
      }
      mkdirSync(dirname(configPath), { recursive: true });

      const initial = configPath.endsWith(".jsonc")
        ? `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["${HELLO_PLUGIN_PKG}"]
}\n`
        : JSON.stringify(
            {
              $schema: "https://opencode.ai/config.json",
              plugin: [HELLO_PLUGIN_PKG],
            },
            null,
            2,
          ) + "\n";

      writeFileSync(configPath, initial, "utf-8");
      prompts.outro(`Wrote ${theme.primary(configPath)}`);
      prompts.note("Restart OpenCode to load the plugin.");
      return;
    }

    const raw = readFileSync(configPath, "utf-8");
    if (raw.includes(HELLO_PLUGIN_PKG)) {
      prompts.outro(`Already configured in ${theme.primary(configPath)}`);
      return;
    }

    if (configPath.endsWith(".jsonc")) {
      prompts.log.warn(
        `Detected JSONC config at ${theme.primary(configPath)}. Automatic editing is disabled to preserve formatting/comments.`,
      );
      prompts.note(
        `Please add ${theme.code(`"${HELLO_PLUGIN_PKG}"`)} to the ${theme.code("plugin")} array in ${theme.primary(configPath)}.`,
      );
      prompts.note("Restart OpenCode to load the plugin.");
      return;
    }

    let config: any;
    try {
      config = JSON.parse(raw);
    } catch {
      prompts.log.error(`Failed to parse ${theme.primary(configPath)} as JSON`);
      return;
    }

    if (config == null || typeof config !== "object" || Array.isArray(config)) {
      prompts.log.error(
        `Unexpected config shape in ${theme.primary(configPath)}`,
      );
      return;
    }

    const existing = config.plugin;
    if (existing === undefined) {
      config.plugin = [];
    } else if (
      !Array.isArray(existing) ||
      existing.some((x: any) => typeof x !== "string")
    ) {
      prompts.log.error(
        `Expected ${theme.primary("plugin")} to be an array of strings in ${theme.primary(configPath)}`,
      );
      return;
    }

    if (!config.plugin.includes(HELLO_PLUGIN_PKG)) {
      config.plugin.push(HELLO_PLUGIN_PKG);
    }
    if (!config.$schema) {
      config.$schema = "https://opencode.ai/config.json";
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    prompts.outro(`Updated ${theme.primary(configPath)}`);
    prompts.note("Restart OpenCode to load the plugin.");
  },
};
