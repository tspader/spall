#!/usr/bin/env bun
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { ConfigSchemaZod, ProjectConfigSchemaZod } from "../src/config";

const SCHEMAS_DIR = join(dirname(import.meta.dirname), "src", "gen");

// Generate JSON schemas using Zod 4's native toJSONSchema() method
const configJsonSchema = ConfigSchemaZod.toJSONSchema({
  description: "Configuration schema for spall CLI",
});

const projectConfigJsonSchema = ProjectConfigSchemaZod.toJSONSchema({
  description: "Project-level configuration schema for spall",
});

// Ensure schemas directory exists
mkdirSync(SCHEMAS_DIR, { recursive: true });

// Write schemas to files
writeFileSync(
  join(SCHEMAS_DIR, "config.json"),
  JSON.stringify(configJsonSchema, null, 2),
);

writeFileSync(
  join(SCHEMAS_DIR, "project-config.json"),
  JSON.stringify(projectConfigJsonSchema, null, 2),
);

console.log(`Generated JSON schemas in ${SCHEMAS_DIR}`);
console.log("  - config.json");
console.log("  - project-config.json");
