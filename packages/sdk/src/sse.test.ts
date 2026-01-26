import { test, expect, beforeAll, afterAll } from "bun:test";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { Config, Bus } from "@spall/core";
import { Server } from "./server";

let testDir: string;
let port: number;

beforeAll(async () => {
  // Use repo .cache for models (avoids download), temp dir for data/lock
  testDir = mkdtempSync(join(tmpdir(), "spall-sse-test-"));
  Config.set({
    dirs: {
      cache: join(import.meta.dir, "../../../..", ".cache"),
      data: join(testDir, "data"),
    },
  });

  const result = await Server.start({ persist: true });
  port = result.port;
});

afterAll(() => {
  Server.stop();
  Config.reset();
  rmSync(testDir, { recursive: true, force: true });
});

test("/events receives published events", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/events`);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  // First read gets the "sse.connected" event
  const connected = await reader.read();
  expect(decoder.decode(connected.value)).toContain("sse.connected");

  // Publish event directly - no model/db needed
  await Bus.publish({ tag: "store.create", path: "/test" });

  const { value } = await reader.read();
  const text = decoder.decode(value);

  expect(text).toContain("store.create");
  expect(text).toContain("/test");

  reader.cancel();
});

test("/events cleans up on disconnect", async () => {
  const controller = new AbortController();
  const fetchPromise = fetch(`http://127.0.0.1:${port}/events`, {
    signal: controller.signal,
  }).catch(() => {}); // ignore abort error

  await Bun.sleep(100); // let it connect

  controller.abort();

  await Bun.sleep(100); // let cleanup run

  // Verify server still healthy
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  expect(response.ok).toBe(true);
});

test("/events broadcasts to multiple subscribers", async () => {
  const responses = await Promise.all([
    fetch(`http://127.0.0.1:${port}/events`),
    fetch(`http://127.0.0.1:${port}/events`),
    fetch(`http://127.0.0.1:${port}/events`),
  ]);

  const readers = responses.map((r) => r.body!.getReader());
  const decoder = new TextDecoder();

  // First read gets the "connected" event for each
  await Promise.all(readers.map((r) => r.read()));

  await Bus.publish({ tag: "store.create", path: "/multi-test" });

  const results = await Promise.all(readers.map((r) => r.read()));

  for (const { value } of results) {
    const text = decoder.decode(value);
    expect(text).toContain("store.create");
    expect(text).toContain("/multi-test");
  }

  readers.forEach((r) => r.cancel());
});
