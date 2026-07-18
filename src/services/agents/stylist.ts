import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent } from '@/models/intent';
import { SimulationResult } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { TNSServer } from '@/mcp/server';
import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('StylistAgent');

/**
 * Build anti-moralizing prompt for Stylist agent
 */
export function buildAntiMoralizingPrompt(): string {
  return `## CRITICAL: Anti-Moralizing Constraint

You are writing narrative prose for a game. Your output MUST follow these rules:

### FORBIDDEN:
- NO religious references (no God, no divine, no sacred, no holy)
- NO moral commentary ("and so we learn", "the moral is", "this teaches us")
- NO philosophical conclusions
- NO "important lesson" phrases
- NO sermonizing or preaching

### REQUIRED:
- Focus ONLY on actions (what characters DO)
- Focus ONLY on emotions (what characters FEEL)
- Focus ONLY on dialogue (what characters SAY)
- Focus ONLY on sensory details (what characters SEE, HEAR, SMELL, TOUCH, TASTE)

### Style:
- Show, don't tell
- Let the player draw their own conclusions
- Keep it grounded in physical reality
- Use concrete, specific details
- Avoid abstract concepts

### Example:
BAD: "And so we learn that even in the darkest times, hope endures."
GOOD: "The rain stopped. Sunlight broke through the clouds. She wiped her eyes and stood up."

BAD: "This was a divine miracle that showed God's power."
GOOD: "The water parted. A path appeared. They walked through."
`;
}

/**
 * Stylist (The Narrator)
 *
 * Renders prose via Gutenberg patterns, handles scene transitions.
 * The core text generation agent.
 */
export class StylistAgent extends BaseAgentV2 {
  readonly id = 'stylist' as const;
  readonly name = 'Stylist';
  readonly description = 'Renders prose using Gutenberg style patterns';
  readonly mcpTools = ['get_style_pattern', 'apply_style'];

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
    pattern?: NarrativePattern,
  ): Promise<AgentOutput> {
    // Get style based on mood
    const style = await this.getStyle(pattern?.mood ?? 'neutral');

    // Extract literary metadata from pattern (if from classics-compiled.db)
    const tags = pattern?.tags;
    const variables = pattern?.variables;

    // Build constrained prompt
    const prompt = this.buildPrompt(intent, simulation, context, style, tags, variables);

    // Generate prose
    const prose = await this.llmQueue.generateText(prompt, 1, 0.8, 'stylist');

    return { text: prose };
  }

  private async getStyle(mood: string): Promise<{
    name: string;
    description: string;
    vocabulary: string[];
    sentencePatterns: string[];
  } | null> {
    try {
      const result = await this.mcpServer.handleToolCall('get_style_pattern', {
        query: mood,
        mood,
        limit: 1,
      }) as { styles: Array<{ name: string; description: string; vocabulary: string[]; sentencePatterns: string[] }> };

      if (result.styles.length > 0) {
        return result.styles[0]!;
      }
    } catch (error) {
      logger.warn('Failed to get style pattern:', error as string);
    }
    return null;
  }

  private buildPrompt(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    style: { name: string; description: string; vocabulary: string[]; sentencePatterns: string[] } | null,
    tags?: string[],
    variables?: string[],
  ): string {
    const parts: string[] = [];

    // System context
    parts.push('You are a skilled narrative writer for a text-based RPG.');

    // Style guidance
    if (style) {
      parts.push(`\nStyle: ${style.name}`);
      parts.push(`Description: ${style.description}`);
      if (style.vocabulary.length > 0) {
        parts.push(`Preferred vocabulary: ${style.vocabulary.slice(0, 10).join(', ')}`);
      }
      if (style.sentencePatterns.length > 0) {
        parts.push(`Sentence patterns: ${style.sentencePatterns.slice(0, 3).join(' | ')}`);
      }
    }

    // Literary template hints from classics-compiled.db
    if (tags && tags.length > 0) {
      const sensoryTags = tags.filter(t => ['sight', 'sound', 'smell', 'touch', 'taste'].includes(t));
      if (sensoryTags.length > 0) {
        parts.push(`\nSensory focus: ${sensoryTags.join(', ')}`);
      }
      const thematicTags = tags.filter(t => !['sight', 'sound', 'smell', 'touch', 'taste'].includes(t) && !t.includes('_'));
      if (thematicTags.length > 0) {
        parts.push(`Themes present: ${thematicTags.slice(0, 5).join(', ')}`);
      }
    }

    // Game context
    parts.push(`\nWorld: ${context.world.name}`);
    parts.push(`Location: ${context.location?.name ?? 'unknown'}`);
    parts.push(`Time: ${context.timeOfDay}`);
    parts.push(`Character: ${context.character?.name ?? 'unknown'}`);

    // Simulation constraints
    parts.push(`\nSimulation outcome: ${simulation.outcome}`);
    if (simulation.narrativeHints.length > 0) {
      parts.push(`Hints: ${simulation.narrativeHints.join('; ')}`);
    }

    // Intent-based instruction
    parts.push(this.getIntentInstruction(intent));

    // Nearby NPCs
    if (context.nearbyNpcs.length > 0) {
      parts.push(`\nNearby characters: ${context.nearbyNpcs.map(n => n.name).join(', ')}`);
    }

    // Recent events
    if (context.recentTimeline.length > 0) {
      parts.push('\nRecent events:');
      for (const event of context.recentTimeline.slice(0, 3)) {
        parts.push(`- ${event.description}`);
      }
    }

    parts.push('\nWrite a vivid, engaging narrative passage (2-4 paragraphs).');
    parts.push('Show, don\'t tell. Use sensory details. Maintain consistent point of view.');

    // Anti-moralizing constraint
    parts.push('\n' + buildAntiMoralizingPrompt());

    return parts.join('\n');
  }

  private getIntentInstruction(intent: Intent): string {
    switch (intent.type) {
      case 'movement':
        return `\nThe character travels to ${intent.destination}. Describe the journey and arrival.`;
      case 'dialogue':
        return `\nThe character speaks to ${intent.target}: "${intent.content}". Write the NPC's response and atmosphere.`;
      case 'action':
        return `\nThe character performs: ${intent.verb}${intent.target ? ` on ${intent.target}` : ''}. Describe the action and its consequences.`;
      case 'observation':
        return `\nThe character observes${intent.target ? ` ${intent.target}` : ' their surroundings'}. Paint a detailed picture.`;
      default:
        return '\nDescribe what happens next in the story.';
    }
  }
}
