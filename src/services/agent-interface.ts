/**
 * Unified Agent Interface — common contract for all LLM agents.
 * Provides consistent lifecycle, configuration, and invocation patterns.
 */

import type { LLMQueue } from "../lib/llm-queue";
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

export abstract class BaseAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly priority: TaskPriority;
  readonly temperature: number;

  protected readonly llmQueue: LLMQueue;

  constructor(config: AgentConfig, llmQueue: LLMQueue) {
    this.id = config.id;
    this.name = config.name;
    this.priority = config.priority;
    this.temperature = config.temperature;
    this.llmQueue = llmQueue;
  }

  abstract generate(ctx: AgentContext): Promise<AgentResponse>;

  async generateServiceMessage(ctx: AgentContext): Promise<string> {
    const response = await this.generate(ctx);
    return response.text;
  }

  protected async callLLM(prompt: string, opts?: { priority?: TaskPriority; temperature?: number }): Promise<string> {
    return this.llmQueue.generateText(
      prompt,
      opts?.priority ?? this.priority,
      opts?.temperature ?? this.temperature,
      this.id,
    );
  }
}

export const AGENT_CONFIGS = {
  narrator: { id: "narrator", name: "Narrator", priority: TaskPriority.HIGH, temperature: 0.8 },
  npc: { id: "npc", name: "NPC Agent", priority: TaskPriority.HIGH, temperature: 0.7 },
  director: { id: "director", name: "Director", priority: TaskPriority.HIGH, temperature: 0.7 },
  scene: { id: "scene", name: "Scene Generator", priority: TaskPriority.HIGH, temperature: 0.8 },
  researcher: { id: "researcher", name: "Researcher", priority: TaskPriority.LOW, temperature: 0.3 },
  historian: { id: "historian", name: "Historian", priority: TaskPriority.NORMAL, temperature: 0.5 },
  cartographer: { id: "cartographer", name: "Cartographer", priority: TaskPriority.LOW, temperature: 0.4 },
  merchant: { id: "merchant", name: "Merchant", priority: TaskPriority.NORMAL, temperature: 0.6 },
  "quest-giver": { id: "quest-giver", name: "Quest Giver", priority: TaskPriority.HIGH, temperature: 0.7 },
  lorekeeper: { id: "lorekeeper", name: "Lorekeeper", priority: TaskPriority.NORMAL, temperature: 0.4 },
  crafter: { id: "crafter", name: "Crafter", priority: TaskPriority.LOW, temperature: 0.9 },
} as const;

export type AgentId = keyof typeof AGENT_CONFIGS;
