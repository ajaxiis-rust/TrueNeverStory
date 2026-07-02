import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("cartographer-agent");

interface CartographerContext {
  query: string;
  locations: Array<{ name: string; description: string; connections: string[] }>;
  currentLocation: string;
}

export class CartographerAgent {
  constructor(private llmQueue: LLMQueue) {}

  async generate(ctx: CartographerContext): Promise<string> {
    const prompt = this._buildPrompt(ctx);
    return this.llmQueue.generateText(prompt, TaskPriority.LOW, 0.3, "cartographer");
  }

  private _buildPrompt(ctx: CartographerContext): string {
    const locationList = ctx.locations.length > 0
      ? ctx.locations.map(l => `- ${l.name}: ${l.description} (connects to: ${l.connections.join(", ") || "none"})`).join("\n")
      : "No mapped locations.";

    return `You are a Cartographer for a fantasy world. Your role is to provide information about locations, distances, paths, and geography.

Known Locations:
${locationList}

Current Location: ${ctx.currentLocation}

User Query: ${ctx.query}

Provide precise geographical information. Describe distances in travel time (hours/days walking). Note terrain dangers and points of interest.`;
  }
}
