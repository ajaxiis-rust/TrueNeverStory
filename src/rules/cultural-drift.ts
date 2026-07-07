/**
 * Cultural Drift — models cultural resistance and change over time.
 * Rules don't change instantly; societies resist rapid transformation.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("cultural-drift");

export interface DriftConfig {
  resistance: number;      // 0-1, how much culture resists change (1 = max resistance)
  adaptationSpeed: number; // 0-1, how fast society adapts to new rules (1 = instant)
  stabilityBonus: number;  // bonus for long-established rules
  generationsToAdapt: number; // generations needed for full adaptation
}

export interface CulturalState {
  currentRule: string;
  establishedTurns: number;
  loyalty: number;         // 0-1, how loyal population is to current system
  adaptationProgress: number; // 0-1, how adapted to current system
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  resistance: 0.7,
  adaptationSpeed: 0.1,
  stabilityBonus: 0.2,
  generationsToAdapt: 5,
};

const RULE_RESISTANCE: Record<string, number> = {
  feudalism: 0.8,        // Old systems resist change strongly
  theocracy: 0.9,        // Religious systems are very resistant
  tribalism: 0.85,       // Traditional systems resist
  democracy: 0.5,        // Modern systems adapt faster
  capitalism: 0.6,
  socialism: 0.65,
  communism: 0.7,
  mercantilism: 0.75,
  anarchy: 0.3,          // Anarchy changes easily
  slavery: 0.85,         // Entrenched systems resist abolition
};

export class CulturalDrift {
  private _config: DriftConfig;
  private _states: Map<string, CulturalState> = new Map();

  constructor(config: Partial<DriftConfig> = {}) {
    this._config = { ...DEFAULT_DRIFT_CONFIG, ...config };
  }

  /**
   * Initialize cultural state for a world
   */
  initWorld(worldId: string, initialRule: string): void {
    this._states.set(worldId, {
      currentRule: initialRule,
      establishedTurns: 0,
      loyalty: 0.8,
      adaptationProgress: 1.0,
    });
  }

  /**
   * Check if a rule change is accepted by the population
   * Returns: acceptance probability (0-1)
   */
  checkChangeAcceptance(worldId: string, newRule: string): number {
    const state = this._states.get(worldId);
    if (!state) return 0.5;

    const resistance = this.getResistance(state.currentRule);
    const loyaltyFactor = state.loyalty * resistance;
    const adaptationFactor = state.adaptationProgress * this._config.adaptationSpeed;

    // Change is harder when:
    // - Current system is well-established (high loyalty)
    // - Current system has high resistance
    // - New system is very different
    const changeDifficulty = loyaltyFactor + (1 - adaptationFactor);

    // Change is easier when:
    // - Society is unhappy (low loyalty)
    // - New system is similar to old
    const changeEase = (1 - state.loyalty) * 0.5;

    const acceptance = Math.max(0, Math.min(1, 1 - changeDifficulty + changeEase));

    log.info(`Change acceptance for ${worldId}: ${state.currentRule} → ${newRule}: ${acceptance.toFixed(2)}`);
    return acceptance;
  }

  /**
   * Apply rule change if accepted
   */
  applyChange(worldId: string, newRule: string, accepted: boolean): void {
    const state = this._states.get(worldId);
    if (!state) return;

    if (accepted) {
      state.currentRule = newRule;
      state.establishedTurns = 0;
      state.loyalty = 0.5; // Reset loyalty after change
      state.adaptationProgress = 0.1;
      log.info(`Rule changed for ${worldId}: → ${newRule}`);
    } else {
      // Rejection strengthens loyalty to current system
      state.loyalty = Math.min(1, state.loyalty + 0.1);
      log.info(`Rule change rejected for ${worldId}: loyalty increased to ${state.loyalty}`);
    }
  }

  /**
   * Advance one turn — increase adaptation, loyalty, etc.
   */
  advanceTurn(worldId: string): void {
    const state = this._states.get(worldId);
    if (!state) return;

    state.establishedTurns++;

    // Adaptation increases over time
    const maxAdaptation = 1.0;
    state.adaptationProgress = Math.min(
      maxAdaptation,
      state.adaptationProgress + this._config.adaptationSpeed * (1 - state.adaptationProgress)
    );

    // Loyalty increases with stability
    const stabilityBonus = Math.min(
      this._config.stabilityBonus,
      state.establishedTurns * 0.02
    );
    state.loyalty = Math.min(1, state.loyalty + stabilityBonus * 0.1);
  }

  /**
   * Get resistance level for a rule
   */
  getResistance(rule: string): number {
    return RULE_RESISTANCE[rule] ?? this._config.resistance;
  }

  /**
   * Get current state
   */
  getState(worldId: string): CulturalState | undefined {
    return this._states.get(worldId);
  }

  /**
   * Calculate drift effect on happiness
   */
  getDriftEffect(worldId: string): { happinessModifier: number; description: string } {
    const state = this._states.get(worldId);
    if (!state) return { happinessModifier: 0, description: "No cultural state" };

    if (state.establishedTurns < 3) {
      return {
        happinessModifier: -5,
        description: "Cultural transition period",
      };
    } else if (state.adaptationProgress > 0.8) {
      return {
        happinessModifier: 5,
        description: "Well-adapted society",
      };
    }

    return {
      happinessModifier: 0,
      description: "Adapting to new system",
    };
  }
}
