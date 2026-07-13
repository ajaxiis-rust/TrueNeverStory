import { Intent, isMovementIntent, isDialogueIntent, isActionIntent, isObservationIntent } from '@/models/intent';
import {
  OutcomeQuality,
  SimulationResult,
  SimulationContext,
  StateChange,
  Modifier,
  outcomeFromProbability,
} from '@/models/simulation';
import { UnifiedEntityStore } from '@/store/entity-store';
import { EventBus } from '@/lib/event-bus';
import { getLogger } from '@/utils/logger';

const logger = getLogger('SimulationEngine');

// ─── Risk Weights ────────────────────────────────────────────────────────────

const RISK_WEIGHTS: Record<string, number> = {
  safe: 0.9,
  moderate: 0.6,
  dangerous: 0.3,
  deadly: 0.1,
};

// ─── Simulation Engine ───────────────────────────────────────────────────────

export class SimulationEngine {
  constructor(
    private entityStore: UnifiedEntityStore,
    private eventBus: EventBus,
  ) {}

  /**
   * Run deterministic simulation for a parsed intent.
   * Returns outcome, state changes, and narrative hints.
   */
  async simulate(intent: Intent, context: SimulationContext): Promise<SimulationResult> {
    // Observation and command intents don't need a roll
    if (isObservationIntent(intent) || intent.type === 'command' || intent.type === 'meta') {
      return {
        outcome: OutcomeQuality.NEUTRAL,
        probability: 1,
        rawRoll: 0,
        modifiers: [],
        stateChanges: [],
        narrativeHints: [],
        requiresRoll: false,
      };
    }

    // Dialogue is usually neutral (NPC decides response)
    if (isDialogueIntent(intent)) {
      return this.simulateDialogue(intent, context);
    }

    // Movement and action need probability rolls
    const modifiers = this.resolveModifiers(intent, context);
    const probability = this.computeProbability(intent, modifiers, context);
    const rawRoll = Math.random();
    const outcome = outcomeFromProbability(probability);

    const stateChanges = this.computeStateChanges(intent, outcome, context);
    const narrativeHints = this.generateHints(intent, outcome, context);

    logger.debug(`Simulation: ${intent.type} → ${outcome} (${(probability * 100).toFixed(1)}%)`);

    return {
      outcome,
      probability,
      rawRoll,
      modifiers,
      stateChanges,
      narrativeHints,
      requiresRoll: true,
    };
  }

  // ─── Dialogue Simulation ───────────────────────────────────────────────

  private simulateDialogue(intent: Intent & { type: 'dialogue' }, context: SimulationContext): SimulationResult {
    const npc = this.entityStore.getByNameAndType(intent.target, 'Character');
    if (!npc) {
      return {
        outcome: OutcomeQuality.NEUTRAL,
        probability: 1,
        rawRoll: 0,
        modifiers: [],
        stateChanges: [],
        narrativeHints: [`NPC "${intent.target}" not found — dialogue may fail`],
        requiresRoll: false,
      };
    }

    // Check if NPC has hidden motivations in L3
    const l3 = npc.profile.l3 as Record<string, unknown> | undefined;
    const hiddenMotivation = l3?.hiddenMotivation as string | undefined;

    const hints: string[] = [];
    if (hiddenMotivation) {
      hints.push(`NPC has hidden motivation: ${hiddenMotivation}`);
    }

    // Tone affects relationship
    const stateChanges: StateChange[] = [];
    if (intent.tone && intent.tone !== 'neutral') {
      const relationshipField = `relationship_with_${intent.target.toLowerCase().replace(/\s+/g, '_')}`;
      const delta = intent.tone === 'friendly' ? 5 : intent.tone === 'aggressive' ? -10 : 0;
      if (delta !== 0) {
        stateChanges.push({
          entityUid: npc.uid,
          layer: 'l2',
          field: relationshipField,
          operation: 'increment',
          value: delta,
          description: `Relationship ${delta > 0 ? 'improved' : 'worsened'} by ${Math.abs(delta)} due to ${intent.tone} tone`,
        });
      }
    }

    return {
      outcome: OutcomeQuality.NEUTRAL,
      probability: 1,
      rawRoll: 0,
      modifiers: [],
      stateChanges,
      narrativeHints: hints,
      requiresRoll: false,
    };
  }

  // ─── Modifier Resolution ──────────────────────────────────────────────

