/**
 * ResearcherAgent — fact-checking, realism validation, world-building research.
 * Verifies recipes, historical context, character details, and daily life elements.
 */

import type { LLMQueue } from "../lib/llm-queue";
import type { TNSServer } from "../mcp/server";
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
  private _mcpServer?: TNSServer;

  constructor(llmQueue: LLMQueue, mcpServer?: TNSServer) {
    this._llmQueue = llmQueue;
    this._mcpServer = mcpServer;
  }

  /** Retrieve relevant literary templates via MCP (v2-paradigm §S4.3) */
  private async _retrieveContext(query: string): Promise<string> {
    if (!this._mcpServer) return '';
    try {
      const result = await this._mcpServer.handleToolCall('search_templates', { query, limit: 2 }) as { templates?: Array<{ template_text?: string; archetype?: string }> };
      if (result.templates?.length) {
        return result.templates.map(t => `- ${t.archetype ?? 'unknown'}: ${t.template_text ?? ''}`).join('\n');
      }
    } catch (err) {
      log.warn({ err }, 'MCP retrieval failed, using static prompt');
    }
    return '';
  }

  async verifyRecipe(
    recipeName: string,
    ingredients: string[],
    result: string,
    difficulty: string,
    worldContext: string,
  ): Promise<ResearchResult> {
    const mcpContext = await this._retrieveContext(`recipe ${recipeName} ${ingredients.join(' ')}`);
    const prompt = PromptBuilder.buildResearcherRecipePrompt(
      recipeName, ingredients, result, difficulty, worldContext,
    );
    const fullPrompt = mcpContext ? `${prompt}\n\nRelevant literary templates:\n${mcpContext}` : prompt;
    const response = await this._llmQueue.generateText(
      fullPrompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return this._parseResult(response);
  }

  async researchTopic(
    topic: string,
    worldContext: string,
    era?: string,
  ): Promise<string> {
    const mcpContext = await this._retrieveContext(topic);
    const prompt = PromptBuilder.buildResearcherTopicPrompt(topic, worldContext, era);
    if (mcpContext) {
      return this._llmQueue.generateText(
        `${prompt}\n\nRelevant literary templates:\n${mcpContext}`,
        TaskPriority.NORMAL, 0.4, RESEARCHER_AGENT_ID,
      );
    }
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
    const mcpContext = await this._retrieveContext(`character ${characterName} ${personality}`);
    const prompt = PromptBuilder.buildResearcherCharacterPrompt(
      characterName, personality, role, location, worldContext,
    );
    const fullPrompt = mcpContext ? `${prompt}\n\nRelevant literary templates:\n${mcpContext}` : prompt;
    const response = await this._llmQueue.generateText(
      fullPrompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return this._parseResult(response);
  }

  async enrichScene(
    sceneDescription: string,
    location: string,
    worldContext: string,
    era?: string,
  ): Promise<string> {
    const mcpContext = await this._retrieveContext(`scene ${location} ${sceneDescription}`);
    const prompt = PromptBuilder.buildResearcherScenePrompt(
      sceneDescription, location, worldContext, era,
    );
    const fullPrompt = mcpContext ? `${prompt}\n\nRelevant literary templates:\n${mcpContext}` : prompt;
    return this._llmQueue.generateText(
      fullPrompt, TaskPriority.NORMAL, 0.5, RESEARCHER_AGENT_ID,
    );
  }

  async factCheck(
    claim: string,
    worldContext: string,
  ): Promise<ResearchResult> {
    const mcpContext = await this._retrieveContext(claim);
    const prompt = PromptBuilder.buildResearcherFactCheckPrompt(claim, worldContext);
    const fullPrompt = mcpContext ? `${prompt}\n\nRelevant literary templates:\n${mcpContext}` : prompt;
    const response = await this._llmQueue.generateText(
      fullPrompt, TaskPriority.NORMAL, 0.2, RESEARCHER_AGENT_ID,
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
    const mcpContext = await this._retrieveContext(ctx.message);
    const basePrompt = `You are the Researcher agent for a fantasy world. The user is sending you a private service message.

Location: ${ctx.location}
Character: ${ctx.character}
World rules:
${ctx.worldRules.map(r => `- ${r}`).join("\n") || "None"}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with research insights, fact-checking, historical context, or world-building details. Keep it concise and grounded.`;

    const prompt = mcpContext ? `${basePrompt}\n\nRelevant literary templates:\n${mcpContext}` : basePrompt;
    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.3, RESEARCHER_AGENT_ID,
    );
    return response.trim();
  }
}
