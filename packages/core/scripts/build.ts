#!/usr/bin/env bun
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { ConfigSchemaZod, WorkspaceConfigSchemaZod } from "../src/config";

const SCHEMAS_DIR = join(dirname(import.meta.dirname), "src", "gen");

// Generate JSON schemas using Zod 4's native toJSONSchema() method
const configJsonSchema = ConfigSchemaZod.toJSONSchema();

const workspaceConfigJsonSchema = WorkspaceConfigSchemaZod.toJSONSchema();

// Ensure schemas directory exists
mkdirSync(SCHEMAS_DIR, { recursive: true });

// Write schemas to files
writeFileSync(
  join(SCHEMAS_DIR, "config.json"),
  JSON.stringify(configJsonSchema, null, 2),
);

writeFileSync(
  join(SCHEMAS_DIR, "workspace-config.json"),
  JSON.stringify(workspaceConfigJsonSchema, null, 2),
);

console.log(`Generated JSON schemas in ${SCHEMAS_DIR}`);
console.log("  - config.json");
console.log("  - workspace-config.json");
