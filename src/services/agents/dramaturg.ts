import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent } from '@/models/intent';
import { SimulationResult } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { TNSServer } from '@/mcp/server';
import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('DramaturgAgent');

/**
 * Dramaturg (The Architect)
 *
 * Works with biblical patterns to select narrative archetypes.
 * Analyzes the current situation and chooses appropriate story structures.
 */
export class DramaturgAgent extends BaseAgentV2 {
  readonly id = 'dramaturg' as const;
  readonly name = 'Dramaturg';
  readonly description = 'Selects narrative patterns from Bible archetypes for story structure';
  readonly mcpTools = ['search_verses', 'get_pattern', 'get_archetype'];

  constructor(
    private mcpServer: TNSServer,
    private llmQueue: LLMQueue,
  ) {
    super();
  }

  async process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    existingPattern?: NarrativePattern,
  ): Promise<AgentOutput> {
    // If pattern already provided, use it
    if (existingPattern) {
      return { metadata: { pattern: existingPattern } };
    }

    // Analyze the situation to determine mood and archetype
    const mood = this.inferMood(intent, simulation, context);
    const archetype = this.inferArchetype(intent, simulation, context);

    // Query Bible patterns via MCP
    try {
      const result = await this.mcpServer.handleToolCall('get_pattern', {
        mood,
        archetype,
      }) as { patterns: Array<{ id: string; name: string; archetype: string; description: string; verses: string[]; mood: string }> };

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        return {
          metadata: {
            pattern: {
              archetype: pattern.archetype,
              name: pattern.name,
              description: pattern.description,
              verses: pattern.verses,
              mood: pattern.mood,
            } as NarrativePattern,
          },
        };
      }
    } catch (error) {
      logger.warn('Failed to query Bible patterns:', error as string);
    }

    // Fallback: query literary compiler quest templates (classics DB)
    try {
      const position = this.inferPosition(intent, simulation, context);
      const templates = await this.mcpServer.handleToolCall('get_quest_templates', {
        archetype,
        mood,
        position,
        limit: 3,
      }) as { templates: Array<{ id: string; archetype: string; template_text: string; mood: string; variables: string[]; tags: string[]; applicable_positions: string[] }> };

      if (templates.templates.length > 0) {
        const t = templates.templates[0]!;
        return {
          metadata: {
            pattern: {
              archetype: t.archetype,
              name: t.id,
              description: t.template_text,
              verses: [],
              mood: t.mood,
              // Attach literary metadata for Stylist enrichment
              tags: t.tags,
              variables: t.variables,
              applicable_positions: t.applicable_positions,
            } as NarrativePattern,
          },
        };
      }
    } catch (error) {
      logger.warn('Failed to query quest templates:', error as string);
    }

    // Fallback: generate pattern via LLM
    const fallbackPattern = await this.generateFallbackPattern(intent, simulation, context);
    return { metadata: { pattern: fallbackPattern } };
  }

  private inferMood(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): string {
    // Time of day affects mood
    if (context.timeOfDay === 'night') return 'dark';
    if (context.timeOfDay === 'dusk') return 'ambiguous';

    // Simulation outcome affects mood
    if (simulation.outcome === 'critical_failure') return 'dark';
    if (simulation.outcome === 'critical_success') return 'hopeful';
    if (simulation.outcome === 'failure') return 'somber';

    // Intent type affects mood
    if (intent.type === 'dialogue' && intent.tone === 'aggressive') return 'tense';
    if (intent.type === 'action' && intent.risk_level === 'deadly') return 'dark';

    return 'neutral';
  }

  private inferArchetype(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): string {
    // Map outcomes to archetypes
    if (simulation.outcome === 'critical_failure') return 'tragic_hero';
    if (simulation.outcome === 'critical_success') return 'triumphant_hero';
    if (simulation.outcome === 'failure') return 'struggling_hero';

    // Map intent types to archetypes
    if (intent.type === 'dialogue') return 'social_dynamics';
    if (intent.type === 'movement') return 'journey';
    if (intent.type === 'action') return 'challenge';

    return 'everyday_life';
  }

  private inferPosition(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): string {
    if (context.character?.entityType === 'NPC') return 'follower';
    if (simulation.outcome === 'critical_success') return 'leader';
    if (intent.type === 'dialogue') return 'follower';
    return 'follower';
  }

  private async generateFallbackPattern(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): Promise<NarrativePattern> {
    const prompt = `You are a Dramaturg for a narrative RPG. Analyze the current situation and suggest a narrative pattern.

Situation:
- Intent: ${intent.type}
- Outcome: ${simulation.outcome}
- Location: ${context.location?.name ?? 'unknown'}
- Time: ${context.timeOfDay}
- Mood: ${this.inferMood(intent, simulation, context)}

Respond with a JSON object:
{
  "archetype": "archetype_name",
  "name": "Pattern Name",
  "description": "Brief description of the narrative pattern",
  "mood": "mood"
}`;

    const response = await this.llmQueue.generateText(prompt, 1, 0.3, 'dramaturg');

    try {
      const parsed = JSON.parse(response.trim());
      return {
        archetype: parsed.archetype ?? 'everyday_life',
        name: parsed.name ?? 'Default Pattern',
        description: parsed.description ?? 'A standard narrative pattern',
        verses: [],
        mood: parsed.mood ?? 'neutral',
      };
    } catch {
      return {
        archetype: 'everyday_life',
        name: 'Default Pattern',
        description: 'A standard narrative pattern for everyday events',
        verses: [],
        mood: 'neutral',
      };
    }
  }
}
