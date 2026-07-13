import { StateChange } from '@/models/simulation';
import { UnifiedEntityStore } from '@/store/entity-store';
import { EventBus } from '@/lib/event-bus';
import { EventTopic } from '@/lib/event-bus';
import { Chronicler } from '@/services/chronicler';
import { getLogger } from '@/utils/logger';

const logger = getLogger('StateMutator');

// ─── Applied Change ──────────────────────────────────────────────────────────

export interface AppliedChange extends StateChange {
  oldValue: unknown;
  newValue: unknown;
  timestamp: Date;
}

export interface AppliedChanges {
  applied: AppliedChange[];
  timestamp: Date;
}

// ─── State Mutator ───────────────────────────────────────────────────────────

export class StateMutator {
  constructor(
    private entityStore: UnifiedEntityStore,
    private eventBus: EventBus,
    private chronicler: Chronicler,
  ) {}

  /**
   * Apply a batch of state changes to the EntityStore.
   * Mutations happen immediately, before prose generation.
   */
  async applyChanges(
    changes: StateChange[],
    resolvedUids?: Map<string, string>,
  ): Promise<AppliedChanges> {
    if (changes.length === 0) {
      return { applied: [], timestamp: new Date() };
    }

    const applied: AppliedChange[] = [];

    for (const change of changes) {
      // Resolve entity UID if provided
      const uid = resolvedUids?.get(change.entityUid) ?? change.entityUid;

      const entity = this.entityStore.get(uid);
      if (!entity) {
        logger.warn(`Entity not found: ${uid}, skipping change: ${change.description}`);
        continue;
      }

      // Get old value
      const oldValue = this.getNestedValue(entity.profile, change.layer, change.field);

      // Apply mutation
      const newValue = this.applyMutation(entity, change);

      // Record applied change
      applied.push({
        ...change,
        entityUid: uid,
        oldValue,
        newValue,
        timestamp: new Date(),
      });

      // Publish entity update event
      this.eventBus.publishSimple(EventTopic.ENTITY_UPDATED, {
        uid,
        layer: change.layer,
        field: change.field,
        oldValue,
        newValue,
      }, 'simulation');
    }

    // Batch save
    this.entityStore.saveIfDirty();

    // Log to chronicler
    if (applied.length > 0) {
      const description = applied.map(c => c.description).join('; ');
      await this.chronicler.logEvent(description, new Date(), 'state_mutation');
    }

    logger.debug(`Applied ${applied.length} state changes`);
    return { applied, timestamp: new Date() };
  }

  // ─── Mutation Application ─────────────────────────────────────────────

  private applyMutation(
    entity: { profile: { l1: Record<string, unknown>; l2: Record<string, unknown>; l3: Record<string, unknown> } },
    change: StateChange,
  ): unknown {
    const layer = entity.profile[change.layer as 'l1' | 'l2' | 'l3'];
    if (!layer) return undefined;

    const oldValue = layer[change.field];

    switch (change.operation) {
      case 'set':
        layer[change.field] = change.value;
        break;

      case 'add':
        if (Array.isArray(layer[change.field])) {
          (layer[change.field] as unknown[]).push(change.value);
        } else {
          layer[change.field] = [change.value];
        }
        break;

      case 'remove':
        if (Array.isArray(layer[change.field])) {
          const arr = layer[change.field] as unknown[];
          const idx = arr.indexOf(change.value);
          if (idx !== -1) arr.splice(idx, 1);
        }
        break;

      case 'increment':
        if (typeof layer[change.field] === 'number' && typeof change.value === 'number') {
          layer[change.field] = (layer[change.field] as number) + change.value;
        } else {
          layer[change.field] = change.value;
        }
        break;

      case 'decrement':
        if (typeof layer[change.field] === 'number' && typeof change.value === 'number') {
          layer[change.field] = (layer[change.field] as number) - change.value;
        } else {
          layer[change.field] = change.value;
        }
        break;
    }

    return layer[change.field];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private getNestedValue(
    profile: { l1: Record<string, unknown>; l2: Record<string, unknown>; l3: Record<string, unknown> },
    layer: string,
    field: string,
  ): unknown {
    const layerObj = profile[layer as 'l1' | 'l2' | 'l3'];
    if (!layerObj) return undefined;
    return layerObj[field];
  }
}
