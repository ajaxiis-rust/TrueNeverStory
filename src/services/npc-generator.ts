/**
 * NPCGenerator — intelligent NPC creation with archetype balance,
 * anti-duplicate, quality gates, and semantic diversity.
 */

import type { LLMQueue } from "../lib/llm-queue";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { EventBus } from "../lib/event-bus";
import { EventTopic } from "../lib/event-bus";
import { TaskPriority } from "../models/director";
import { LayeredProfile, EntityNode } from "../models/entity";
import {
  type ArchetypeConfig,
  ALL_ARCHETYPES,
  DEFAULT_ARCHETYPES,
  selectArchetype as weightedSelectArchetype,
} from "../models/archetype";
import { getLogger } from "../utils/logger";

const log = getLogger("npc-generator");

const DEFAULT_ARCHETYPES_OLD: Record<string, string> = {
  craftsman: "skilled artisan, works with hands (blacksmith, carpenter, weaver)",
  merchant: "trades goods, travels between towns, knows prices and people",
  guard: "protects locations, trained in combat, follows orders",
  sage: "scholar, knowledgeable, studies lore and history",
  wanderer: "travels freely, knows many places, tells stories",
  noble: "wealthy, politically connected, manages land or people",
  rogue: "sneaky, streetwise, knows underworld and secrets",
  cleric: "spiritual leader, heals, guides morality, temple-connected",
  farmer: "works the land, practical, knows seasons and nature",
  healer: "medical knowledge, tends to sick and injured, calm demeanor",
};

export interface NPCGeneratorDeps {
  llmQueue: LLMQueue;
  entityStore: UnifiedEntityStore;
  eventBus: EventBus;
  worldFrame: Record<string, unknown> | null;
}

export interface GeneratedNPC {
  name: string;
  archetype: string;
  personality: string;
  profession: string;
  faction: string;
  race: string;
  node: EntityNode;
}

export class NPCGenerator {
  private _llmQueue: LLMQueue;
  private _entityStore: UnifiedEntityStore;
  private _eventBus: EventBus;
  private _worldFrame: Record<string, unknown> | null;

  constructor(deps: NPCGeneratorDeps) {
    this._llmQueue = deps.llmQueue;
    this._entityStore = deps.entityStore;
    this._eventBus = deps.eventBus;
    this._worldFrame = deps.worldFrame;
  }

