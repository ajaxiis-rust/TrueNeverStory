// ─── Heartbeat Stage ─────────────────────────────────────────────────────────

export enum HeartbeatStage {
  INTENT_PARSED = 'intent_parsed',
  SIMULATION_STARTED = 'simulation_started',
  DICE_ROLLING = 'dice_rolling',
  SIMULATION_COMPLETE = 'simulation_complete',
  STATE_MUTATING = 'state_mutating',
  STATE_MUTATED = 'state_mutated',
  PATTERN_SELECTING = 'pattern_selecting',
  PATTERN_SELECTED = 'pattern_selected',
  PROSE_GENERATING = 'prose_generating',
  PROSE_COMPLETE = 'prose_complete',
  CENSOR_CHECKING = 'censor_checking',
  CENSOR_PASSED = 'censor_passed',
  TRANSLATING = 'translating',
  COMPLETE = 'complete',
}

// ─── Heartbeat Event ─────────────────────────────────────────────────────────

export interface HeartbeatEvent {
  stage: HeartbeatStage;
  message: string;
  progress: number;
  metadata?: Record<string, unknown>;
}

// ─── Heartbeat Messages ──────────────────────────────────────────────────────

export const HEARTBEAT_MESSAGES: Record<HeartbeatStage, string> = {
  [HeartbeatStage.INTENT_PARSED]: 'Understanding your input...',
  [HeartbeatStage.SIMULATION_STARTED]: 'Rolling dice...',
  [HeartbeatStage.DICE_ROLLING]: 'Calculating outcome...',
  [HeartbeatStage.SIMULATION_COMPLETE]: 'Outcome determined',
  [HeartbeatStage.STATE_MUTATING]: 'Updating world state...',
  [HeartbeatStage.STATE_MUTATED]: 'World state updated',
  [HeartbeatStage.PATTERN_SELECTING]: 'Selecting narrative pattern...',
  [HeartbeatStage.PATTERN_SELECTED]: 'Pattern selected',
  [HeartbeatStage.PROSE_GENERATING]: 'Weaving narrative...',
  [HeartbeatStage.PROSE_COMPLETE]: 'Narrative ready',
  [HeartbeatStage.CENSOR_CHECKING]: 'Polishing prose...',
  [HeartbeatStage.CENSOR_PASSED]: 'Prose polished',
  [HeartbeatStage.TRANSLATING]: 'Translating...',
  [HeartbeatStage.COMPLETE]: 'Complete',
};

// ─── Heartbeat Progress ──────────────────────────────────────────────────────

export const HEARTBEAT_PROGRESS: Record<HeartbeatStage, number> = {
  [HeartbeatStage.INTENT_PARSED]: 0.1,
  [HeartbeatStage.SIMULATION_STARTED]: 0.2,
  [HeartbeatStage.DICE_ROLLING]: 0.25,
  [HeartbeatStage.SIMULATION_COMPLETE]: 0.35,
  [HeartbeatStage.STATE_MUTATING]: 0.4,
  [HeartbeatStage.STATE_MUTATED]: 0.45,
  [HeartbeatStage.PATTERN_SELECTING]: 0.5,
  [HeartbeatStage.PATTERN_SELECTED]: 0.55,
  [HeartbeatStage.PROSE_GENERATING]: 0.6,
  [HeartbeatStage.PROSE_COMPLETE]: 0.85,
  [HeartbeatStage.CENSOR_CHECKING]: 0.9,
  [HeartbeatStage.CENSOR_PASSED]: 0.95,
  [HeartbeatStage.TRANSLATING]: 0.97,
  [HeartbeatStage.COMPLETE]: 1.0,
};
