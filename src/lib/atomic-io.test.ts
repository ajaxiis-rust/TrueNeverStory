import { describe, it, expect, afterEach } from "bun:test";
import { atomicWriteJson, readJsonFileSync } from "./atomic-io";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "hibring-test-atomic");
const TEST_FILE = join(TEST_DIR, "test.json");

afterEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
});

describe("atomicWriteJson", () => {
  it("writes JSON file", async () => {
    await atomicWriteJson(TEST_FILE, { hello: "world" });
    expect(existsSync(TEST_FILE)).toBe(true);
  });

  it("writes valid JSON content", async () => {
    const data = { name: "test", count: 42, items: [1, 2, 3] };
    await atomicWriteJson(TEST_FILE, data);
    const content = readJsonFileSync<typeof data>(TEST_FILE);
    expect(content).toEqual(data);
  });

  it("creates parent directories", async () => {
    const nested = join(TEST_DIR, "a", "b", "c", "file.json");
    await atomicWriteJson(nested, { nested: true });
    expect(existsSync(nested)).toBe(true);
    try { unlinkSync(nested); } catch {}
    try { require("node:fs").rmdirSync(join(TEST_DIR, "a"), { recursive: true }); } catch {}
  });

  it("overwrites existing file", async () => {
    await atomicWriteJson(TEST_FILE, { v: 1 });
    await atomicWriteJson(TEST_FILE, { v: 2 });
    const content = readJsonFileSync<{ v: number }>(TEST_FILE);
    expect(content?.v).toBe(2);
  });

  it("handles null and undefined gracefully", async () => {
    await atomicWriteJson(TEST_FILE, null);
    const content = readJsonFileSync(TEST_FILE);
    expect(content).toBeNull();
  });
});

describe("readJsonFileSync", () => {
  it("reads valid JSON", async () => {
    await atomicWriteJson(TEST_FILE, { key: "value" });
    const result = readJsonFileSync<{ key: string }>(TEST_FILE);
    expect(result?.key).toBe("value");
  });

  it("returns null for nonexistent file", () => {
    const result = readJsonFileSync("/nonexistent/path/file.json");
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(TEST_FILE, "not json at all", "utf-8");
    const result = readJsonFileSync(TEST_FILE);
    expect(result).toBeNull();
  });

  it("returns null for empty file", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(TEST_FILE, "", "utf-8");
    const result = readJsonFileSync(TEST_FILE);
    expect(result).toBeNull();
  });
});