  private _getArchetypes(): ArchetypeConfig[] {
    const custom = this._worldFrame?.npc_archetypes;
    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      const result: ArchetypeConfig[] = [];
      for (const [k, v] of Object.entries(custom as Record<string, unknown>)) {
        if (typeof v === "string") {
          result.push({ name: k, weight: 1, unique: false, contexts: [], description: v });
        } else if (typeof v === "object" && v !== null && "description" in v) {
          const obj = v as Record<string, unknown>;
          result.push({
            name: k,
            weight: (obj.weight as number) ?? 1,
            unique: (obj.unique as boolean) ?? false,
            contexts: (obj.contexts as string[]) ?? [],
            description: obj.description as string,
          });
        }
      }
      if (result.length > 0) return result;
    }
    return [...ALL_ARCHETYPES];
  }

  selectArchetype(context?: string): string {
    const archetypes = this._getArchetypes();
    const existing = this._entityStore.listByType("Character").map((n) => {
      const tags = (n.profile.l1.tags as string[]) ?? [];
      return tags[0] ?? "";
    });
    return weightedSelectArchetype(archetypes, context, existing);
  }

  private _getExistingNPCContext(): string {
    const existing = this._entityStore.listByType("Character");
    const lines: string[] = [];
    for (const node of existing.slice(0, 30)) {
      const tags = (node.profile.l1.tags as string[]) ?? [];
      lines.push(`- ${node.name} (${tags.join(", ")}): ${(node.profile.l1.summary as string) ?? ""}`);
    }
    return lines.length > 0 ? lines.join("\n") : "No existing NPCs.";
  }

  private _getWorldRulesText(): string {
    if (!this._worldFrame) return "";
    return ((this._worldFrame.world_rules as Array<Record<string, unknown>>) ?? [])
      .map((r) => `- ${r.name}: ${r.description}`)
      .join("\n");
  }

  private _getFactionsAndRaces(): { factions: string[]; races: string[] } {
    if (!this._worldFrame) return { factions: [], races: [] };
    const factions = ((this._worldFrame.factions as Array<Record<string, unknown>>) ?? [])
      .map((f) => f.name as string).filter(Boolean);
    const races = ((this._worldFrame.races as Array<Record<string, unknown>>) ?? [])
      .map((r) => r.name as string).filter(Boolean);
    return { factions, races };
  }

  async generateWithLLM(archetype?: string, factionOrRace?: string): Promise<{
    name: string;
    personality: string;
    profession: string;
    faction: string;
    race: string;
    backstory: string;
  }> {
    const archetypes = this._getArchetypes();
    const arch = archetype ?? this.selectArchetype();
    const existing = this._getExistingNPCContext();
    const rules = this._getWorldRulesText();
    const { factions, races } = this._getFactionsAndRaces();

    const archConfig = archetypes.find((a) => a.name === arch);
    const archDescription = archConfig?.description ?? arch;

    const factionHint = factionOrRace
      ? `\nFaction or race preference: ${factionOrRace}`
      : "";

    const prompt = `Generate a unique NPC character for a fantasy world.

Archetype: ${arch} — ${archDescription}
${factionHint}

World rules:
${rules || "No special rules."}

Existing NPCs (DO NOT repeat names, personalities, or professions):
${existing}

Available factions: ${factions.join(", ") || "any"}
Available races: ${races.join(", ") || "any"}

Generate a JSON object with these fields:
{
  "name": "unique first+last name (2-3 words)",
  "personality": "2-3 sentence personality description",
  "profession": "specific profession matching the archetype",
  "faction": "which faction they belong to",
  "race": "which race they are",
  "backstory": "2-3 sentence backstory"
}

Rules:
- Name MUST be unique (not in existing NPCs list)
- Personality MUST differ from existing NPCs
- Profession MUST be logical for the faction
- Keep it concise and vivid`;

    const result = await this._llmQueue.generateJson(prompt, TaskPriority.NORMAL, 0.8);
    return {
      name: (result.name as string) ?? `Unknown_${arch}`,
      personality: (result.personality as string) ?? "",
      profession: (result.profession as string) ?? arch,
      faction: (result.faction as string) ?? factions[0] ?? "unknown",
      race: (result.race as string) ?? races[0] ?? "human",
      backstory: (result.backstory as string) ?? "",
    };
  }

  qualityGate(data: { name: string; personality: string; profession: string }, maxAttempts = 3): { passed: boolean; reason: string } {
    const existing = this._entityStore.listByType("Character");

    for (const node of existing) {
      if (!node) continue;

      if (node.name.toLowerCase() === data.name.toLowerCase()) {
        return { passed: false, reason: `Name "${data.name}" already exists` };
      }

      const existingSummary = (node.profile.l1.summary as string) ?? "";
      if (existingSummary && data.personality) {
        const words1 = new Set(existingSummary.toLowerCase().split(/\s+/));
        const words2 = new Set(data.personality.toLowerCase().split(/\s+/));
        const overlap = [...words1].filter((w) => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;
        if (union > 0 && overlap / union > 0.7) {
          return { passed: false, reason: `Personality too similar to ${node.name}` };
        }
      }
    }

    return { passed: true, reason: "ok" };
  }

  async generate(factionOrRace?: string): Promise<GeneratedNPC> {
    const arch = this.selectArchetype();
    let data: Awaited<ReturnType<typeof this.generateWithLLM>> | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      data = await this.generateWithLLM(arch, factionOrRace);
      const gate = this.qualityGate(data);
      if (gate.passed) break;
      log.info({ attempt, reason: gate.reason }, "Quality gate rejected, retrying");
      data = null;
    }

    if (!data) {
      data = await this.generateWithLLM(arch, factionOrRace);
    }

    const name = data.name;
    const uid = `Character:${name}`;

    const profile = new LayeredProfile(
      {
        name,
        type: "Character",
        group: data.faction,
        summary: `${data.profession} — ${data.personality}`,
        tags: [arch, data.race, data.faction],
        relationships: [],
      },
      {
        personality: data.personality,
        profession: data.profession,
        backstory: data.backstory,
        race: data.race,
        faction: data.faction,
      },
      {},
    );

    const node = new EntityNode({
      uid,
      name,
      entity_type: "Character",
      profile: profile.toDict(),
      group_id: "characters",
    });

    this._entityStore.add(node);

    await this._eventBus.publishSimple(
      EventTopic.ENTITY_ADDED,
      { uid, type: "Character", archetype: arch },
      "npc-generator",
    );

    log.info({ name, archetype: arch, faction: data.faction, race: data.race }, "NPC generated");

    return {
      name,
      archetype: arch,
      personality: data.personality,
      profession: data.profession,
      faction: data.faction,
      race: data.race,
      node,
    };
  }
}
