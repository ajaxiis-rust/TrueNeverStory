import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("quest-giver-agent");

interface QuestGiverContext {
  query: string;
  worldState: string;
  activeQuests: Array<{ title: string; status: string }>;
  nearbyNpcs: string[];
  playerLevel: number;
}

export class QuestGiverAgent {
  constructor(private llmQueue: LLMQueue) {}

  async generate(ctx: QuestGiverContext): Promise<string> {
    const prompt = this._buildPrompt(ctx);
    return this.llmQueue.generateText(prompt, TaskPriority.HIGH, 0.8, "quest-giver");
  }

  private _buildPrompt(ctx: QuestGiverContext): string {
    const activeQuests = ctx.activeQuests.length > 0
      ? ctx.activeQuests.map(q => `- ${q.title} (${q.status})`).join("\n")
      : "No active quests.";

    return `You are a Quest Giver for a fantasy world. Your role is to generate engaging quests based on the current world state.

World State:
${ctx.worldState}

Active Quests:
${activeQuests}

Nearby Characters: ${ctx.nearbyNpcs.join(", ") || "None"}
Player Level: ${ctx.playerLevel}

User Query: ${ctx.query}

Generate a quest that:
1. Fits the current world state and narrative
2. Is appropriate for the player's level
3. Has clear objectives
4. Offers meaningful rewards
5. Connects to existing story threads when possible`;
  }
}
