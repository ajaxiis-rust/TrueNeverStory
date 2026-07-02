/**
 * Probability Context Resolver — builds context from world state.
 * Replaces world_core/probability/resolver.py.
 */

import { getLogger } from "../utils/logger";
import type { INpcManager, IWorldMemory } from "./probability-types";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { GraphStore } from "./graph-store";

const log = getLogger("prob-resolver");

const MOOD_FACTORS: Record<string, number> = {
  joy: 0.9, happiness: 0.9, excited: 0.85, content: 0.7,
  neutral: 0.5, calm: 0.5, worried: 0.4, sad: 0.3,
  fear: 0.2, anger: 0.2, rage: 0.1, depressed: 0.1,
};

const SKILL_MAP: Record<string, string> = {
  combat: "strength", attack: "strength", fight: "strength",
  persuasion: "charisma", persuade: "charisma", diplomacy: "charisma",
  deception: "charisma", stealth: "dexterity", sneak: "dexterity",
  lockpick: "dexterity", investigation: "intelligence",
  investigate: "intelligence", search: "intelligence",
  arcana: "intelligence", religion: "intelligence",
  athletics: "strength", climb: "strength", swim: "strength",
  acrobatics: "dexterity", perception: "wisdom", perceive: "wisdom",
  survival: "wisdom", medicine: "wisdom", insight: "wisdom",
  performance: "charisma", intimidation: "charisma",
  nature: "wisdom", animal_handling: "wisdom",
};

export interface IGraphAdapter {
  getEdgesBetween(uidA: string, uidB: string): Array<{ source: string; target: string; type: string; strength?: number }>;
  getOutgoingEdges(uid: string): Array<{ source: string; target: string; type: string; strength?: number }>;
  entityStore: UnifiedEntityStore;
}

export class ProbabilityContextResolver {
  private _entityStore: UnifiedEntityStore;
  private _graph: IGraphAdapter | null;
  private _npcMgr: INpcManager | null;
  private _worldMemory: IWorldMemory | null;
  private _worldFrame: Record<string, unknown>;

  constructor(
    entityStore: UnifiedEntityStore,
    npcMgr: INpcManager | null,
    graph?: IGraphAdapter | null,
    worldMemory?: IWorldMemory | null,
    worldFrame?: Record<string, unknown>,
  ) {
    this._entityStore = entityStore;
    this._graph = graph ?? null;
    this._npcMgr = npcMgr;
    this._worldMemory = worldMemory ?? null;
    this._worldFrame = worldFrame ?? {};
  }

