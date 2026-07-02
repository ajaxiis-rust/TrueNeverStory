import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("historian-agent");

interface HistorianContext {
  query: string;
  worldHistory: string[];
  relevantEvents: string[];
  worldRules: string[];
}

export class HistorianAgent {
  constructor(private llmQueue: LLMQueue) {}

  async generate(ctx: HistorianContext): Promise<string> {
    const prompt = this._buildPrompt(ctx);
    return this.llmQueue.generateText(prompt, TaskPriority.NORMAL, 0.7, "historian");
  }

  private _buildPrompt(ctx: HistorianContext): string {
    const history = ctx.worldHistory.length > 0
      ? ctx.worldHistory.join("\n")
      : "No recorded history yet.";

    const events = ctx.relevantEvents.length > 0
      ? ctx.relevantEvents.join("\n")
      : "No relevant events.";

    return `You are a Historian for a fantasy world. Your role is to recall and narrate historical events, lore, and chronology.

World History:
${history}

Recent Relevant Events:
${events}

World Rules:
${ctx.worldRules.join("\n")}

User Query: ${ctx.query}

Respond with historically accurate information. If you don't know, say so rather than fabricating.`;
  }
}
