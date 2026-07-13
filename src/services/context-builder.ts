import { UnifiedEntityStore } from '@/store/entity-store';
import { EntityNode } from '@/models/entity';
import { Chronicler } from '@/services/chronicler';
import { MemoryManager } from '@/services/memory-manager';
import { getLogger } from '@/utils/logger';

const logger = getLogger('ContextBuilder');

// ─── Game Context ────────────────────────────────────────────────────────────

export interface GameContext {
  world: WorldFrame;
  character: EntityNode | null;
  location: EntityNode | null;
  time: Date;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  nearbyNpcs: EntityNode[];
  activeQuests: QuestSummary[];
  recentTimeline: Array<{ description: string; timestamp: string }>;
  worldRules: WorldRule[];
  playerInventory: ItemSummary[];
  relationshipGraph: RelationshipSummary;
  memory: MemorySummary;
  weather: string;
}

export interface WorldFrame {
  name: string;
  calendar: Record<string, unknown>;
  magic: Record<string, unknown>;
  races: string[];
  factions: string[];
  rules: Record<string, unknown>;
}

export interface QuestSummary {
  id: string;
  title: string;
  status: string;
  description: string;
}

export interface WorldRule {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface ItemSummary {
  uid: string;
  name: string;
  type: string;
  quantity: number;
}

export interface RelationshipSummary {
  nodes: Array<{ uid: string; name: string; type: string }>;
  edges: Array<{ from: string; to: string; type: string; strength: number }>;
}

export interface MemorySummary {
  recentMemories: string[];
  importantMemories: string[];
  totalMemories: number;
}

// ─── Engine State ────────────────────────────────────────────────────────────

export interface EngineState {
  activeCharacter: string | null;
  currentLocation: string;
  currentTime: Date;
  userRole: string;
  visitedLocations: Set<string>;
}

// ─── Context Builder ─────────────────────────────────────────────────────────

export class ContextBuilder {
  constructor(
    private entityStore: UnifiedEntityStore,
    private chronicler: Chronicler,
    private memoryManager: MemoryManager,
    private worldFrame?: Record<string, unknown>,
  ) {}

  /**
   * Build complete game context from current engine state.
   * Parallel fetches all context sources for performance.
   */
  async build(state: EngineState): Promise<GameContext> {
    const [
      character,
      location,
      nearbyNpcs,
      quests,
      timeline,
      rules,
      memory,
    ] = await Promise.all([
      this.getCharacter(state.activeCharacter),
      this.getLocation(state.currentLocation),
      this.getNearbyNpcs(state.currentLocation),
      this.getQuests(),
      this.getRecentTimeline(),
      this.getWorldRules(),
      this.getMemorySummary(),
    ]);

    return {
      world: this.getWorldFrame(),
      character,
      location,
      time: state.currentTime,
      timeOfDay: this.getTimeOfDay(state.currentTime),
      nearbyNpcs,
      activeQuests: quests,
      recentTimeline: timeline,
      worldRules: rules,
      playerInventory: this.getPlayerInventory(character),
      relationshipGraph: this.getRelationshipGraph(character),
      memory,
      weather: this.getCurrentWeather(),
    };
  }

  /**
   * Build minimal context for intent parsing.
   */
  buildParserContext(state: EngineState) {
    return {
      currentLocation: state.currentLocation,
      activeCharacter: state.activeCharacter,
      nearbyNpcs: [], // Fetched lazily if needed
      activeQuests: [],
      gameTime: state.currentTime,
    };
  }

  // ─── Entity Fetchers ──────────────────────────────────────────────────

  private async getCharacter(name: string | null): Promise<EntityNode | null> {
    if (!name) return null;
    return this.entityStore.getByNameAndType(name, 'Character') ?? null;
  }

  private async getLocation(name: string): Promise<EntityNode | null> {
    return this.entityStore.getByNameAndType(name, 'Location') ?? null;
  }

  private async getNearbyNpcs(locationName: string): Promise<EntityNode[]> {
    const location = await this.getLocation(locationName);
    if (!location) return [];

    const allCharacters = this.entityStore.listByType('Character');
    return allCharacters.filter(c => {
      const l2 = c.profile.l2 as Record<string, unknown> | undefined;
      return l2?.current_location === locationName;
    });
  }

