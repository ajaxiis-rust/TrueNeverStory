import type { Intent } from '@/models/intent';
import type { SimulationResult } from '@/models/simulation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawAggregates {
  dialogueInitiated: number;
  dialogueCount: number;
  dialogueTotalWords: number;
  avoidedDialogues: number;
  explorationActions: number;
  riskTakingActions: number;
  planningActions: number;
  combatInitiated: number;
  inputTotalChars: number;
  expressiveActions: number;
}

export interface DerivedMetrics {
  dialogueInitiated: number;
  dialogueAvgLength: number;
  avoidedDialogues: number;
  explorationActions: number;
  riskTakingActions: number;
  planningActions: number;
  combatInitiated: number;
  expressiveActions: number;
  inputLengthAvg: number;
  uniqueLocationsVisited: number;
}

export interface AxisSignals {
  extraversion: number;
  intuition: number;
  thinking: number;
  judging: number;
}

// ─── Detection rules ──────────────────────────────────────────────────────────

function isAttackVerb(verb?: string): boolean {
  return /^(attack|strike|fight|hit|slash|stab|shoot|punch|kick)$/i.test(verb ?? '');
}

function isExpressiveVerb(verb?: string): boolean {
  return /^(hug|cry|laugh|kiss|comfort|mourn|celebrate|weep|cheer|embrace|grieve)$/i.test(verb ?? '');
}

function isPlanningVerb(verb?: string): boolean {
  return /^(trade|craft|buy|sell|forge|brew|cook|accept quest|plan|prepare|organize)$/i.test(verb ?? '');
}

// ─── MetricsCollector ─────────────────────────────────────────────────────────

export class MetricsCollector {
  private aggregates: RawAggregates = {
    dialogueInitiated: 0,
    dialogueCount: 0,
    dialogueTotalWords: 0,
    avoidedDialogues: 0,
    explorationActions: 0,
    riskTakingActions: 0,
    planningActions: 0,
    combatInitiated: 0,
    inputTotalChars: 0,
    expressiveActions: 0,
  };
  private turns = 0;

  recordInput(rawInput: string): void {
    this.turns++;
    this.aggregates.inputTotalChars += rawInput.length;
  }

  recordIntent(intent: Intent, rawInput: string, initiated?: boolean): void {
    if (intent.type === 'dialogue') {
      this.aggregates.dialogueCount++;
      this.aggregates.dialogueTotalWords += rawInput.split(/\s+/).length;
      if (initiated === true) {
        this.aggregates.dialogueInitiated++;
      }
    } else if (intent.type === 'action') {
      if (isAttackVerb(intent.verb)) this.aggregates.combatInitiated++;
      if (isExpressiveVerb(intent.verb)) this.aggregates.expressiveActions++;
    } else if (intent.type === 'observation') {
      this.aggregates.explorationActions++;
    }
  }

  recordSimulation(intent: Intent, simResult: SimulationResult): void {
    if (intent.type === 'action') {
      if (
        intent.risk_level === 'dangerous' ||
        intent.risk_level === 'deadly' ||
        simResult.outcome === 'critical_success' ||
        simResult.outcome === 'critical_failure'
      ) {
        this.aggregates.riskTakingActions++;
      }
    }
    if (intent.type === 'action' || intent.type === 'command') {
      const verb = intent.type === 'action' ? intent.verb : intent.command;
      if (isPlanningVerb(verb)) {
        this.aggregates.planningActions++;
      }
    }
  }

  recordAvoidedDialogue(): void {
    this.aggregates.avoidedDialogues++;
  }

  decay(): void {
    this.aggregates.dialogueInitiated *= 0.9;
    this.aggregates.dialogueCount *= 0.9;
    this.aggregates.dialogueTotalWords *= 0.9;
    this.aggregates.avoidedDialogues *= 0.9;
    this.aggregates.explorationActions *= 0.9;
    this.aggregates.riskTakingActions *= 0.9;
    this.aggregates.planningActions *= 0.9;
    this.aggregates.combatInitiated *= 0.9;
    this.aggregates.inputTotalChars *= 0.9;
    this.aggregates.expressiveActions *= 0.9;
  }

  getAggregates(): RawAggregates {
    return { ...this.aggregates };
  }

  getTurnCount(): number {
    return this.turns;
  }

  restore(aggregates: RawAggregates, totalTurns: number): void {
    this.aggregates = { ...aggregates };
    this.turns = totalTurns;
  }
}

// ─── deriveMetrics ────────────────────────────────────────────────────────────

export function deriveMetrics(
  aggregates: RawAggregates,
  totalTurns: number,
  visitedLocations: number,
): DerivedMetrics {
  return {
    dialogueInitiated: aggregates.dialogueInitiated,
    dialogueAvgLength: aggregates.dialogueTotalWords / Math.max(aggregates.dialogueCount, 1),
    avoidedDialogues: aggregates.avoidedDialogues,
    explorationActions: aggregates.explorationActions,
    riskTakingActions: aggregates.riskTakingActions,
    planningActions: aggregates.planningActions,
    combatInitiated: aggregates.combatInitiated,
    expressiveActions: aggregates.expressiveActions,
    inputLengthAvg: aggregates.inputTotalChars / Math.max(totalTurns, 1),
    uniqueLocationsVisited: visitedLocations,
  };
}

// ─── signal / normalize helpers ───────────────────────────────────────────────

function signal(value: number, threshold: number, weight: number): number {
  const normalized = Math.min(value / threshold, 1);
  return normalized * weight;
}

function normalize(signals: number[]): number {
  const sum = signals.reduce((a, b) => a + b, 0);
  const maxPossible = signals.reduce((a, b) => a + Math.abs(b), 0);
  if (maxPossible === 0) return 0.5;
  return Math.max(0, Math.min(1, (sum + maxPossible) / (2 * maxPossible)));
}

// ─── inferFromMetrics ─────────────────────────────────────────────────────────

export function inferFromMetrics(m: DerivedMetrics): AxisSignals {
  return {
    extraversion: normalize([
      signal(m.dialogueInitiated, 5, 0.3),
      signal(m.dialogueAvgLength, 20, 0.2),
      signal(m.avoidedDialogues, 3, -0.2),
      signal(m.inputLengthAvg, 100, 0.15),
      signal(m.expressiveActions, 5, 0.15),
    ]),

    intuition: normalize([
      signal(m.explorationActions, 10, 0.3),
      signal(m.planningActions, 5, 0.3),
      signal(m.inputLengthAvg, 150, 0.2),
      signal(m.uniqueLocationsVisited, 10, 0.2),
    ]),

    thinking: normalize([
      signal(m.riskTakingActions, 5, 0.3),
      signal(m.combatInitiated, 5, 0.2),
      signal(m.expressiveActions, 5, -0.3),
      signal(m.planningActions, 5, 0.2),
    ]),

    judging: normalize([
      signal(m.planningActions, 5, 0.4),
      signal(m.uniqueLocationsVisited, 15, -0.2),
      signal(m.combatInitiated, 5, 0.2),
      signal(m.dialogueAvgLength, 20, 0.2),
    ]),
  };
}
