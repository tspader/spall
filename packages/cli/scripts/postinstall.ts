#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getConfigDir(): string {
  const os = platform();

  if (os === "win32") {
    const appData =
      process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "spall");
  } else {
    const configHome =
      process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(configHome, "spall");
  }
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = join(CONFIG_DIR, "spall.json");
const SCHEMA_FILE = join(CONFIG_DIR, "schema.json");

// Ensure config directory exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

// Copy schema from package to config directory
const PACKAGE_SCHEMA_PATH = join(
  __dirname,
  "..",
  "..",
  "core",
  "src",
  "gen",
  "config.json",
);
if (existsSync(PACKAGE_SCHEMA_PATH)) {
  copyFileSync(PACKAGE_SCHEMA_PATH, SCHEMA_FILE);
}

if (!existsSync(CONFIG_FILE)) {
  const defaultConfig = {
    $schema: SCHEMA_FILE,
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created default config at ${CONFIG_FILE}`);
}