  private async getQuests(): Promise<QuestSummary[]> {
    try {
      // Get quests from EntityStore
      const questEntities = this.entityStore.listByType('Quest');
      return questEntities.map(q => ({
        id: q.uid,
        title: q.name,
        status: (q.profile.l2?.status as string) ?? 'active',
        description: (q.profile.l2?.description as string) ?? (q.profile.summary as string) ?? '',
      }));
    } catch {
      return [];
    }
  }

  private async getRecentTimeline(): Promise<Array<{ description: string; timestamp: string }>> {
    try {
      return await this.chronicler.getTimeline(new Date(Date.now() - 2 * 60 * 60 * 1000), 10);
    } catch {
      return [];
    }
  }

  private async getWorldRules(): Promise<WorldRule[]> {
    try {
      // Get world rules from EntityStore
      const ruleEntities = this.entityStore.listByType('WorldRule');
      return ruleEntities.map(r => ({
        id: r.uid,
        name: r.name,
        description: (r.profile.summary as string) ?? '',
        type: (r.profile.l2?.type as string) ?? 'rule',
      }));
    } catch {
      return [];
    }
  }

  private async getMemorySummary(): Promise<MemorySummary> {
    try {
      const memories = this.memoryManager.getRecent(20);
      return {
        recentMemories: memories.slice(0, 10).map(m => m.assistant),
        importantMemories: memories
          .slice(0, 5)
          .map(m => m.assistant),
        totalMemories: memories.length,
      };
    } catch {
      return { recentMemories: [], importantMemories: [], totalMemories: 0 };
    }
  }

  // ─── Derived Context ──────────────────────────────────────────────────

  private getWorldFrame(): WorldFrame {
    const frame = this.worldFrame ?? {};
    return {
      name: (frame.name as string) ?? (frame.title as string) ?? 'Unknown World',
      calendar: (frame.calendar as Record<string, unknown>) ?? {},
      magic: (frame.magic as Record<string, unknown>) ?? {},
      races: (frame.races as string[]) ?? [],
      factions: (frame.factions as string[]) ?? [],
      rules: (frame.rules as Record<string, unknown>) ?? {},
    };
  }

  private getTimeOfDay(time: Date): 'dawn' | 'day' | 'dusk' | 'night' {
    const hour = time.getHours();
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 18) return 'day';
    if (hour >= 18 && hour < 21) return 'dusk';
    return 'night';
  }

  private getPlayerInventory(character: EntityNode | null): ItemSummary[] {
    if (!character) return [];
    const l2 = character.profile.l2 as Record<string, unknown> | undefined;
    const inventory = l2?.inventory as Array<Record<string, unknown>> | undefined;
    if (!inventory) return [];

    return inventory.map(item => ({
      uid: String(item.uid ?? ''),
      name: String(item.name ?? ''),
      type: String(item.type ?? 'unknown'),
      quantity: Number(item.quantity ?? 1),
    }));
  }

  private getRelationshipGraph(character: EntityNode | null): RelationshipSummary {
    if (!character) return { nodes: [], edges: [] };
    const relationships = character.profile.l1?.relationships as Array<Record<string, unknown>> | undefined;
    if (!relationships) return { nodes: [], edges: [] };

    const nodes = new Map<string, { uid: string; name: string; type: string }>();
    const edges: RelationshipSummary['edges'] = [];

    for (const rel of relationships) {
      const target = String(rel.target ?? '');
      const type = String(rel.type ?? 'acquaintance');
      const strength = Number(rel.strength ?? 50);

      if (!nodes.has(target)) {
        const entity = this.entityStore.get(target);
        nodes.set(target, {
          uid: target,
          name: entity?.name ?? target,
          type: entity?.entityType ?? 'Unknown',
        });
      }

      edges.push({
        from: character.uid,
        to: target,
        type,
        strength,
      });
    }

    return { nodes: Array.from(nodes.values()), edges };
  }

  private getCurrentWeather(): string {
    // TODO: Integrate with world weather system
    return 'clear';
  }
}
