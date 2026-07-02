/**
 * TrueNeverStory — Unified data models.
 * All shared data structures live here.
 */

// ── Entity Type Enum ──────────────────────────────────────────────

export const EntityType = {
  CHARACTER: "Character",
  FACTION: "Faction",
  LOCATION: "Location",
  ITEM: "Item",
  EVENT: "Event",
  WORLD_RULE: "WorldRule",
  RACE: "Race",
  UNKNOWN: "Unknown",
} as const;

export type EntityTypeValue = (typeof EntityType)[keyof typeof EntityType];

export function entityTypeFromString(s: string): EntityTypeValue {
  const values = Object.values(EntityType) as string[];
  return values.includes(s) ? (s as EntityTypeValue) : EntityType.UNKNOWN;
}

// ── Layered Profile ───────────────────────────────────────────────

export interface LayerDict {
  [key: string]: unknown;
}

export class LayeredProfile {
  l1: LayerDict;
  l2: LayerDict;
  l3: LayerDict;

  constructor(l1?: LayerDict, l2?: LayerDict, l3?: LayerDict) {
    this.l1 = l1 ?? {};
    this.l2 = l2 ?? {};
    this.l3 = l3 ?? {};
  }

  get name(): string {
    return (this.l1.name as string) ?? "";
  }

  get entityType(): string {
    return (this.l1.type as string) ?? "";
  }

  get summary(): string {
    return (this.l1.summary as string) ?? "";
  }

  get tags(): string[] {
    return (this.l1.tags as string[]) ?? [];
  }

  get relationships(): LayerDict[] {
    if (!this.l1.relationships) {
      this.l1.relationships = [];
    }
    return this.l1.relationships as LayerDict[];
  }

  getLayer(layer: string): LayerDict {
    if (layer === "l1") return this.l1;
    if (layer === "l2") return this.l2;
    if (layer === "l3") return this.l3;
    return {};
  }

  getEffectiveData(layers?: string[]): { [key: string]: LayerDict } {
    const result: { [key: string]: LayerDict } = {};
    for (const layerName of layers ?? ["l1", "l2", "l3"]) {
      const data = this.getLayer(layerName);
      if (Object.keys(data).length > 0) {
        result[layerName] = data;
      }
    }
    return result;
  }

  toDict(): { l1: LayerDict; l2: LayerDict; l3: LayerDict } {
    return { l1: this.l1, l2: this.l2, l3: this.l3 };
  }

  static fromDict(data: { l1?: LayerDict; l2?: LayerDict; l3?: LayerDict }): LayeredProfile {
    return new LayeredProfile(data.l1, data.l2, data.l3);
  }
}

// ── Entity Node ───────────────────────────────────────────────────

export interface EntityNodeData {
  uid: string;
  name: string;
  entity_type: string;
  profile: { l1: LayerDict; l2: LayerDict; l3: LayerDict };
  group_id?: string;
  created_at?: number;
  updated_at?: number;
}

export class EntityNode {
  uid: string;
  name: string;
  entityType: string;
  profile: LayeredProfile;
  groupId: string;
  createdAt: number;
  updatedAt: number;

  constructor(data: EntityNodeData) {
    const now = Date.now() / 1000;
    this.uid = data.uid;
    this.name = data.name;
    this.entityType = data.entity_type;
    this.profile = LayeredProfile.fromDict(data.profile);
    this.groupId = data.group_id ?? "";
    this.createdAt = data.created_at ?? now;
    this.updatedAt = data.updated_at ?? now;
  }

  get etype(): EntityTypeValue {
    return entityTypeFromString(this.entityType);
  }

  toDict(): EntityNodeData {
    return {
      uid: this.uid,
      name: this.name,
      entity_type: this.entityType,
      profile: this.profile.toDict(),
      group_id: this.groupId,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }

  static fromDict(data: EntityNodeData): EntityNode {
    return new EntityNode(data);
  }
}

// ── Relationship ──────────────────────────────────────────────────

export interface RelationshipData {
  source: string;
  target: string;
  type: string;
  strength?: number;
  source_layer?: string;
}

export class Relationship {
  sourceUid: string;
  targetUid: string;
  relType: string;
  strength: number;
  sourceLayer: string;

  constructor(data: RelationshipData) {
    this.sourceUid = data.source;
    this.targetUid = data.target;
    this.relType = data.type;
    this.strength = data.strength ?? 0;
    this.sourceLayer = data.source_layer ?? "l1";
  }

  toDict(): RelationshipData {
    return {
      source: this.sourceUid,
      target: this.targetUid,
      type: this.relType,
      strength: this.strength,
      source_layer: this.sourceLayer,
    };
  }
}

// ── World Frame ───────────────────────────────────────────────────

export interface WorldFrameData {
  world_name?: string;
  calendar_era?: Record<string, string>;
  magic_system?: Record<string, string>;
  races?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
  characters?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  historical_events?: Record<string, unknown>[];
  world_rules?: Record<string, unknown>[];
}

export class WorldFrame {
  worldName: string;
  calendarEra: Record<string, string>;
  magicSystem: Record<string, string>;
  races: Record<string, unknown>[];
  factions: Record<string, unknown>[];
  characters: Record<string, unknown>[];
  locations: Record<string, unknown>[];
  items: Record<string, unknown>[];
  historicalEvents: Record<string, unknown>[];
  worldRules: Record<string, unknown>[];

  constructor(data: WorldFrameData = {}) {
    this.worldName = data.world_name ?? "";
    this.calendarEra = data.calendar_era ?? {};
    this.magicSystem = data.magic_system ?? {};
    this.races = data.races ?? [];
    this.factions = data.factions ?? [];
    this.characters = data.characters ?? [];
    this.locations = data.locations ?? [];
    this.items = data.items ?? [];
    this.historicalEvents = data.historical_events ?? [];
    this.worldRules = data.world_rules ?? [];
  }

  toDict(): WorldFrameData {
    return {
      world_name: this.worldName,
      calendar_era: this.calendarEra,
      magic_system: this.magicSystem,
      races: this.races,
      factions: this.factions,
      characters: this.characters,
      locations: this.locations,
      items: this.items,
      historical_events: this.historicalEvents,
      world_rules: this.worldRules,
    };
  }

  getRulesText(): string {
    return this.worldRules
      .map((r) => `- ${r.name}: ${r.description}`)
      .join("\n");
  }

  getEntityNames(): string[] {
    const names: string[] = [];
    for (const key of [
      "races", "factions", "characters",
      "locations", "items", "historicalEvents", "worldRules",
    ] as const) {
      for (const item of this[key]) {
        if (typeof item === "object" && item !== null && "name" in item) {
          names.push(item.name as string);
        } else {
          names.push(String(item));
        }
      }
    }
    return names;
  }

  static fromDict(data: WorldFrameData): WorldFrame {
    return new WorldFrame(data);
  }
}
