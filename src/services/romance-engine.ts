/**
 * Romance Engine — manages romantic relationships with deterministic outcomes.
 * Replaces world_core/romance/engine.py.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  RelationshipMemory,
  RomanceStatus,
  RomanceProgression,
} from "../models/romance";
import type { RomanceParams } from "../models/romance";
import type { ProbabilityEngine } from "./probability-engine";
import {
  ROMANCE_ATTRACTION,
  ROMANCE_CONFESSION,
  ROMANCE_DATE,
  ROMANCE_KISS,
  ROMANCE_PROPOSAL,
  ROMANCE_BREAKUP,
} from "./romance-profiles";
import type { IWorldMemory } from "./probability-types";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { IGraphAdapter } from "./probability-resolver";
import { getLogger } from "../utils/logger";
import { OutcomeQuality } from "../models/probability";

const log = getLogger("romance-engine");

export interface INpcProfile {
  mood?: string;
  skills?: Record<string, number>;
  [key: string]: unknown;
}

export interface IDirector {
  scheduleEvent?(delayMs: number, type: string, data: Record<string, unknown>): void;
}

export interface IRomanceNpcManager {
  get(name: string): INpcProfile | null;
}

export class RomanceEngine {
  private _probEngine: ProbabilityEngine;
  private _worldMemory: IWorldMemory | null;
  private _entityStore: UnifiedEntityStore;
  private _graph: IGraphAdapter | null;
  private _npcMgr: IRomanceNpcManager | null;
  private _director: IDirector | null;
  private _dataDir: string;
  private _worldFrame: Record<string, unknown>;
  private _relationships: Map<string, RelationshipMemory> = new Map();

  constructor(opts: {
    probEngine: ProbabilityEngine;
    worldMemory: IWorldMemory | null;
    entityStore: UnifiedEntityStore;
    graph: IGraphAdapter | null;
    npcMgr: IRomanceNpcManager | null;
    director: IDirector | null;
    dataDir?: string;
    worldFrame?: Record<string, unknown>;
  }) {
    this._probEngine = opts.probEngine;
    this._worldMemory = opts.worldMemory;
    this._entityStore = opts.entityStore;
    this._graph = opts.graph;
    this._npcMgr = opts.npcMgr;
    this._director = opts.director;
    this._dataDir = opts.dataDir ?? "worlds/default/romance";
    this._worldFrame = opts.worldFrame ?? {};
  }

  private _pairId(a: string, b: string): string {
    return [a.toLowerCase(), b.toLowerCase()].sort().join("_");
  }

  async getRelationship(a: string, b: string): Promise<RelationshipMemory | null> {
    return this._relationships.get(this._pairId(a, b)) ?? null;
  }

  async getOrCreateRelationship(a: string, b: string): Promise<RelationshipMemory> {
    const pid = this._pairId(a, b);
    if (!this._relationships.has(pid)) {
      const compatibility = await this.computeCompatibility(a, b);
      this._relationships.set(pid, new RelationshipMemory({
        pair_id: pid,
        status: RomanceStatus.STRANGER,
        progression_stage: RomanceProgression.ATTRACTION,
        compatibility,
        affection: 0.3,
        history: [],
        last_interaction: new Date().toISOString(),
      }));
    }
    return this._relationships.get(pid)!;
  }

  async updateRelationship(rel: RelationshipMemory): Promise<void> {
    this._relationships.set(rel.pairId, rel);
    await this._save();
    await this._indexRelationshipMemory(rel);
  }

  async computeCompatibility(a: string, b: string): Promise<number> {
    const actorNode = this._entityStore.getByNameAndType(a, "Character");
    const targetNode = this._entityStore.getByNameAndType(b, "Character");

    if (!actorNode || !targetNode) return 0.5;

    const actorRace = ((actorNode.profile.l1?.tags as string[]) ?? ["human"])[0] ?? "human";
    const targetRace = ((targetNode.profile.l1?.tags as string[]) ?? ["human"])[0] ?? "human";
    const actorClass = (actorNode.profile.l2?.social_class as string) ?? "commoner";
    const targetClass = (targetNode.profile.l2?.social_class as string) ?? "commoner";

    const raceMatch = actorRace === targetRace ? 1.0 : 0.8;
    const classMatch = actorClass === targetClass ? 1.0 : 0.9;

    let forbiddenModifier = 1.0;
    const worldRules = (this._worldFrame.world_rules ?? []) as Array<Record<string, unknown>>;
    for (const rule of worldRules) {
      const name = (rule.name as string ?? "").toLowerCase();
      if (name.includes("forbidden") && name.includes("love")) {
        const effect = (rule.effect ?? {}) as Record<string, unknown>;
        forbiddenModifier = (effect.compatibility_modifier as number) ?? 0.5;
        break;
      }
    }

    const compatibility = ((raceMatch + classMatch) / 2) * forbiddenModifier;
    return Math.max(0.1, Math.min(1.0, compatibility));
  }

  private async _buildContext(actor: string, target: string, location: string, rel: RelationshipMemory): Promise<Record<string, unknown>> {
    return {
      current_affection: rel.affection,
      compatibility: rel.compatibility,
      actor_charisma: await this._getCharisma(actor),
      target_mood_factor: await this._getMood(target),
      environment_modifier: await this._getLocationRomanceModifier(location),
      luck: 0.5,
      past_positive_interactions: this._countPositiveInteractions(rel),
      relationship_duration: this._getRelationshipDuration(rel),
      family_approval: await this._getFamilyApproval(actor, target),
      time_of_day_modifier: this._getTimeModifier(),
      conflict_level: 1.0 - rel.affection,
      external_pressure: 0.0,
    };
  }

  private async _getCharisma(name: string): Promise<number> {
    const profile = this._npcMgr?.get(name);
    if (profile?.skills) return profile.skills.charisma ?? 0.5;

    const node = this._entityStore.getByNameAndType(name, "Character");
    if (node?.profile?.l3) {
      const innateSkills = (node.profile.l3.innate_skills ?? []) as Array<Record<string, unknown>>;
      for (const skill of innateSkills) {
        if (skill.name === "charisma") return (skill.base_value as number) ?? 0.5;
      }
    }
    return 0.5;
  }

  private async _getMood(name: string): Promise<number> {
    const profile = this._npcMgr?.get(name);
    if (profile?.mood) {
      const moodMap: Record<string, number> = {
        joy: 0.9, happy: 0.85, excited: 0.8,
        neutral: 0.5, calm: 0.6,
        sad: 0.3, depressed: 0.2, grief: 0.1,
        fear: 0.2, anxious: 0.3,
        anger: 0.2, furious: 0.1, annoyed: 0.4,
      };
      return moodMap[profile.mood.toLowerCase()] ?? 0.5;
    }
    return 0.5;
  }

  private async _getLocationRomanceModifier(location: string): Promise<number> {
    const locNode = this._entityStore.getByNameAndType(location, "Location");
    if (locNode?.profile?.l2) {
      return (locNode.profile.l2.romance_modifier as number) ?? 0.0;
    }
    return 0.0;
  }

  private _countPositiveInteractions(rel: RelationshipMemory): number {
    const positive = rel.history.filter(
      (h) => h.success === true && ["date", "kiss", "gift"].includes(h.type as string),
    ).length;
    return Math.min(1.0, positive * 0.15);
  }

  private _getRelationshipDuration(rel: RelationshipMemory): number {
    const days = (Date.now() - rel.lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
    return Math.min(1.0, days / 365);
  }

  private async _getFamilyApproval(_actor: string, _target: string): Promise<number> {
    return 0.5;
  }

  private _getTimeModifier(): number {
    const hour = new Date().getHours();
    if (hour >= 18 && hour <= 22) return 0.2;
    if (hour >= 10 && hour <= 22) return 0.0;
    return -0.1;
  }

  // ── Romance Actions ──

  async attemptAttraction(actor: string, target: string, location: string): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);
    const context = await this._buildContext(actor, target, location, rel);
    const result = this._probEngine.roll(ROMANCE_ATTRACTION, context, actor);

    let affectionDelta = result.success ? 0.15 : -0.05;
    if (result.quality === OutcomeQuality.CRITICAL_SUCCESS) affectionDelta = 0.25;
    else if (result.quality === OutcomeQuality.CRITICAL_FAILURE) affectionDelta = -0.10;

    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;
    rel.lastInteraction = new Date();

    if (result.success && rel.status === RomanceStatus.STRANGER) {
      rel.status = RomanceStatus.ACQUAINTANCE;
    } else if (result.success && rel.affection > 0.6 && (rel.status === RomanceStatus.ACQUAINTANCE || rel.status === RomanceStatus.FRIEND)) {
      rel.status = RomanceStatus.CRUSH;
    }

    rel.history.push({
      type: "attraction_check",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "attraction_check", result.success, result.quality);

    return [result.success, narrative, newAffection];
  }

  async attemptConfession(actor: string, target: string, location: string, message = ""): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);

    if (rel.affection < 0.4) {
      return [false, `${actor} doesn't feel strongly enough to confess yet. (Affection: ${(rel.affection * 100).toFixed(0)}%)`, rel.affection];
    }

    const context = await this._buildContext(actor, target, location, rel);
    const result = this._probEngine.roll(ROMANCE_CONFESSION, context, actor);

    let affectionDelta: number;
    let newStatus: RomanceStatus;
    let newStage: RomanceProgression;

    if (result.success) {
      affectionDelta = 0.25;
      newStatus = RomanceStatus.DATING;
      newStage = RomanceProgression.CONFESSION;
    } else {
      affectionDelta = -0.15;
      newStatus = RomanceStatus.ESTRANGED;
      newStage = RomanceProgression.BREAKUP;
    }

    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;
    rel.status = newStatus;
    rel.progressionStage = newStage;
    rel.lastInteraction = new Date();

    if (message && result.success) rel.notes = message;

    rel.history.push({
      type: "confession",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
      message,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "confession", result.success, result.quality, message);

    if (result.success) this._scheduleRomanceArc(actor, target, "dating");

    return [result.success, narrative, newAffection];
  }

  async attemptDate(actor: string, target: string, location: string): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);

    if (rel.status === RomanceStatus.STRANGER) {
      return [false, `${actor} and ${target} don't know each other well enough to date.`, 0.0];
    }

    const context = await this._buildContext(actor, target, location, rel);
    const result = this._probEngine.roll(ROMANCE_DATE, context, actor);

    let affectionDelta = result.success ? 0.15 : -0.05;
    if (result.quality === OutcomeQuality.CRITICAL_SUCCESS) affectionDelta = 0.25;
    else if (result.quality === OutcomeQuality.CRITICAL_FAILURE) affectionDelta = -0.10;

    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;
    if (result.success && (rel.status === RomanceStatus.CRUSH || rel.status === RomanceStatus.ACQUAINTANCE)) {
      rel.status = RomanceStatus.DATING;
    }
    rel.progressionStage = RomanceProgression.DATE;
    rel.lastInteraction = new Date();

    rel.history.push({
      type: "date",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
      location,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "date", result.success, result.quality, "", location);

    return [result.success, narrative, affectionDelta];
  }

  async attemptKiss(actor: string, target: string, location: string): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);

    if (rel.status !== RomanceStatus.DATING && rel.status !== RomanceStatus.CRUSH && rel.status !== RomanceStatus.CLOSE_FRIEND) {
      return [false, `${actor} and ${target} aren't close enough for a kiss yet.`, 0.0];
    }

    const context = await this._buildContext(actor, target, location, rel);
    const result = this._probEngine.roll(ROMANCE_KISS, context, actor);

    let affectionDelta = result.success ? 0.10 : -0.08;
    if (result.quality === OutcomeQuality.CRITICAL_SUCCESS) affectionDelta = 0.20;
    else if (result.quality === OutcomeQuality.CRITICAL_FAILURE) affectionDelta = -0.15;

    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;
    rel.progressionStage = RomanceProgression.KISS;
    rel.lastInteraction = new Date();

    rel.history.push({
      type: "kiss",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
      location,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "kiss", result.success, result.quality);

    return [result.success, narrative, affectionDelta];
  }

  async attemptProposal(actor: string, target: string, location: string): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);

    if (rel.status !== RomanceStatus.DATING) {
      return [false, `${actor} and ${target} aren't in a serious relationship yet.`, rel.affection];
    }
    if (rel.affection < 0.7) {
      return [false, `${target} doesn't love ${actor} enough to marry yet. (Affection: ${(rel.affection * 100).toFixed(0)}%)`, rel.affection];
    }

    const context = await this._buildContext(actor, target, location, rel);
    const result = this._probEngine.roll(ROMANCE_PROPOSAL, context, actor);

    const affectionDelta = result.success ? 0.15 : -0.25;
    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;

    if (result.success) {
      rel.status = RomanceStatus.ENGAGED;
      rel.progressionStage = RomanceProgression.PROPOSAL;
    } else {
      rel.status = RomanceStatus.ESTRANGED;
      rel.progressionStage = RomanceProgression.BREAKUP;
    }
    rel.lastInteraction = new Date();

    rel.history.push({
      type: "proposal",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
      location,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "proposal", result.success, result.quality);

    if (result.success) this._scheduleRomanceArc(actor, target, "engaged");

    return [result.success, narrative, newAffection];
  }

  async attemptBreakup(actor: string, target: string, reason = ""): Promise<[boolean, string, number]> {
    const rel = await this.getRelationship(actor, target);

    if (!rel || (rel.status !== RomanceStatus.DATING && rel.status !== RomanceStatus.ENGAGED && rel.status !== RomanceStatus.MARRIED)) {
      return [false, `${actor} and ${target} aren't in a relationship.`, 0.0];
    }

    const context: Record<string, unknown> = {
      current_affection: rel.affection,
      conflict_level: 1.0 - rel.affection,
      external_pressure: 0.0,
      luck: 0.5,
    };

    const result = this._probEngine.roll(ROMANCE_BREAKUP, context, actor);

    const affectionDelta = result.success ? -0.4 : 0.1;
    const newAffection = Math.min(1, Math.max(0, rel.affection + affectionDelta));
    rel.affection = newAffection;
    rel.status = RomanceStatus.ESTRANGED;
    rel.progressionStage = RomanceProgression.BREAKUP;
    rel.lastInteraction = new Date();

    rel.history.push({
      type: "breakup",
      success: result.success,
      quality: result.quality,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
      reason,
    });

    await this.updateRelationship(rel);
    const narrative = await this._generateNarrative(actor, target, "breakup", result.success, result.quality, reason);

    return [result.success, narrative, newAffection];
  }

  async giveGift(actor: string, target: string, giftName: string): Promise<[boolean, string, number]> {
    const rel = await this.getOrCreateRelationship(actor, target);

    const affectionDelta = 0.1;
    const newAffection = Math.min(1, rel.affection + affectionDelta);
    rel.affection = newAffection;
    rel.giftsGiven.push(giftName);
    rel.lastInteraction = new Date();

    rel.history.push({
      type: "gift",
      gift: giftName,
      success: true,
      timestamp: new Date().toISOString(),
      affection_change: affectionDelta,
    });

    await this.updateRelationship(rel);
    const narrative = `${actor} gives ${target} a ${giftName}. ${target} appreciates the gesture.`;

    return [true, narrative, affectionDelta];
  }

  async getAllRelationships(character: string): Promise<RelationshipMemory[]> {
    const charLower = character.toLowerCase();
    return Array.from(this._relationships.values()).filter(
      (rel) => rel.pairId.split("_").includes(charLower),
    );
  }

  async getRelationshipStatus(a: string, b: string): Promise<RomanceStatus> {
    const rel = await this.getRelationship(a, b);
    return rel?.status ?? RomanceStatus.STRANGER;
  }

  async getRelationshipsByStatus(status: RomanceStatus): Promise<RelationshipMemory[]> {
    return Array.from(this._relationships.values()).filter((rel) => rel.status === status);
  }

  async getDatingPairs(): Promise<Array<[string, string]>> {
    const pairs: Array<[string, string]> = [];
    for (const rel of this._relationships.values()) {
      if (rel.status === RomanceStatus.DATING) {
        const names = rel.pairId.split("_");
        if (names.length === 2) pairs.push([names[0]!, names[1]!]);
      }
    }
    return pairs;
  }

  // ── Narrative Generation ──

  private async _generateNarrative(
    actor: string,
    target: string,
    action: string,
    success: boolean,
    quality: OutcomeQuality | string,
    extra = "",
    location = "",
  ): Promise<string> {
    const qualityDesc: Record<string, string> = {
      critical_success: "amazingly",
      success: "successfully",
      marginal_success: "barely",
      marginal_failure: "almost",
      failure: "unsuccessfully",
      critical_failure: "disastrously",
    };
    const q = qualityDesc[quality as string] ?? "unexpectedly";

    const templates: Record<string, string> = {
      attraction_check: `${actor} feels ${q} drawn to ${target}. ${success ? "There seems to be a spark between them." : "Perhaps it just wasn't meant to be."}`,
      confession: `${actor} confesses their feelings to ${target} ${q}. ${extra} ${success ? `${target} accepts!` : `${target} rejects ${actor}.`}`,
      date: `${actor} and ${target} go on a date${location ? ` at ${location}` : ""}. ${success ? `It goes ${q}!` : "It doesn't go well."}`,
      kiss: `${actor} kisses ${target} ${q}. ${success ? "It's magical!" : "They pull away."}`,
      proposal: `${actor} proposes to ${target} ${q}. ${success ? "They say yes!" : "They say no..."}`,
      breakup: `${actor} breaks up with ${target} ${q}. ${extra} ${success ? "They part on bad terms." : "They remain friends."}`,
    };

    return templates[action] ?? `${actor} attempts ${action} with ${target}.`;
  }

  private _scheduleRomanceArc(a: string, b: string, phase: string): void {
    if (this._director?.scheduleEvent) {
      this._director.scheduleEvent(3 * 24 * 60 * 60 * 1000, "romance_event", {
        type: phase,
        actor: a,
        target: b,
        phase,
      });
      log.info({ a, b, phase }, "Scheduled romance arc");
    }
  }

  private async _indexRelationshipMemory(rel: RelationshipMemory): Promise<void> {
    if (!this._worldMemory) return;
    const summary = `Romantic relationship between ${rel.pairId}: ${rel.status}, affection ${(rel.affection * 100).toFixed(0)}%`;
    await this._worldMemory.addMemory(summary, "relationship", rel.pairId, 0.6);
  }

  // ── Persistence ──

  async load(): Promise<void> {
    try {
      await mkdir(this._dataDir, { recursive: true });
      const filePath = join(this._dataDir, "relationships.json");
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [pid, relData] of Object.entries(data)) {
        this._relationships.set(pid, RelationshipMemory.fromDict(relData));
      }
      log.info({ count: this._relationships.size }, "Loaded relationships");
    } catch {
      log.debug("No relationships file found, starting fresh");
    }
  }

  private async _save(): Promise<void> {
    try {
      await mkdir(this._dataDir, { recursive: true });
      const filePath = join(this._dataDir, "relationships.json");
      const data: Record<string, Record<string, unknown>> = {};
      for (const [pid, rel] of this._relationships) {
        data[pid] = rel.toDict() as unknown as Record<string, unknown>;
      }
      await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      log.error({ err }, "Failed to save relationships");
    }
  }
}
