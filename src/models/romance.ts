/**
 * Romance system models (replaces world_core/romance/models.py).
 */

export enum RomanceStatus {
  STRANGER = "stranger",
  ACQUAINTANCE = "acquaintance",
  FRIEND = "friend",
  CLOSE_FRIEND = "close_friend",
  CRUSH = "crush",
  DATING = "dating",
  ENGAGED = "engaged",
  MARRIED = "married",
  ESTRANGED = "estranged",
  RIVAL = "rival",
}

export enum RomanceProgression {
  ATTRACTION = "attraction",
  CONFESSION = "confession",
  DATE = "date",
  KISS = "kiss",
  RELATIONSHIP = "relationship",
  PROPOSAL = "proposal",
  MARRIAGE = "marriage",
  BREAKUP = "breakup",
  JEALOUSY = "jealousy",
}

export interface RelationshipMemoryData {
  pair_id: string;
  status: RomanceStatus;
  progression_stage: RomanceProgression;
  compatibility: number;
  affection: number;
  history?: Array<Record<string, unknown>>;
  last_interaction?: string | null;
  notes?: string | null;
  gifts_given?: string[];
}

export class RelationshipMemory {
  pairId: string;
  status: RomanceStatus;
  progressionStage: RomanceProgression;
  compatibility: number;
  affection: number;
  history: Array<Record<string, unknown>>;
  lastInteraction: Date;
  notes: string | null;
  giftsGiven: string[];

  constructor(data: RelationshipMemoryData) {
    this.pairId = data.pair_id;
    this.status = data.status ?? RomanceStatus.STRANGER;
    this.progressionStage = data.progression_stage ?? RomanceProgression.ATTRACTION;
    this.compatibility = Math.max(0, Math.min(1, data.compatibility ?? 0.5));
    this.affection = Math.max(0, Math.min(1, data.affection ?? 0.3));
    this.history = data.history ?? [];
    this.lastInteraction = data.last_interaction ? new Date(data.last_interaction) : new Date();
    this.notes = data.notes ?? null;
    this.giftsGiven = data.gifts_given ?? [];
  }

  toDict(): RelationshipMemoryData {
    return {
      pair_id: this.pairId,
      status: this.status,
      progression_stage: this.progressionStage,
      compatibility: this.compatibility,
      affection: this.affection,
      history: this.history,
      last_interaction: this.lastInteraction.toISOString(),
      notes: this.notes,
      gifts_given: this.giftsGiven,
    };
  }

  static fromDict(data: Record<string, unknown>): RelationshipMemory {
    return new RelationshipMemory({
      pair_id: data.pair_id as string,
      status: data.status as RomanceStatus,
      progression_stage: data.progression_stage as RomanceProgression,
      compatibility: data.compatibility as number,
      affection: data.affection as number,
      history: data.history as Array<Record<string, unknown>>,
      last_interaction: data.last_interaction as string | null,
      notes: data.notes as string | null,
      gifts_given: data.gifts_given as string[],
    });
  }
}

export interface RomanceParamsData {
  actor: string;
  target: string;
  action: RomanceProgression;
  location: string;
  extra?: Record<string, unknown>;
}

export class RomanceParams {
  actor: string;
  target: string;
  action: RomanceProgression;
  location: string;
  extra: Record<string, unknown>;

  constructor(data: RomanceParamsData) {
    this.actor = data.actor;
    this.target = data.target;
    this.action = data.action;
    this.location = data.location;
    this.extra = data.extra ?? {};
  }
}

export interface RomanceEventData {
  event_type: RomanceProgression;
  actor: string;
  target: string;
  success: boolean;
  timestamp: string;
  affection_change: number;
  narrative: string;
  location: string;
}

export class RomanceEvent {
  eventType: RomanceProgression;
  actor: string;
  target: string;
  success: boolean;
  timestamp: Date;
  affectionChange: number;
  narrative: string;
  location: string;

  constructor(data: RomanceEventData) {
    this.eventType = data.event_type;
    this.actor = data.actor;
    this.target = data.target;
    this.success = data.success;
    this.timestamp = new Date(data.timestamp);
    this.affectionChange = data.affection_change;
    this.narrative = data.narrative;
    this.location = data.location;
  }

  toDict(): RomanceEventData {
    return {
      event_type: this.eventType,
      actor: this.actor,
      target: this.target,
      success: this.success,
      timestamp: this.timestamp.toISOString(),
      affection_change: this.affectionChange,
      narrative: this.narrative,
      location: this.location,
    };
  }
}
