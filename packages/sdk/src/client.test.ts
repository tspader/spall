import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Server, Config, Model } from "@spall/core";
import { spall, type InitResponse, type IndexResponse } from "./index";

// Shared cache directory for all tests (models downloaded once)
const TEST_CACHE_DIR = resolve(__dirname, "../../../.cache");

// Per-test project directory
let projectDir: string;

beforeAll(async () => {
  mkdirSync(TEST_CACHE_DIR, { recursive: true });
  process.env.SPALL_CACHE_DIR = TEST_CACHE_DIR;
  Config.reset();

  // Download models once for all tests
  Model.init();
  await Model.download();
});

afterAll(async () => {
  // Don't dispose model - it's shared across test files
  // Just clean up env
  delete process.env.SPALL_CACHE_DIR;
  Config.reset();
});

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "spall-project-"));
});

afterEach(() => {
  Server.stop();
  Server.Lock.remove();
  try {
    rmSync(projectDir, { recursive: true });
  } catch {}
});

describe("SDK SSE endpoints", () => {
  test("/init streams events and completes", async () => {
    const { port } = await Server.start({ persist: true });
    const baseUrl = `http://127.0.0.1:${port}`;
    const client = spall({ baseUrl });

    const { stream } = await client.init({ body: { directory: projectDir } });

    const events: InitResponse[] = [];
    for await (const event of stream) {
      events.push(event as InitResponse);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.tag === "init" && e.action === "done")).toBe(
      true,
    );
  });

  test("/index streams events and completes", async () => {
    const { port } = await Server.start({ persist: true });
    const baseUrl = `http://127.0.0.1:${port}`;
    const client = spall({ baseUrl });

    // Init first to create .spall directory
    const { stream: initStream } = await client.init({
      body: { directory: projectDir },
    });
    for await (const _ of initStream) {
    }

    // Now test index
    const { stream } = await client.index({ body: { directory: projectDir } });

    const events: IndexResponse[] = [];
    for await (const event of stream) {
      events.push(event as IndexResponse);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.tag === "scan")).toBe(true);
  });

  test("SSE stream returns proper headers", async () => {
    const { port } = await Server.start({ persist: true });

    const response = await fetch(`http://127.0.0.1:${port}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: projectDir }),
    });

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");

    // Consume the stream to avoid hanging
    for await (const _ of response.body!) {
    }
  });
});

describe("SDK auto-shutdown with SSE", () => {
  test("server stays alive during SSE stream", async () => {
    let shutdownCalled = false;
    const { port } = await Server.start({
      persist: false,
      onShutdown: () => {
        shutdownCalled = true;
      },
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    const client = spall({ baseUrl });

    // Start init but don't consume yet
    const { stream } = await client.init({ body: { directory: projectDir } });

    // Wait longer than the shutdown timeout (100ms)
    await Bun.sleep(200);

    // Server should still be alive because SSE stream is open
    expect(shutdownCalled).toBe(false);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.ok).toBe(true);

    // Now consume the stream
    for await (const _ of stream) {
    }
  });

  test("server shuts down after SSE stream completes", async () => {
    let shutdownCalled = false;
    const { port } = await Server.start({
      persist: false,
      onShutdown: () => {
        shutdownCalled = true;
      },
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    const client = spall({ baseUrl });

    // Consume the full SSE stream
    const { stream } = await client.init({ body: { directory: projectDir } });
    for await (const _ of stream) {
    }

    // Wait for shutdown timer (100ms) + buffer
    await Bun.sleep(200);

    expect(shutdownCalled).toBe(true);
  });
});
