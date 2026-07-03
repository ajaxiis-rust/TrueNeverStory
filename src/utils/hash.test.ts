import { describe, test, expect } from "bun:test";
import { sha256, sha256Short } from "./hash";

describe("sha256", () => {
  test("returns 64-char hex string", async () => {
    const result = await sha256("hello");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    const a = await sha256("test input");
    const b = await sha256("test input");
    expect(a).toBe(b);
  });

  test("produces different hashes for different inputs", async () => {
    const a = await sha256("hello");
    const b = await sha256("world");
    expect(a).not.toBe(b);
  });
});

describe("sha256Short", () => {
  test("returns truncated hash", async () => {
    const result = await sha256Short("hello", 16);
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  test("is prefix of full hash", async () => {
    const full = await sha256("test");
    const short = await sha256Short("test", 32);
    expect(full.startsWith(short)).toBe(true);
  });

  test("defaults to 16 chars", async () => {
    const result = await sha256Short("hello");
    expect(result).toHaveLength(16);
  });
});
