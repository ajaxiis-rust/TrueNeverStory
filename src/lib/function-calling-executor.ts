/**
 * Function Calling Executor — smart wrapper that chooses strategy based on provider.
 *
 * For local providers (Ollama, llama.cpp): uses function calling (2 LLM calls)
 * For external providers (OpenAI, Google): pre-loads all context (1 LLM call)
 */

import type { LLMQueue } from '../lib/llm-queue';
import type { LLMProvider } from './providers';
import { isLocalProvider } from './providers';
import { getLogger } from '../utils/logger';

const log = getLogger('FunctionCallingExecutor');

export interface MCPTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface FunctionCallingOptions {
  /** System prompt for the LLM */
  systemPrompt: string;
  /** User prompt */
  userPrompt: string;
  /** Available MCP tools */
  tools: MCPTool[];
  /** Agent ID for LLMQueue */
  agentId: string;
  /** Provider to check if local */
  provider?: LLMProvider;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
}

/**
 * Execute a prompt with smart function calling strategy.
 *
 * - Local provider: LLM decides which tools to call (2 LLM calls)
 * - External provider: Pre-load all tool results (1 LLM call)
 */
export async function executeWithTools(
  llmQueue: LLMQueue,
  options: FunctionCallingOptions,
): Promise<string> {
  const { systemPrompt, userPrompt, tools, agentId, provider, temperature = 0.7, maxTokens = 2048 } = options;

  // Check if provider is local
  const isLocal = provider ? isLocalProvider(provider.type ?? '') : false;

  if (isLocal) {
    // Local provider: use function calling (2 LLM calls)
    return executeWithFunctionCalling(llmQueue, options);
  } else {
    // External provider: pre-load all tool results (1 LLM call)
    return executeWithPreloadedContext(llmQueue, options);
  }
}

/**
 * Strategy 1: Function calling (for local providers)
 * LLM decides which tools to call → execute → feed results back
 */
async function executeWithFunctionCalling(
  llmQueue: LLMQueue,
  options: FunctionCallingOptions,
): Promise<string> {
  const { systemPrompt, userPrompt, tools, agentId, temperature, maxTokens } = options;

  // Build tool descriptions for the prompt
  const toolDescriptions = tools.map(t =>
    `- ${t.name}: ${t.description}`
  ).join('\n');

  // First LLM call: ask which tools to use
  const toolPrompt = `${systemPrompt}

## Available Tools
${toolDescriptions}

## User Request
${userPrompt}

Respond in EXACTLY this JSON format (no other text):
{
  "reasoning": "brief explanation of what tools you need",
  "tools_to_call": [
    {"name": "tool_name", "args": {"key": "value"}}
  ],
  "response": "your response if no tools needed"
}

If you don't need any tools, set "tools_to_call" to an empty array and put your full response in "response".`;

  const firstResult = await llmQueue.generateJson(toolPrompt, 1, temperature, agentId);

  // If no tools needed, return response directly
  const toolsToCall = firstResult.tools_to_call as Array<{ name: string; args: Record<string, unknown> }> | undefined;
  if (!toolsToCall || toolsToCall.length === 0) {
    return (firstResult.response as string) ?? '';
  }

  // Execute requested tools
  const toolResults: Record<string, unknown> = {};
  for (const call of toolsToCall) {
    const tool = tools.find(t => t.name === call.name);
    if (tool) {
      try {
        toolResults[call.name] = await tool.execute(call.args ?? {});
      } catch (err) {
        log.warn({ tool: call.name, err }, 'Tool execution failed');
        toolResults[call.name] = { error: 'Tool execution failed' };
      }
    }
  }

  // Second LLM call: generate response with tool results
  const resultPrompt = `${systemPrompt}

## User Request
${userPrompt}

## Tool Results
${JSON.stringify(toolResults, null, 2)}

Generate your response based on the tool results above.`;

  return llmQueue.generateText(resultPrompt, 1, temperature, agentId, undefined);
}

/**
 * Strategy 2: Pre-loaded context (for external providers)
 * Execute all tools upfront → include results in single LLM call
 */
async function executeWithPreloadedContext(
  llmQueue: LLMQueue,
  options: FunctionCallingOptions,
): Promise<string> {
  const { systemPrompt, userPrompt, tools, agentId, temperature, maxTokens } = options;

  // Execute all tools in parallel
  const toolResults: Record<string, unknown> = {};
  await Promise.all(
    tools.map(async (tool) => {
      try {
        toolResults[tool.name] = await tool.execute({});
      } catch (err) {
        log.warn({ tool: tool.name, err }, 'Tool execution failed');
        toolResults[tool.name] = { error: 'Tool execution failed' };
      }
    })
  );

  // Single LLM call with all context
  const prompt = `${systemPrompt}

## Context (pre-loaded from tools)
${JSON.stringify(toolResults, null, 2)}

## User Request
${userPrompt}

Generate your response based on the context above.`;

  return llmQueue.generateText(prompt, 1, temperature, agentId, undefined);
}
