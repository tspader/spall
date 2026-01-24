import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { Server, index, search } from "./server";
import { Config } from "./config";
import { Model } from "./model";
import { Event, type Event as EventType } from "./event";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

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

describe("Server API", () => {
  test("index emits events", async () => {
    const events: EventType[] = [];
    const unsub = Event.listen((e) => events.push(e));

    await index({ directory: projectDir });

    unsub();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.tag === "scan")).toBe(true);
  });

  test("search returns results", async () => {
    const results = await search({
      directory: projectDir,
      query: "test query",
    });
    expect(results).toEqual([]);
  });
});

describe("Server HTTP", () => {
  test("starts on random port and writes lock", async () => {
    const { port } = await Server.start({ persist: true });

    expect(port).toBeGreaterThan(0);
    expect(existsSync(Server.Lock.path())).toBe(true);

    const lock = Server.Lock.read();
    expect(lock).not.toBeNull();
    expect(lock!.port).toBe(port);
  });

  test("health endpoint responds", async () => {
    const { port } = await Server.start({ persist: true });

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("ok");
  });

  test("search endpoint returns JSON", async () => {
    const { port } = await Server.start({ persist: true });

    const response = await fetch(`http://127.0.0.1:${port}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: projectDir, query: "test" }),
    });

    expect(response.ok).toBe(true);
    const results = await response.json();
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("Server.Lock", () => {
  test("write creates lock file", async () => {
    expect(Server.Lock.write(12345)).toBe(true);
    expect(existsSync(Server.Lock.path())).toBe(true);

    const lock = Server.Lock.read();
    expect(lock).not.toBeNull();
    expect(lock!.port).toBe(12345);
  });

  test("write fails if lock exists", async () => {
    expect(Server.Lock.write(12345)).toBe(true);
    expect(Server.Lock.write(54321)).toBe(false);
  });

  test("remove deletes lock file", async () => {
    Server.Lock.write(12345);
    expect(existsSync(Server.Lock.path())).toBe(true);

    Server.Lock.remove();
    expect(existsSync(Server.Lock.path())).toBe(false);
  });
});

describe("Server auto-shutdown", () => {
  test("server shuts down after last request when persist=false", async () => {
    let shutdownCalled = false;
    const { port } = await Server.start({
      persist: false,
      onShutdown: () => {
        shutdownCalled = true;
      },
    });

    // Make a request
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.ok).toBe(true);

    // Wait for shutdown timer (100ms) + buffer
    await Bun.sleep(200);

    expect(shutdownCalled).toBe(true);
    expect(existsSync(Server.Lock.path())).toBe(false);
  });

  test("server stays alive when persist=true", async () => {
    let shutdownCalled = false;
    const { port } = await Server.start({
      persist: true,
      onShutdown: () => {
        shutdownCalled = true;
      },
    });

    // Make a request
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.ok).toBe(true);

    // Wait longer than shutdown timer
    await Bun.sleep(200);

    expect(shutdownCalled).toBe(false);
    expect(existsSync(Server.Lock.path())).toBe(true);

    // Server should still respond
    const response2 = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response2.ok).toBe(true);
  });
});