  private resolveModifiers(intent: Intent, context: SimulationContext): Modifier[] {
    const modifiers: Modifier[] = [];

    // Risk level modifier
    if (isActionIntent(intent) && intent.risk_level) {
      const weight = RISK_WEIGHTS[intent.risk_level] ?? 0.5;
      modifiers.push({
        name: 'risk_level',
        value: weight,
        source: `Risk level: ${intent.risk_level}`,
      });
    }

    // Character level bonus (higher level = easier)
    const levelBonus = Math.min(context.characterLevel * 0.02, 0.2);
    if (levelBonus > 0) {
      modifiers.push({
        name: 'character_level',
        value: levelBonus,
        source: `Level ${context.characterLevel} bonus`,
      });
    }

    // Time of day modifier
    const timeModifiers: Record<string, number> = {
      dawn: 0.05,
      day: 0,
      dusk: -0.05,
      night: -0.1,
    };
    const timeMod = timeModifiers[context.timeOfDay] ?? 0;
    if (timeMod !== 0) {
      modifiers.push({
        name: 'time_of_day',
        value: timeMod,
        source: `Time: ${context.timeOfDay}`,
      });
    }

    // Location danger modifier
    if (context.locationDanger > 0) {
      const dangerMod = -context.locationDanger * 0.1;
      modifiers.push({
        name: 'location_danger',
        value: dangerMod,
        source: `Danger level: ${context.locationDanger}`,
      });
    }

    // Buff/debuff modifiers
    for (const buff of context.activeBuffs) {
      modifiers.push({
        name: 'buff',
        value: 0.1,
        source: `Buff: ${buff}`,
      });
    }
    for (const debuff of context.activeDebuffs) {
      modifiers.push({
        name: 'debuff',
        value: -0.1,
        source: `Debuff: ${debuff}`,
      });
    }

    return modifiers;
  }

  // ─── Probability Computation ──────────────────────────────────────────

  private computeProbability(
    intent: Intent,
    modifiers: Modifier[],
    context: SimulationContext,
  ): number {
    // Base probability from risk level or default
    let base = 0.5;
    if (isActionIntent(intent) && intent.risk_level) {
      base = RISK_WEIGHTS[intent.risk_level] ?? 0.5;
    }

    // Apply modifiers
    let total = base;
    for (const mod of modifiers) {
      total += mod.value;
    }

    // Clamp to [0.01, 0.99]
    return Math.max(0.01, Math.min(0.99, total));
  }

  // ─── State Change Computation ─────────────────────────────────────────

  private computeStateChanges(
    intent: Intent,
    outcome: OutcomeQuality,
    context: SimulationContext,
  ): StateChange[] {
    const changes: StateChange[] = [];

    if (isMovementIntent(intent)) {
      // Movement always succeeds (scene handles failure)
      changes.push({
        entityUid: `Character:${context.characterLevel}`, // Will be resolved by caller
        layer: 'l2',
        field: 'current_location',
        operation: 'set',
        value: intent.destination,
        description: `Move to ${intent.destination}`,
      });
    }

    if (isActionIntent(intent) && outcome !== OutcomeQuality.NEUTRAL) {
      // Action outcomes affect world state
      if (outcome === OutcomeQuality.CRITICAL_SUCCESS) {
        changes.push({
          entityUid: 'world',
          layer: 'l2',
          field: 'player_reputation',
          operation: 'increment',
          value: 10,
          description: 'Critical success boosts reputation',
        });
      } else if (outcome === OutcomeQuality.CRITICAL_FAILURE) {
        changes.push({
          entityUid: 'world',
          layer: 'l2',
          field: 'player_reputation',
          operation: 'decrement',
          value: 5,
          description: 'Critical failure hurts reputation',
        });
      }
    }

    return changes;
  }

  // ─── Narrative Hints ──────────────────────────────────────────────────

  private generateHints(
    intent: Intent,
    outcome: OutcomeQuality,
    context: SimulationContext,
  ): string[] {
    const hints: string[] = [];

    if (isActionIntent(intent)) {
      switch (outcome) {
        case OutcomeQuality.CRITICAL_FAILURE:
          hints.push('The action went catastrophically wrong');
          hints.push('The character should face severe consequences');
          break;
        case OutcomeQuality.FAILURE:
          hints.push('The action did not succeed');
          hints.push('The character should face setback or disappointment');
          break;
        case OutcomeQuality.PARTIAL_SUCCESS:
          hints.push('The action partially succeeded');
          hints.push('There should be a catch or complication');
          break;
        case OutcomeQuality.SUCCESS:
          hints.push('The action succeeded as intended');
          break;
        case OutcomeQuality.CRITICAL_SUCCESS:
          hints.push('The action exceeded all expectations');
          hints.push('The character should feel triumphant');
          break;
      }
    }

    if (isMovementIntent(intent)) {
      hints.push(`The character arrives at ${intent.destination}`);
      if (context.timeOfDay === 'night') {
        hints.push('The journey feels more ominous at night');
      }
    }

    return hints;
  }
}
