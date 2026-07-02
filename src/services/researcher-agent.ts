/**
 * ResearcherAgent — fact-checking, realism validation, world-building research.
 * Verifies recipes, historical context, character details, and daily life elements.
 */

import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { getLogger } from "../utils/logger";
import type { ServiceMessageContext } from "./roleplay-engine";

const log = getLogger("researcher-agent");

export const RESEARCHER_AGENT_ID = "researcher";

export interface ResearchResult {
  verdict: "plausible" | "questionable" | "unrealistic";
  confidence: number;
  issues: string[];
  suggestions: string[];
  enrichedDetails: string;
}

export class ResearcherAgent {
  readonly name = "Researcher";
  private _llmQueue: LLMQueue;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  async verifyRecipe(
    recipeName: string,
    ingredients: string[],
    result: string,
    difficulty: string,
    worldContext: string,
  ): Promise<ResearchResult> {
    const prompt = PromptBuilder.buildResearcherRecipePrompt(
      recipeName, ingredients, result, difficulty, worldContext,
    );
    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return this._parseResult(response);
  }

  async researchTopic(
    topic: string,
    worldContext: string,
    era?: string,
  ): Promise<string> {
    const prompt = PromptBuilder.buildResearcherTopicPrompt(topic, worldContext, era);
    return this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.4, RESEARCHER_AGENT_ID,
    );
  }

  async validateCharacter(
    characterName: string,
    personality: string,
    role: string,
    location: string,
    worldContext: string,
  ): Promise<ResearchResult> {
    const prompt = PromptBuilder.buildResearcherCharacterPrompt(
      characterName, personality, role, location, worldContext,
    );
    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return this._parseResult(response);
  }

  async enrichScene(
    sceneDescription: string,
    location: string,
    worldContext: string,
    era?: string,
  ): Promise<string> {
    const prompt = PromptBuilder.buildResearcherScenePrompt(
      sceneDescription, location, worldContext, era,
    );
    return this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.5, RESEARCHER_AGENT_ID,
    );
  }

  async factCheck(
    claim: string,
    worldContext: string,
  ): Promise<ResearchResult> {
    const prompt = PromptBuilder.buildResearcherFactCheckPrompt(claim, worldContext);
    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.2, RESEARCHER_AGENT_ID,
    );
    return this._parseResult(response);
  }

  private _parseResult(response: string): ResearchResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          verdict: "plausible",
          confidence: 0.5,
          issues: [],
          suggestions: [],
          enrichedDetails: response.trim(),
        };
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        verdict: parsed.verdict ?? "plausible",
        confidence: parsed.confidence ?? 0.5,
        issues: parsed.issues ?? [],
        suggestions: parsed.suggestions ?? [],
        enrichedDetails: parsed.enrichedDetails ?? "",
      };
    } catch {
      log.warn("Failed to parse researcher response as JSON, using raw text");
      return {
        verdict: "plausible",
        confidence: 0.5,
        issues: [],
        suggestions: [],
        enrichedDetails: response.trim(),
      };
    }
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    const prompt = `You are the Researcher agent for a fantasy world. The user is sending you a private service message.

Location: ${ctx.location}
Character: ${ctx.character}
World rules:
${ctx.worldRules.map(r => `- ${r}`).join("\n") || "None"}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with research insights, fact-checking, historical context, or world-building details. Keep it concise and grounded.`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return response.trim();
  }
}
