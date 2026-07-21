import { describe, it, expect, mock } from "bun:test";
import { executeWithTools, type MCPTool } from "./function-calling-executor";
import type { LLMQueue } from "./llm-queue";
import type { LLMProvider } from "./providers";

function createMockQueue(overrides: Partial<LLMQueue> = {}): LLMQueue {
  return {
    generateText: mock(() => Promise.resolve("generated text")),
    generateJson: mock(() => Promise.resolve({ tools_to_call: [], response: "no tools needed" })),
    ...overrides,
  } as unknown as LLMQueue;
}

function createMockProvider(type: string): LLMProvider {
  return { type, id: "test", name: "Test" } as unknown as LLMProvider;
}

describe("FunctionCallingExecutor", () => {
  const tools: MCPTool[] = [
    {
      name: "query_entity",
      description: "Query an entity by name",
      execute: mock(() => Promise.resolve({ uid: "npc_001", name: "Blacksmith" })),
    },
    {
      name: "get_relationships",
      description: "Get entity relationships",
      execute: mock(() => Promise.resolve({ relationships: [] })),
    },
  ];

  describe("executeWithTools", () => {
    it("uses function calling for local provider (ollama)", async () => {
      const generateJson = mock(() => Promise.resolve({
        reasoning: "Need entity info",
        tools_to_call: [{ name: "query_entity", args: { name: "Blacksmith" } }],
        response: null,
      }));
      const generateText = mock(() => Promise.resolve("The blacksmith is at the forge."));
      const llmQueue = createMockQueue({ generateJson, generateText });
      const provider = createMockProvider("ollama");

      const result = await executeWithTools(llmQueue, {
        systemPrompt: "You are a narrator.",
        userPrompt: "Go to the blacksmith",
        tools,
        agentId: "narrator",
        provider,
      });

      expect(generateJson).toHaveBeenCalledTimes(1);
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(result).toBe("The blacksmith is at the forge.");
    });

    it("pre-loads context for external provider (openai)", async () => {
      const generateText = mock(() => Promise.resolve("The blacksmith is at the forge."));
      const llmQueue = createMockQueue({ generateText });
      const provider = createMockProvider("openai");

      const result = await executeWithTools(llmQueue, {
        systemPrompt: "You are a narrator.",
        userPrompt: "Go to the blacksmith",
        tools,
        agentId: "narrator",
        provider,
      });

      // Should call generateText only once (with pre-loaded context)
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(result).toBe("The blacksmith is at the forge.");
    });

    it("skips function calling when LLM says no tools needed", async () => {
      const generateJson = mock(() => Promise.resolve({
        reasoning: "No tools needed",
        tools_to_call: [],
        response: "You walk to the blacksmith.",
      }));
      const llmQueue = createMockQueue({ generateJson });
      const provider = createMockProvider("ollama");

      const result = await executeWithTools(llmQueue, {
        systemPrompt: "You are a narrator.",
        userPrompt: "Go to the blacksmith",
        tools,
        agentId: "narrator",
        provider,
      });

      // Should only call generateJson once (no second call needed)
      expect(generateJson).toHaveBeenCalledTimes(1);
      expect(result).toBe("You walk to the blacksmith.");
    });
  });
});
