import { Intent } from '@/models/intent';

// ─── Outcome Quality ─────────────────────────────────────────────────────────

export enum OutcomeQuality {
  CRITICAL_FAILURE = 'critical_failure',
  FAILURE = 'failure',
  PARTIAL_SUCCESS = 'partial_success',
  SUCCESS = 'success',
  CRITICAL_SUCCESS = 'critical_success',
  NEUTRAL = 'neutral',
}

export function outcomeFromProbability(prob: number): OutcomeQuality {
  if (prob <= 0.05) return OutcomeQuality.CRITICAL_FAILURE;
  if (prob <= 0.35) return OutcomeQuality.FAILURE;
  if (prob <= 0.65) return OutcomeQuality.PARTIAL_SUCCESS;
  if (prob <= 0.90) return OutcomeQuality.SUCCESS;
  return OutcomeQuality.CRITICAL_SUCCESS;
}

export function outcomeLabel(outcome: OutcomeQuality): string {
  const labels: Record<OutcomeQuality, string> = {
    [OutcomeQuality.CRITICAL_FAILURE]: 'Critical Failure',
    [OutcomeQuality.FAILURE]: 'Failure',
    [OutcomeQuality.PARTIAL_SUCCESS]: 'Partial Success',
    [OutcomeQuality.SUCCESS]: 'Success',
    [OutcomeQuality.CRITICAL_SUCCESS]: 'Critical Success',
    [OutcomeQuality.NEUTRAL]: 'Neutral',
  };
  return labels[outcome];
}

// ─── State Changes ───────────────────────────────────────────────────────────

export interface StateChange {
  entityUid: string;
  layer: 'l1' | 'l2' | 'l3';
  field: string;
  operation: 'set' | 'add' | 'remove' | 'increment' | 'decrement';
  value: unknown;
  description: string;
}

// ─── Simulation Result ───────────────────────────────────────────────────────

export interface Modifier {
  name: string;
  value: number;
  source: string;
}

export interface SimulationResult {
  outcome: OutcomeQuality;
  probability: number;
  rawRoll: number;
  modifiers: Modifier[];
  stateChanges: StateChange[];
  narrativeHints: string[];
  requiresRoll: boolean;
}

// ─── Simulation Context ──────────────────────────────────────────────────────

export interface SimulationContext {
  characterLevel: number;
  characterStats: Record<string, number>;
  locationDanger: number;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  weather: string;
  activeBuffs: string[];
  activeDebuffs: string[];
}
