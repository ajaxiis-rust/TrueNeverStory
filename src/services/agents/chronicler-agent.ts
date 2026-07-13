import { BaseAgentV2, AgentOutput, NarrativePattern } from '../agent-v2';
import { Intent } from '@/models/intent';
import { SimulationResult, StateChange } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';
import { UnifiedEntityStore } from '@/store/entity-store';
import { EventBus, EventTopic } from '@/lib/event-bus';
import { getLogger } from '@/utils/logger';

const logger = getLogger('ChroniclerAgent');

/**
 * Chronicler
 *
 * Updates world memory, manages timeline, provides historical context.
 * Logs all significant events and maintains world consistency.
 */
export class ChroniclerAgent extends BaseAgentV2 {
  readonly id = 'chronicler' as const;
  readonly name = 'Chronicler';
  readonly description = 'Updates world memory and maintains timeline';
  readonly mcpTools = [];

  constructor(
    private entityStore: UnifiedEntityStore,
    private eventBus: EventBus,
  ) {
    super();
  }

  async process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput> {
    // Log the event to timeline
    const event = this.createEvent(intent, simulation, context);

    // Publish to EventBus for other systems
    this.eventBus.publishSimple(EventTopic.STORY_EVENT, {
      type: intent.type,
      outcome: simulation.outcome,
      location: context.location?.name,
      character: context.character?.name,
    }, 'chronicler');

    // Update NPC memories if needed
    const stateChanges = await this.updateNPCMemories(intent, simulation, context);

    return {
      stateChanges,
      metadata: {
        eventLogged: true,
        eventType: event.type,
      },
    };
  }

  private createEvent(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): {
    type: string;
    description: string;
    timestamp: Date;
    location: string;
    character: string;
  } {
    const character = context.character?.name ?? 'Unknown';
    const location = context.location?.name ?? 'unknown';

    let description: string;
    let type: string;

    switch (intent.type) {
      case 'movement':
        type = 'movement';
        description = `${character} moved to ${location}`;
        break;
      case 'dialogue':
        type = 'dialogue';
        description = `${character} spoke with ${intent.target}`;
        break;
      case 'action':
        type = 'action';
        description = `${character} performed: ${intent.verb}`;
        break;
      case 'observation':
        type = 'observation';
        description = `${character} observed their surroundings`;
        break;
      default:
        type = 'event';
        description = `${character} acted`;
    }

    return {
      type,
      description,
      timestamp: context.time,
      location,
      character,
    };
  }

  private async updateNPCMemories(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
  ): Promise<StateChange[]> {
    const changes: StateChange[] = [];

    // If there are nearby NPCs, they should remember this event
    if (context.nearbyNpcs.length > 0 && intent.type === 'action') {
      for (const npc of context.nearbyNpcs.slice(0, 3)) {
        const npcEntity = this.entityStore.getByNameAndType(npc.name, 'Character');
        if (!npcEntity) continue;

        // Add to NPC's episodic memory
        const memoryField = 'episodic_memory';
        const memoryEntry = {
          event: `${context.character?.name ?? 'Someone'} ${intent.verb}${intent.target ? ` ${intent.target}` : ''}`,
          outcome: simulation.outcome,
          time: context.time.toISOString(),
          location: context.location?.name,
        };

        changes.push({
          entityUid: npcEntity.uid,
          layer: 'l3',
          field: memoryField,
          operation: 'add',
          value: memoryEntry,
          description: `NPC ${npc.name} remembers the event`,
        });
      }
    }

    return changes;
  }
}
