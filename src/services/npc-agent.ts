/**
 * NPCAgent — generates NPC dialogue responses.
 * Replaces world_engine/agents/npc_agent.py.
 */

import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { resolveTemplate } from "../utils/template-resolver";
import { loadAgentConfig, getLanguageInstruction } from "./agent-config";
import type { ServiceMessageContext } from "./roleplay-engine";
import { MemoryEngine } from "./memory-engine";
import { BehaviorEngine } from "./behavior-engine";
import { SocialGraph } from "./social-graph";
import { DialogueContext } from "./dialogue-context";
import type { NPCRuntime } from "./npc-runtime";

export const NPC_AGENT_ID = "npc";

export class NPCAgent {
  readonly name = "NPC Agent";
  private _llmQueue: LLMQueue;
  private _memoryEngine: MemoryEngine | null = null;
  private _behaviorEngine: BehaviorEngine | null = null;
  private _socialGraph: SocialGraph | null = null;
  private _dialogueContext: DialogueContext | null = null;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  initialize(runtime: NPCRuntime, statePath: string): void {
    this._memoryEngine = new MemoryEngine(runtime);
    this._behaviorEngine = new BehaviorEngine(runtime);
    this._socialGraph = new SocialGraph(statePath);
    this._dialogueContext = new DialogueContext(runtime, this._socialGraph, this._memoryEngine);
  }

  async respond(
    npcName: string,
    npcPersonality: string,
    playerCharacter: string,
    location: string,
    playerLine: string,
    recentEvents: string[],
    relationship = "neutral",
  ): Promise<string> {
    const agentCfg = loadAgentConfig(NPC_AGENT_ID);

    let prompt: string;

    if (this._dialogueContext) {
      prompt = await this._dialogueContext.buildContext(npcName, playerCharacter, playerLine);
    } else {
      const template = agentCfg.prompts?.userTemplate;
      if (template) {
        prompt = resolveTemplate(template, {
          npc_name: npcName,
          npc_personality: npcPersonality,
          location,
          player: playerCharacter,
          relationship,
          events: recentEvents.slice(-3).join(", "),
          line: playerLine,
        });
      } else {
        prompt = PromptBuilder.buildNPCPrompt(
          npcName,
          npcPersonality,
          playerCharacter,
          location,
          playerLine,
          recentEvents,
          relationship,
        );
      }
    }

    return this._llmQueue.generateText(prompt, TaskPriority.HIGH, agentCfg.temperature || 0.7, NPC_AGENT_ID);
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    let contextInfo = `Location: ${ctx.location}\nCharacter: ${ctx.character}\nNearby NPCs: ${ctx.nearbyNpcs.join(", ") || "None"}`;

    if (this._dialogueContext) {
      const enriched = await this._dialogueContext.getConversationContext(ctx.character, ctx.recentEvents);
      contextInfo = enriched;
    }

    const prompt = `You are the NPC Agent managing character interactions. The user is sending you a private service message.

${contextInfo}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with your expertise on NPC behavior, dialogue suggestions, or character interaction advice. Keep it concise.${getLanguageInstruction()}`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.7, NPC_AGENT_ID,
    );
    return response.trim();
  }

  getMemoryEngine(): MemoryEngine | null {
    return this._memoryEngine;
  }

  getBehaviorEngine(): BehaviorEngine | null {
    return this._behaviorEngine;
  }

  getSocialGraph(): SocialGraph | null {
    return this._socialGraph;
  }
}
