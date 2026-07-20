import { describe, it, expect } from "bun:test";
import type { LLMClientOptions } from "./llm-client";

describe("LLMClientOptions", () => {
  it("supports useTranslationModel flag", () => {
    const options: LLMClientOptions = {
      agentId: "test",
      useTranslationModel: true,
    };
    expect(options.useTranslationModel).toBe(true);
  });

  it("defaults useTranslationModel to undefined", () => {
    const options: LLMClientOptions = {
      agentId: "test",
    };
    expect(options.useTranslationModel).toBeUndefined();
  });
});