  async buildContext(
    actor: string,
    target?: string | null,
    actionType = "generic",
    location?: string | null,
    extra?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {
      actor,
      target,
      action_type: actionType,
      location,
    };

    await this._addActorStats(context, actor);
    await this._addActorSkills(context, actor, actionType);
    if (target) await this._addTargetStats(context, target, actionType);
    if (actor && target) context.relationship_strength = await this._getRelationshipStrength(actor, target);
    if (actor) context.faction_reputation = await this._getFactionReputation(actor);
    if (location) await this._addEnvironmentModifiers(context, location);
    if (location) await this._applyWorldRules(context, location, actionType);
    if (this._worldMemory && actor) await this._addWorldMemoryContext(context, actor, actionType);

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        context[`extra_${key}`] = value;
      }
    }

    this._fillDefaults(context);
    return context;
  }

  private async _addActorStats(context: Record<string, unknown>, actor: string): Promise<void> {
    try {
      const state = this._npcMgr?.get?.(actor);
      if (state) {
        context.actor_health = (state.health ?? 50) / 100;
        const mood = (state.mood ?? "neutral").toLowerCase();
        context.actor_mood_factor = MOOD_FACTORS[mood] ?? 0.5;
        context.actor_has_goals = (state.goals as unknown[])?.length > 0 ? 1.0 : 0.0;
        const inventory = state.inventory as unknown[];
        context.actor_resources = Math.min(1.0, (inventory?.length ?? 0) / 10);
      } else {
        context.actor_health = 0.5;
        context.actor_mood_factor = 0.5;
        context.actor_has_goals = 0.0;
        context.actor_resources = 0.0;
      }
    } catch (err) {
      log.debug({ err, actor }, "Failed to resolve actor state, using defaults");
      context.actor_health = 0.5;
      context.actor_mood_factor = 0.5;
    }
  }

  private async _addActorSkills(context: Record<string, unknown>, actor: string, actionType: string): Promise<void> {
    try {
      const skill = SKILL_MAP[actionType.toLowerCase()] ?? "strength";
      const actorNode = this._entityStore.getByNameAndType(actor, "Character");

      if (actorNode?.profile?.l2) {
        const l2 = actorNode.profile.l2;
        const abilities = (l2.abilities ?? []) as Array<Record<string, unknown>>;
        const stats = (l2.stats ?? {}) as Record<string, number>;
        const skills = (l2.skills ?? {}) as Record<string, number>;

        let skillValue = stats[skill] ?? skills[skill] ?? 0.5;
        for (const ability of abilities) {
          if (typeof ability.name === "string" && ability.name.toLowerCase().includes(skill)) {
            skillValue = (ability.level as number) ?? (ability.proficiency as number) ?? 0.6;
            break;
          }
        }
        context[`actor_${skill}`] = skillValue;

        if (actionType.toLowerCase() === "combat" || actionType.toLowerCase() === "attack" || actionType.toLowerCase() === "fight") {
          context.actor_combat_skill = skillValue;
          const weapons = (l2.weapons ?? []) as unknown[];
          context.actor_weapon_proficiency = Math.min(1.0, weapons.length / 5);
        }
        if (actionType.toLowerCase() === "persuasion" || actionType.toLowerCase() === "persuade" || actionType.toLowerCase() === "diplomacy") {
          context.actor_charisma = skillValue;
        }
        if (actionType.toLowerCase() === "stealth" || actionType.toLowerCase() === "sneak") {
          context.actor_dexterity = skillValue;
        }
      } else {
        context[`actor_${skill}`] = 0.5;
        if (actionType.toLowerCase() === "combat" || actionType.toLowerCase() === "attack" || actionType.toLowerCase() === "fight") {
          context.actor_combat_skill = 0.5;
        }
        if (actionType.toLowerCase() === "persuasion" || actionType.toLowerCase() === "persuade") {
          context.actor_charisma = 0.5;
        }
        if (actionType.toLowerCase() === "stealth" || actionType.toLowerCase() === "sneak") {
          context.actor_dexterity = 0.5;
        }
      }
    } catch (err) {
      log.debug({ err, actor }, "Failed to resolve actor skills");
      context.actor_strength = 0.5;
      context.actor_dexterity = 0.5;
      context.actor_charisma = 0.5;
      context.actor_intelligence = 0.5;
      context.actor_wisdom = 0.5;
    }
  }

  private async _addTargetStats(context: Record<string, unknown>, target: string, actionType: string): Promise<void> {
    try {
      const targetNode = this._entityStore.getByNameAndType(target, "Character");
      if (targetNode?.profile?.l2) {
        const l2 = targetNode.profile.l2;
        const at = actionType.toLowerCase();
        if (at === "combat" || at === "attack" || at === "fight") {
          context.target_defense = (l2.armor_class as number) ?? 0.5;
          context.target_health = ((l2.hit_points as number) ?? 50) / 100;
        }
        if (at === "persuasion" || at === "persuade" || at === "deception") {
          context.target_resistance = (l2.wisdom as number) ?? (l2.willpower as number) ?? 0.5;
        }
      }

      const targetState = this._npcMgr?.get?.(target);
      if (targetState) {
        const mood = (targetState.mood ?? "neutral").toLowerCase();
        context.target_mood_factor = MOOD_FACTORS[mood] ?? 0.5;
      } else {
        context.target_mood_factor = 0.5;
      }
    } catch (err) {
      log.debug({ err, target }, "Failed to resolve target stats");
      context.target_defense = 0.5;
      context.target_health = 0.5;
      context.target_mood_factor = 0.5;
      context.target_resistance = 0.5;
    }
  }

  private async _getRelationshipStrength(actor: string, target: string): Promise<number> {
    if (!this._graph) return 0.5;
    try {
      const actorNode = this._entityStore.getByNameAndType(actor, "Character");
      const targetNode = this._entityStore.getByNameAndType(target, "Character");
      if (!actorNode || !targetNode) return 0.5;

      const edges = this._graph.getEdgesBetween(actorNode.uid, targetNode.uid);
      for (const edge of edges) {
        const t = edge.type.toLowerCase();
        if (t === "ally_of" || t === "friend_of" || t === "lover_of" || t === "friend" || t === "ally") {
          return edge.strength ?? 0.8;
        }
        if (t === "enemy_of" || t === "rival_of" || t === "enemy" || t === "rival") {
          return edge.strength ?? 0.2;
        }
        if (edge.strength !== undefined) return edge.strength;
      }
      return 0.5;
    } catch (err) {
      log.debug({ err, actor, target }, "Failed to get relationship strength");
      return 0.5;
    }
  }

  private async _getFactionReputation(actor: string): Promise<number> {
    if (!this._graph) return 0.5;
    try {
      const actorNode = this._entityStore.getByNameAndType(actor, "Character");
      if (!actorNode) return 0.5;

      const outgoing = this._graph.getOutgoingEdges(actorNode.uid);
      const factionUids = outgoing.filter((e) => e.type === "member_of").map((e) => e.target);
      if (factionUids.length === 0) return 0.5;

      let total = 0;
      let count = 0;
      for (const fid of factionUids) {
        const factionNode = this._entityStore.get(fid);
        if (factionNode?.profile?.l2) {
          const rep = (factionNode.profile.l2.reputation as number) ?? 0.5;
          total += rep;
          count++;
        }
      }
      return count > 0 ? total / count : 0.5;
    } catch (err) {
      log.debug({ err, actor }, "Failed to get faction reputation");
      return 0.5;
    }
  }

  private async _addEnvironmentModifiers(context: Record<string, unknown>, location: string): Promise<void> {
    try {
      const locNode = this._entityStore.getByNameAndType(location, "Location");
      if (locNode?.profile?.l2) {
        const l2 = locNode.profile.l2;
        context.environment_light = (l2.light_level as number) ?? (l2.light as number) ?? 0.5;
        context.environment_noise = (l2.noise_level as number) ?? (l2.noise as number) ?? 0.5;
        context.environment_modifier = (l2.probability_modifier as number) ?? 0;

        const terrain = (l2.terrain as string) ?? "normal";
        const terrainMods: Record<string, number> = { difficult: -0.2, hazardous: -0.3, favorable: 0.2, normal: 0.0 };
        context.environment_terrain_mod = terrainMods[terrain] ?? 0.0;
      } else {
        context.environment_light = 0.5;
        context.environment_noise = 0.5;
        context.environment_modifier = 0;
        context.environment_terrain_mod = 0;
      }
    } catch (err) {
      log.debug({ err, location }, "Failed to resolve environment");
      context.environment_light = 0.5;
      context.environment_noise = 0.5;
      context.environment_modifier = 0;
      context.environment_terrain_mod = 0;
    }
  }

  private async _applyWorldRules(context: Record<string, unknown>, location: string, actionType: string): Promise<void> {
    try {
      const locNode = this._entityStore.getByNameAndType(location, "Location");
      if (!locNode?.profile?.l2) return;

      const l2 = locNode.profile.l2;
      const activeRules = (l2.active_rules ?? []) as string[];
      if (activeRules.length === 0) return;

      const worldRules = (this._worldFrame.world_rules ?? []) as Array<Record<string, unknown>>;
      for (const ruleName of activeRules) {
        const rule = worldRules.find((r) => r.name === ruleName);
        if (!rule) continue;

        const category = (rule.category as string) ?? "";
        const at = actionType.toLowerCase();

        if (category === "magic_law" && at === "cast_spell") {
          context.rule_penalty = (context.rule_penalty as number ?? 0) - 0.3;
        }
        if (category === "combat_law" && (at === "combat" || at === "attack" || at === "fight")) {
          context.rule_penalty = (context.rule_penalty as number ?? 0) - 0.2;
        }
        if (category === "social_law" && (at === "persuasion" || at === "persuade" || at === "deception")) {
          context.rule_penalty = (context.rule_penalty as number ?? 0) - 0.15;
        }
      }
    } catch (err) {
      log.debug({ err, location }, "Failed to apply world rules");
    }
  }

  private async _addWorldMemoryContext(context: Record<string, unknown>, actor: string, _actionType: string): Promise<void> {
    try {
      if (!this._worldMemory) return;
      const memories = await this._worldMemory.retrieve(`${actor} recent events`, 3);
      context.actor_recent_memories = memories?.length ?? 0;
      const recentFailures = (memories ?? []).filter((m) => m.content.toLowerCase().includes("failure"));
      context.actor_recent_failures = memories?.length ? recentFailures.length / memories.length : 0.0;
    } catch (err) {
      log.debug({ err }, "Failed to get world memory context");
      context.actor_recent_memories = 0;
      context.actor_recent_failures = 0.0;
    }
  }

  private _fillDefaults(context: Record<string, unknown>): void {
    const defaults: Record<string, unknown> = {
      actor_health: 0.5, actor_mood_factor: 0.5,
      actor_strength: 0.5, actor_dexterity: 0.5, actor_charisma: 0.5,
      actor_intelligence: 0.5, actor_wisdom: 0.5, actor_combat_skill: 0.5,
      actor_weapon_proficiency: 0.5, actor_has_goals: 0.0, actor_resources: 0.0,
      actor_luck: 0.5, target_defense: 0.5, target_health: 0.5,
      target_resistance: 0.5, target_mood_factor: 0.5,
      relationship_strength: 0.5, faction_reputation: 0.5,
      rule_penalty: 0.0,
      environment_light: 0.5, environment_noise: 0.5,
      environment_modifier: 0, environment_terrain_mod: 0,
      item_bonus: 0.0, argument_quality: 0.5,
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in context)) context[key] = value;
    }
  }
}
