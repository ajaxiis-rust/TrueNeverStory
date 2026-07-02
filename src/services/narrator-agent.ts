/**
 * NarratorAgent — generates world narrative from context.
 * Replaces world_engine/agents/narrator_agent.py.
 */

import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { resolveTemplate } from "../utils/template-resolver";
import { loadAgentConfig } from "./agent-config";
import type { StoryContext } from "../models/story";
import type { ServiceMessageContext } from "./roleplay-engine";

export const NARRATOR_AGENT_ID = "narrator";

export class NarratorAgent {
  readonly name = "Narrator";
  private _llmQueue: LLMQueue;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  async generate(
    context: StoryContext,
    recentMemories: string[],
    worldFacts: string[],
    conversationHistory: Array<{ user: string; assistant: string }>,
  ): Promise<string> {
    const agentCfg = loadAgentConfig(NARRATOR_AGENT_ID);
    const template = agentCfg.prompts?.userTemplate;

    let prompt: string;
    if (template) {
      const history = conversationHistory.length > 0
        ? conversationHistory.slice(-3).map((h) => `User: ${h.user}\nAssistant: ${h.assistant}`).join("\n\n")
        : "No previous conversation.";
      const memories = recentMemories.length > 0
        ? recentMemories.slice(0, 5).map((m) => `- ${m}`).join("\n")
        : "None";
      const facts = worldFacts.length > 0
        ? worldFacts.slice(0, 3).map((f) => `- ${f}`).join("\n")
        : "None";
      const rules = context.worldRules.map((r) => `- ${r}`).join("\n");
      const timeline = context.recentTimeline.slice(-5).map((e) => `- ${e}`).join("\n");

      prompt = resolveTemplate(template, {
        world_name: context.worldName,
        time: context.currentTime,
        location: context.location,
        character: context.activeCharacter ?? "none",
        role: context.userRole,
        rules,
        timeline,
        memories,
        facts,
        npcs: context.nearbyNpcs.join(", "),
        history,
        genre: context.genre ?? "",
        magic_system: context.magicSystem ?? "",
        language: context.language ?? "",
        world_description: context.worldDescription ?? "",
      });
    } else {
      prompt = PromptBuilder.buildNarratorPrompt(
        context,
        recentMemories,
        worldFacts,
        conversationHistory,
      );
    }

    const response = await this._llmQueue.generateText(
      prompt,
      TaskPriority.HIGH,
      agentCfg.temperature || 0.8,
      NARRATOR_AGENT_ID,
    );
    return response.trim();
  }

  async *generateStream(
    context: StoryContext,
    recentMemories: string[],
    worldFacts: string[],
    conversationHistory: Array<{ user: string; assistant: string }>,
  ): AsyncGenerator<string> {
    const agentCfg = loadAgentConfig(NARRATOR_AGENT_ID);
    const template = agentCfg.prompts?.userTemplate;

    let prompt: string;
    if (template) {
      const history = conversationHistory.length > 0
        ? conversationHistory.slice(-3).map((h) => `User: ${h.user}\nAssistant: ${h.assistant}`).join("\n\n")
        : "No previous conversation.";
      const memories = recentMemories.length > 0
        ? recentMemories.slice(0, 5).map((m) => `- ${m}`).join("\n")
        : "None";
      const facts = worldFacts.length > 0
        ? worldFacts.slice(0, 3).map((f) => `- ${f}`).join("\n")
        : "None";
      const rules = context.worldRules.map((r) => `- ${r}`).join("\n");
      const timeline = context.recentTimeline.slice(-5).map((e) => `- ${e}`).join("\n");

      prompt = resolveTemplate(template, {
        world_name: context.worldName,
        time: context.currentTime,
        location: context.location,
        character: context.activeCharacter ?? "none",
        role: context.userRole,
        rules,
        timeline,
        memories,
        facts,
        npcs: context.nearbyNpcs.join(", "),
        history,
        genre: context.genre ?? "",
        magic_system: context.magicSystem ?? "",
        language: context.language ?? "",
        world_description: context.worldDescription ?? "",
      });
    } else {
      prompt = PromptBuilder.buildNarratorPrompt(
        context,
        recentMemories,
        worldFacts,
        conversationHistory,
      );
    }

    yield* this._llmQueue.generateTextStream(
      prompt,
      TaskPriority.HIGH,
      agentCfg.temperature || 0.8,
      NARRATOR_AGENT_ID,
    );
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    const history = ctx.conversation.length > 0
      ? ctx.conversation.slice(-3).map((h) => `User: ${h.user}\nAssistant: ${h.assistant}`).join("\n\n")
      : "No previous conversation.";

    const prompt = `You are the Narrator of a fantasy world. The user is sending you a private service message (not visible to other agents).

Location: ${ctx.location}
Character: ${ctx.character}
Time: ${ctx.storyTime}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

World rules:
${ctx.worldRules.map(r => `- ${r}`).join("\n") || "None"}

Nearby NPCs: ${ctx.nearbyNpcs.join(", ") || "None"}

Recent conversation:
${history}

Private message from the user: "${ctx.message}"

Respond to their request. You may provide narrative context, answer questions about the world, or discuss story direction. Keep your response concise.`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.7, NARRATOR_AGENT_ID,
    );
    return response.trim();
  }
}
