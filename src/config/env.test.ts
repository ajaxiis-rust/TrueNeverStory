import { describe, test, expect, beforeEach } from "bun:test";
import { loadConfig, getConfig, isLLMConfigured, getLLMConfig } from "./env";

beforeEach(() => {
  // Reset the cached config so each test gets fresh parse
  // We can't directly reset _config, but loadConfig uses safeParse which is fine
});

describe("env config", () => {
  test("loadConfig returns object with defaults", () => {
    const cfg = loadConfig();
    expect(cfg).toBeDefined();
    expect(typeof cfg.WORLD_SERVER_HOST).toBe("string");
    expect(typeof cfg.WORLD_SERVER_PORT).toBe("number");
    expect(typeof cfg.WORLD_LLM_TIMEOUT).toBe("number");
    expect(typeof cfg.WORLD_LLM_MAX_TOKENS).toBe("number");
  });

  test("defaults are reasonable", () => {
    const cfg = loadConfig();
    expect(cfg.WORLD_LLM_TIMEOUT).toBeGreaterThanOrEqual(60);
    expect(cfg.WORLD_LLM_MAX_TOKENS).toBeGreaterThan(0);
    expect(cfg.WORLD_LLM_TEMPERATURE).toBeGreaterThan(0);
    expect(cfg.WORLD_LLM_TEMPERATURE).toBeLessThanOrEqual(2);
    expect(cfg.WORLD_LLM_MAX_RETRIES).toBeGreaterThanOrEqual(0);
  });

  test("getConfig returns same instance", () => {
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b);
  });

  test("isLLMConfigured returns boolean", () => {
    expect(typeof isLLMConfigured()).toBe("boolean");
  });

  test("getLLMConfig returns expected shape", () => {
    const cfg = getLLMConfig();
    expect(cfg).toHaveProperty("baseUrl");
    expect(cfg).toHaveProperty("model");
    expect(cfg).toHaveProperty("timeout");
    expect(cfg).toHaveProperty("maxTokens");
    expect(cfg).toHaveProperty("apiKeySet");
    expect(typeof cfg.apiKeySet).toBe("boolean");
  });
});
