import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Store } from "./store";
import { Model } from "./model";
import { Config } from "./config";
import { Io } from "./io";

// Shared cache directory for all tests (models downloaded once)
const TEST_CACHE_DIR = resolve(__dirname, "../../../.cache");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Store integration (with model)", () => {
  let tmpDir: string;
  let dbPath: string;
  let notesDir: string;

  beforeAll(async () => {
    mkdirSync(TEST_CACHE_DIR, { recursive: true });
    process.env.SPALL_CACHE_DIR = TEST_CACHE_DIR;
    Config.reset();

    Model.init();
    await Model.download();
  });

  afterAll(async () => {
    // Don't dispose model - it's shared across test files
  });

  beforeEach(() => {
    Io.clear();
    tmpDir = mkdtempSync(join(tmpdir(), "spall-integration-"));
    dbPath = join(tmpDir, "test.db");
    notesDir = join(tmpDir, "notes");
    mkdirSync(notesDir, { recursive: true });
    Store.create(dbPath);
  });

  afterEach(() => {
    Store.close();
    rmSync(tmpDir, { recursive: true });
  });

  test("full index and search cycle", async () => {
    // Create test files
    writeFileSync(
      join(notesDir, "cooking.md"),
      "How to make pasta with tomato sauce",
    );
    writeFileSync(
      join(notesDir, "programming.md"),
      "Writing TypeScript functions",
    );

    // Scan and embed
    const result = await Store.scan(notesDir);
    await Store.embedFiles(notesDir, result.unembedded);

    // Verify both files are marked embedded
    expect(Store.getFile("cooking.md")?.embedded).toBe(true);
    expect(Store.getFile("programming.md")?.embedded).toBe(true);

    // Search for cooking-related content
    const query = await Model.embed("italian food recipes");
    const results = Store.vsearch(query, 2);

    // cooking.md should rank higher than programming.md
    expect(results[0]!.key).toBe("cooking.md");
  });

  test("modified file gets re-embedded", async () => {
    writeFileSync(
      join(notesDir, "note.md"),
      "original content about gardening",
    );
    const result1 = await Store.scan(notesDir);
    await Store.embedFiles(notesDir, result1.unembedded);
    expect(Store.getFile("note.md")?.embedded).toBe(true);

    // Modify file
    await sleep(10);
    writeFileSync(
      join(notesDir, "note.md"),
      "completely different topic about quantum physics",
    );
    Io.clear();

    const result2 = await Store.scan(notesDir);
    expect(result2.modified).toEqual(["note.md"]);
    expect(Store.getFile("note.md")?.embedded).toBe(false); // reset by scan
  });

  test("removed file cleans up embeddings", async () => {
    writeFileSync(join(notesDir, "temp.md"), "temporary note content");
    const result = await Store.scan(notesDir);
    await Store.embedFiles(notesDir, result.unembedded);

    // Verify embeddings exist
    const db = Store.get();
    let count = db
      .prepare("SELECT COUNT(*) as c FROM embeddings WHERE key = ?")
      .get("temp.md") as { c: number };
    expect(count.c).toBeGreaterThan(0);

    let vecCount = db
      .prepare("SELECT COUNT(*) as c FROM vectors WHERE key LIKE ?")
      .get("temp.md:%") as { c: number };
    expect(vecCount.c).toBeGreaterThan(0);

    // Remove file
    rmSync(join(notesDir, "temp.md"));
    Io.clear();
    await Store.scan(notesDir);

    // Verify cleanup
    count = db
      .prepare("SELECT COUNT(*) as c FROM embeddings WHERE key = ?")
      .get("temp.md") as { c: number };
    expect(count.c).toBe(0);

    vecCount = db
      .prepare("SELECT COUNT(*) as c FROM vectors WHERE key LIKE ?")
      .get("temp.md:%") as { c: number };
    expect(vecCount.c).toBe(0);
  });

  test("chunking works for larger documents", async () => {
    // Create a document large enough to require multiple chunks
    const longContent = Array(100)
      .fill(
        "This is a paragraph about machine learning and neural networks.\n\n",
      )
      .join("");
    writeFileSync(join(notesDir, "long.md"), longContent);

    const result = await Store.scan(notesDir);
    await Store.embedFiles(notesDir, result.unembedded);

    // Verify file is embedded
    expect(Store.getFile("long.md")?.embedded).toBe(true);

    // Verify multiple chunks were created
    const db = Store.get();
    const count = db
      .prepare("SELECT COUNT(*) as c FROM embeddings WHERE key = ?")
      .get("long.md") as { c: number };
    expect(count.c).toBeGreaterThan(1);
  });

  test("search returns relevant results across multiple files", async () => {
    writeFileSync(
      join(notesDir, "dogs.md"),
      "Dogs are loyal pets that love to play fetch and go for walks.",
    );
    writeFileSync(
      join(notesDir, "cats.md"),
      "Cats are independent animals that enjoy napping and hunting mice.",
    );
    writeFileSync(
      join(notesDir, "cars.md"),
      "Electric vehicles are becoming more popular due to environmental concerns.",
    );

    const result = await Store.scan(notesDir);
    await Store.embedFiles(notesDir, result.unembedded);

    // Search for pet-related content
    const query = await Model.embed("furry household animals as companions");
    const results = Store.vsearch(query, 3);

    // Both pet files should rank above cars
    const keys = results.map((r) => r.key);
    const carsIndex = keys.indexOf("cars.md");
    const dogsIndex = keys.indexOf("dogs.md");
    const catsIndex = keys.indexOf("cats.md");

    expect(dogsIndex).toBeLessThan(carsIndex);
    expect(catsIndex).toBeLessThan(carsIndex);
  });
});
