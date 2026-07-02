/**
 * SceneAgent — generates scene transition narratives.
 * Replaces world_engine/agents/scene_agent.py.
 */

import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { resolveTemplate } from "../utils/template-resolver";
import { loadAgentConfig } from "./agent-config";
import type { ServiceMessageContext } from "./roleplay-engine";

export const SCENE_AGENT_ID = "scene";

export class SceneAgent {
  readonly name = "Scene Generator";
  private _llmQueue: LLMQueue;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  async transition(
    currentLocation: string,
    destination: string,
    character: string,
    recentEvents: string[],
    worldRules: string[],
  ): Promise<string> {
    const agentCfg = loadAgentConfig(SCENE_AGENT_ID);
    const template = agentCfg.prompts?.userTemplate;

    let prompt: string;
    if (template) {
      prompt = resolveTemplate(template, {
        character,
        origin: currentLocation,
        destination,
        rules: worldRules.join(", "),
        events: recentEvents.slice(-3).join(", "),
      });
    } else {
      prompt = PromptBuilder.buildSceneTransitionPrompt(
        currentLocation,
        destination,
        character,
        recentEvents,
        worldRules,
      );
    }

    return this._llmQueue.generateText(prompt, TaskPriority.HIGH, agentCfg.temperature || 0.8, SCENE_AGENT_ID);
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    const prompt = `You are the Scene Generator for a fantasy world. The user is sending you a private service message.

Location: ${ctx.location}
Character: ${ctx.character}

World rules:
${ctx.worldRules.map(r => `- ${r}`).join("\n") || "None"}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with scene descriptions, atmosphere suggestions, or location details. Keep it concise.`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.8, SCENE_AGENT_ID,
    );
    return response.trim();
  }
}
