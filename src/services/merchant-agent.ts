import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("merchant-agent");

interface MerchantContext {
  query: string;
  merchantName: string;
  inventory: Array<{ name: string; price: number; quantity: number }>;
  worldEconomy: string;
}

export class MerchantAgent {
  constructor(private llmQueue: LLMQueue) {}

  async generate(ctx: MerchantContext): Promise<string> {
    const prompt = this._buildPrompt(ctx);
    return this.llmQueue.generateText(prompt, TaskPriority.NORMAL, 0.6, "merchant");
  }

  private _buildPrompt(ctx: MerchantContext): string {
    const inventoryList = ctx.inventory.length > 0
      ? ctx.inventory.map(i => `- ${i.name}: ${i.price} gold (x${i.quantity})`).join("\n")
      : "Empty inventory.";

    return `You are a Merchant NPC named ${ctx.merchantName}. Your role is to handle trading, pricing, and inventory.

Your Inventory:
${inventoryList}

Economy Context:
${ctx.worldEconomy}

User Query: ${ctx.query}

Respond in character as a merchant. Be shrewd but fair. Consider supply, demand, and relationship with the customer.`;
  }
}
