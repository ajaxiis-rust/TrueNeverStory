import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("lorekeeper-agent");

interface LorekeeperContext {
  query: string;
  worldFacts: string[];
  magicSystem: string;
  races: string[];
}

export class LorekeeperAgent {
  constructor(private llmQueue: LLMQueue) {}

  async generate(ctx: LorekeeperContext): Promise<string> {
    const prompt = this._buildPrompt(ctx);
    return this.llmQueue.generateText(prompt, TaskPriority.NORMAL, 0.4, "lorekeeper");
  }

  private _buildPrompt(ctx: LorekeeperContext): string {
    const facts = ctx.worldFacts.length > 0
      ? ctx.worldFacts.join("\n")
      : "No established lore.";

    const races = ctx.races.length > 0
      ? ctx.races.join(", ")
      : "No race information.";

    return `You are a Lorekeeper for a fantasy world. Your role is to maintain and recall world facts, magic rules, race information, and established canon.

Established Lore:
${facts}

Magic System:
${ctx.magicSystem || "Not defined."}

Known Races: ${races}

User Query: ${ctx.query}

Provide accurate lore information. Never contradict established facts. If something is unknown, acknowledge it rather than inventing.`;
  }
}
