/**
 * Unified Agent Interface — common contract for all LLM agents.
 * Provides consistent lifecycle, configuration, and invocation patterns.
 */

import { TaskPriority } from "../models/director";

export interface AgentContext {
  [key: string]: unknown;
}

export interface AgentResponse {
  text: string;
  agentId: string;
  agentName: string;
  tokens?: { prompt: number; completion: number };
}

export interface AgentConfig {
  id: string;
  name: string;
  priority: TaskPriority;
  temperature: number;
  maxTokens?: number;
}

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly priority: TaskPriority;
  readonly temperature: number;

  generate(ctx: AgentContext): Promise<AgentResponse>;
  generateServiceMessage?(ctx: AgentContext): Promise<string>;
}
