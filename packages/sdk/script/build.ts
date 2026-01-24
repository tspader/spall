#!/usr/bin/env bun

import { $ } from "bun";
import { App } from "@spall/sdk";

const dir = new URL("..", import.meta.url).pathname;
process.chdir(dir);

console.log("Generating OpenAPI spec...");
const spec = await App.spec();
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
    { name: "@hey-api/sdk", instance: "SpallClient", paramsStructure: "flat" },
    { name: "@hey-api/client-fetch" },
  ],
});

console.log("Formatting generated code...");
await $`bun prettier --write src/gen`.quiet();

console.log("SDK generation complete!");
