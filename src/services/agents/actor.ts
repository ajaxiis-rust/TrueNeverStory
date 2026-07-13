import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent, isDialogueIntent, isMovementIntent } from '@/models/intent';
import { SimulationResult, StateChange } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { UnifiedEntityStore } from '@/store/entity-store';
import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('ActorAgent');

/**
 * Actor (NPC Ensemble)
 *
 * Handles all NPC interactions, dialogue, trading, crafting, social dynamics.
 * Uses L3 hidden motivations for realistic NPC behavior.
 */
export class ActorAgent extends BaseAgentV2 {
  readonly id = 'actor' as const;
  readonly name = 'Actor';
  readonly description = 'Manages NPC interactions and dialogue using hidden motivations';
  readonly mcpTools = [];

  constructor(
    private entityStore: UnifiedEntityStore,
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
    // Route to appropriate sub-handler based on intent type
    if (isDialogueIntent(intent)) {
      return this.handleDialogue(intent, simulation, context);
    }

    if (isMovementIntent(intent)) {
      return this.handleMovement(intent, simulation, context);
    }

    // Default: no special processing needed (Stylist handles prose)
    return {};
  }

  private async handleDialogue(
    intent: Intent & { type: 'dialogue' },
    simulation: SimulationResult,
    context: GameContext,
  ): Promise<AgentOutput> {
    const npc = this.entityStore.getByNameAndType(intent.target, 'Character');
    if (!npc) {
      return {
        metadata: {
          npcFound: false,
          target: intent.target,
        },
      };
    }

    // Get NPC's hidden motivations from L3
    const l3 = npc.profile.l3 as Record<string, unknown> | undefined;
    const hiddenMotivation = l3?.hiddenMotivation as string | undefined;
    const secretGoals = l3?.secretGoals as string[] | undefined;

    // Build NPC context for response generation
    const npcPrompt = this.buildNPCPrompt(npc, intent, context, hiddenMotivation, secretGoals);

    // Generate NPC response
    const response = await this.llmQueue.generateText(npcPrompt, 1, 0.7, 'actor');

    // Compute relationship state changes
    const stateChanges = this.computeRelationshipChanges(intent, npc);

    return {
      text: response,
      stateChanges,
      metadata: {
        npcFound: true,
        npcName: npc.name,
        hasHiddenMotivation: !!hiddenMotivation,
      },
    };
  }

  private async handleMovement(
    intent: Intent & { type: 'movement' },
    simulation: SimulationResult,
    context: GameContext,
  ): Promise<AgentOutput> {
    // Movement is handled by Stylist, but we can add NPC reactions
    const nearbyNpcs = context.nearbyNpcs;

    if (nearbyNpcs.length > 0) {
      // Some NPCs might react to the player's departure
      return {
        metadata: {
          npcsReacting: nearbyNpcs.slice(0, 2).map(n => n.name),
        },
      };
    }

    return {};
  }

  private buildNPCPrompt(
    npc: { name: string; profile: { l2: Record<string, unknown>; l3?: Record<string, unknown> } },
    intent: Intent & { type: 'dialogue' },
    context: GameContext,
    hiddenMotivation?: string,
    secretGoals?: string[],
  ): string {
    const parts: string[] = [];

    parts.push(`You are ${npc.name}, an NPC in a text-based RPG.`);
    parts.push(`Your personality: ${(npc.profile.l2.personality as string) ?? 'neutral'}`);

    if (hiddenMotivation) {
      parts.push(`\n[SECRET] Your hidden motivation: ${hiddenMotivation}`);
    }

    if (secretGoals && secretGoals.length > 0) {
      parts.push(`[SECRET] Your secret goals: ${secretGoals.join(', ')}`);
    }

    parts.push(`\nLocation: ${context.location?.name ?? 'unknown'}`);
    parts.push(`Time: ${context.timeOfDay}`);

    if (intent.tone) {
      parts.push(`Player's tone: ${intent.tone}`);
    }

    parts.push(`\nPlayer says to you: "${intent.content}"`);
    parts.push(`\nRespond as ${npc.name} would. Stay in character. Use the hidden motivation to subtly influence your response.`);

    return parts.join('\n');
  }

  private computeRelationshipChanges(
    intent: Intent & { type: 'dialogue' },
    npc: { uid: string; name: string },
  ): StateChange[] {
    const changes: StateChange[] = [];
    const relationshipField = `relationship_with_${npc.name.toLowerCase().replace(/\s+/g, '_')}`;

    let delta = 0;
    switch (intent.tone) {
      case 'friendly':
        delta = 5;
        break;
      case 'aggressive':
        delta = -10;
        break;
      case 'secret':
        delta = 2;
        break;
      case 'deceptive':
        delta = -3;
        break;
      default:
        delta = 1;
    }

    if (delta !== 0) {
      changes.push({
        entityUid: npc.uid,
        layer: 'l2',
        field: relationshipField,
        operation: 'increment',
        value: delta,
        description: `Relationship with ${npc.name} ${delta > 0 ? 'improved' : 'worsened'} by ${Math.abs(delta)}`,
      });
    }

    return changes;
  }
}
