#!/usr/bin/env bun

/**
 * SDK Build Script
 *
 * 1. Imports openapi() from @spall/core to generate OpenAPI spec
 * 2. Writes spec to openapi.json
 * 3. Runs @hey-api/openapi-ts to generate TypeScript SDK
 */

import { $ } from "bun";
import path from "path";
import { openapi } from "@spall/core";

const dir = new URL("..", import.meta.url).pathname;
process.chdir(dir);

console.log("Generating OpenAPI spec...");
const spec = await openapi();
await Bun.write("./openapi.json", JSON.stringify(spec, null, 2));
console.log("Wrote openapi.json");

console.log("Generating TypeScript SDK...");
const { createClient } = await import("@hey-api/openapi-ts");

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/gen",
    clean: true,
  },
  plugins: [
    { name: "@hey-api/typescript" },
    { name: "@hey-api/sdk", instance: "SpallClient" },
    { name: "@hey-api/client-fetch" },
  ],
});

console.log("Formatting generated code...");
await $`bun prettier --write src/gen`.quiet();

console.log("SDK generation complete!");
