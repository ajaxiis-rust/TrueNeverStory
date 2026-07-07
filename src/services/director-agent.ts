/**
 * DirectorAgent — integrates story beats into narrative.
 * Replaces world_engine/agents/director_agent.py.
 */

import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { resolveTemplate } from "../utils/template-resolver";
import { loadAgentConfig, getLanguageInstruction } from "./agent-config";
import type { ServiceMessageContext } from "./roleplay-engine";

export const DIRECTOR_AGENT_ID = "director";

export class DirectorAgent {
  readonly name = "Director";
  private _llmQueue: LLMQueue;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  async injectBeat(beatDescription: string, currentNarrative: string): Promise<string> {
    const agentCfg = loadAgentConfig(DIRECTOR_AGENT_ID);
    const template = agentCfg.prompts?.userTemplate;

    let prompt: string;
    if (template) {
      prompt = resolveTemplate(template, {
        narrative: currentNarrative,
        beat: beatDescription,
      });
    } else {
      prompt = PromptBuilder.buildDirectorBeatPrompt(beatDescription, currentNarrative);
    }

    return this._llmQueue.generateText(prompt, TaskPriority.HIGH, agentCfg.temperature || 0.7, DIRECTOR_AGENT_ID);
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    const prompt = `You are the Director of a fantasy story. The user is sending you a private service message about story direction.

Location: ${ctx.location}
Character: ${ctx.character}
Time: ${ctx.storyTime}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with your creative input. You can suggest plot developments, story hooks, dramatic moments, or discuss narrative direction. Keep it concise and actionable.${getLanguageInstruction()}`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.7, DIRECTOR_AGENT_ID,
    );
    return response.trim();
  }
}
