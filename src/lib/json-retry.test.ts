import { describe, it, expect } from "bun:test";
import { parseJsonWithRetry } from "./json-retry";

/**
 * Tests for JSON parse + retry logic from LLM responses.
 *
 * When the LLM returns non-JSON text, the system should retry with a stricter
 * prompt instead of immediately falling back to minimal data.
 */

describe("parseJsonWithRetry", () => {
  it("parses valid JSON on first attempt without calling generateText", async () => {
    let called = false;
    const generateText = async () => { called = true; return "should not happen"; };
    const result = await parseJsonWithRetry('{"ok": true}', generateText, "test");
    expect(result).toEqual({ ok: true });
    expect(called).toBe(false);
  });

  it("extracts JSON from markdown code fences without retry", async () => {
    let called = false;
    const generateText = async () => { called = true; return "nope"; };
    const text = '```json\n{"name": "test"}\n```';
    const result = await parseJsonWithRetry(text, generateText, "test");
    expect(result).toEqual({ name: "test" });
    expect(called).toBe(false);
  });

  it("extracts JSON from plain code fences without retry", async () => {
    let called = false;
    const generateText = async () => { called = true; return "nope"; };
    const text = '```\n{"name": "test"}\n```';
    const result = await parseJsonWithRetry(text, generateText, "test");
    expect(result).toEqual({ name: "test" });
    expect(called).toBe(false);
  });

  it("retries with stricter prompt when initial text is garbage", async () => {
    let retryCount = 0;
    const generateText = async (prompt: string): Promise<string> => {
      retryCount++;
      expect(prompt).toContain("CRITICAL");
      expect(prompt).toContain("ONLY");
      return '{"father": {"name": "Thorin"}}';
    };

    const result = await parseJsonWithRetry(
      "Sorry, I cannot generate that.",
      generateText,
      "Generate family tree",
      2,
    );
    expect(result).toEqual({ father: { name: "Thorin" } });
    expect(retryCount).toBe(1);
  });

  it("retries when initial text is truncated JSON", async () => {
    let retryCount = 0;
    const generateText = async (): Promise<string> => {
      retryCount++;
      return '{"name": "x", "age": 25}';
    };

    const result = await parseJsonWithRetry(
      '{"name": "x", "age":',
      generateText,
      "test",
      2,
    );
    expect(result).toEqual({ name: "x", age: 25 });
    expect(retryCount).toBe(1);
  });

  it("retries after code fence extraction also fails", async () => {
    let retryCount = 0;
    const generateText = async (): Promise<string> => {
      retryCount++;
      return '{"fixed": true}';
    };

    const result = await parseJsonWithRetry(
      '```json\n{broken}\n```',
      generateText,
      "test",
      2,
    );
    expect(result).toEqual({ fixed: true });
    expect(retryCount).toBe(1);
  });

  it("exhausts retries and throws on persistent invalid output", async () => {
    let retryCount = 0;
    const generateText = async (): Promise<string> => {
      retryCount++;
      return "Still not JSON.";
    };

    await expect(
      parseJsonWithRetry("bad", generateText, "Generate JSON", 2),
    ).rejects.toThrow("Failed to parse JSON");
    expect(retryCount).toBe(2);
  });

  it("succeeds on second retry after first retry also fails", async () => {
    let retryCount = 0;
    const generateText = async (): Promise<string> => {
      retryCount++;
      if (retryCount === 1) return "still bad";
      return '{"recovered": true}';
    };

    const result = await parseJsonWithRetry(
      "initial garbage",
      generateText,
      "test",
      2,
    );
    expect(result).toEqual({ recovered: true });
    expect(retryCount).toBe(2);
  });

  it("uses base prompt in retry instruction", async () => {
    const prompts: string[] = [];
    const generateText = async (prompt: string): Promise<string> => {
      prompts.push(prompt);
      return '{"ok": true}';
    };

    await parseJsonWithRetry("bad", generateText, "base prompt", 2);
    expect(prompts[0]).toContain("base prompt");
    expect(prompts[0]).toContain("CRITICAL");
    expect(prompts[0]).toContain("ONLY");
  });
});
