/**
 * Probability Engine — core calculations for the probability system.
 * Replaces world_core/probability/engine.py.
 */

import {
  ProbabilityProfile,
  ProbabilityModifier,
  ProbabilityParameter,
  ProbabilityResult,
  ModifierType,
  OutcomeQuality,
  ParameterType,
  StackingRule,
} from "../models/probability";
import { getLogger } from "../utils/logger";
import { safeEval } from "./probability-expression";
import type { IContextResolver, INpcManager, IWorldMemory, IWorldClock } from "./probability-types";

const log = getLogger("probability-engine");

export interface INpcSkillsManager {
  get(entityUid: string): { skills?: Record<string, number> } | null;
  setSkills(entityUid: string, skills: Record<string, number>): void;
  save(): void;
}

export class ProbabilityEngine {
  private _modifiers: Map<string, ProbabilityModifier[]> = new Map();
  globalLuck: number;
  private _contextResolver: IContextResolver | null = null;
  private _npcMgr: INpcManager | null = null;
  private _npcSkills: INpcSkillsManager | null = null;
  private _worldMemory: IWorldMemory | null = null;
  private _worldClock: IWorldClock | null = null;

  constructor(globalLuck = 0.5) {
    this.globalLuck = globalLuck;
  }

  setContextResolver(resolver: IContextResolver): void { this._contextResolver = resolver; }
  setNpcManager(npcMgr: INpcManager): void { this._npcMgr = npcMgr; }
  setNpcSkills(skills: INpcSkillsManager): void { this._npcSkills = skills; }
  setWorldMemory(wm: IWorldMemory): void { this._worldMemory = wm; }
  setWorldClock(wc: IWorldClock): void { this._worldClock = wc; }

  // ── Modifier Management ──

  applyModifier(entityUid: string, modifier: ProbabilityModifier): void {
    if (modifier.durationSeconds) {
      modifier.expiresAt = Date.now() / 1000 + modifier.durationSeconds;
    }
    const list = this._modifiers.get(entityUid) ?? [];
    list.push(modifier);
    this._modifiers.set(entityUid, list);
  }

  removeModifier(entityUid: string, parameterName: string, source?: string): boolean {
    const mods = this._modifiers.get(entityUid);
    if (!mods) return false;
    const before = mods.length;
    if (source) {
      const filtered = mods.filter(
        (m) => !(m.parameterName === parameterName && m.source === source),
      );
      this._modifiers.set(entityUid, filtered);
    } else {
      const filtered = mods.filter((m) => m.parameterName !== parameterName);
      this._modifiers.set(entityUid, filtered);
    }
    return this._modifiers.get(entityUid)!.length < before;
  }

  removeExpiredModifiers(entityUid: string, currentTime?: number): void {
    const now = currentTime ?? Date.now() / 1000;
    const mods = this._modifiers.get(entityUid);
    if (!mods) return;
    this._modifiers.set(
      entityUid,
      mods.filter((m) => !m.isExpired(now)),
    );
  }

  getActiveModifiers(entityUid: string, paramName: string): ProbabilityModifier[] {
    const mods = this._modifiers.get(entityUid) ?? [];
    const relevant = mods.filter((m) => m.parameterName === paramName && !m.isExpired());
    if (relevant.length === 0) return [];

    const byRule = new Map<StackingRule, ProbabilityModifier[]>();
    for (const m of relevant) {
      const rule = m.stackingRule ?? StackingRule.STACK;
      const list = byRule.get(rule) ?? [];
      list.push(m);
      byRule.set(rule, list);
    }

    const result: ProbabilityModifier[] = [];
    for (const [rule, group] of byRule) {
      if (rule === StackingRule.STACK) {
        result.push(...group);
      } else if (rule === StackingRule.TAKE_HIGHEST) {
        result.push(group.reduce((a, b) => (a.value > b.value ? a : b)));
      } else if (rule === StackingRule.TAKE_LOWEST) {
        result.push(group.reduce((a, b) => (a.value < b.value ? a : b)));
      } else if (rule === StackingRule.OVERRIDE) {
        const sorted = group.sort(
          (a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity),
        );
        const last = sorted[sorted.length - 1];
        if (last) result.push(last);
      }
    }
    return result;
  }

  getAllModifiers(entityUid: string): ProbabilityModifier[] {
    const mods = this._modifiers.get(entityUid) ?? [];
    return mods.filter((m) => !m.isExpired());
  }

  clearAllModifiers(entityUid: string): void {
    this._modifiers.set(entityUid, []);
  }

  // ── Parameter Value Computation ──

  computeParameterValue(
    param: ProbabilityParameter,
    context: Record<string, unknown>,
    entityUid: string,
  ): number {
    let val: number;

    if (param.paramType === ParameterType.DYNAMIC && param.dynamicSource) {
      try {
        val = safeEval(param.dynamicSource, context as Record<string, number>);
      } catch {
        val = param.baseValue;
      }
    } else if (param.paramType === ParameterType.RELATIONSHIP) {
      val = (context.relationship_strength as number) ?? 0.5;
    } else if (param.paramType === ParameterType.EXTERNAL) {
      if (param.dynamicSource) {
        val = (context[param.dynamicSource] as number) ?? param.baseValue;
      } else {
        val = param.baseValue;
      }
    } else {
      val = param.baseValue;
    }

    const active = this.getActiveModifiers(entityUid, param.name);
    let replaceVal: number | null = null;
    const addMods: number[] = [];
    const mulMods: number[] = [];

    for (const mod of active) {
      if (mod.modifierType === ModifierType.ADD) addMods.push(mod.value);
      else if (mod.modifierType === ModifierType.MULTIPLY) mulMods.push(mod.value);
      else if (mod.modifierType === ModifierType.REPLACE) {
        if (replaceVal === null) replaceVal = mod.value;
      }
    }

    if (replaceVal !== null) val = replaceVal;
    for (const m of mulMods) val *= m;
    if (addMods.length > 0) val += addMods.reduce((a, b) => a + b, 0);

    return Math.max(param.minValue, Math.min(param.maxValue, val));
  }

  // ── Main Probability Computation ──

  compute(
    profile: ProbabilityProfile,
    context: Record<string, unknown>,
    entityUid?: string,
  ): number {
    const paramNames = profile.getParamNames();
    if (paramNames.length === 0) return 0.5;

    const rawValues: Record<string, number> = {};
    let totalWeight = 0;

    for (const pname of paramNames) {
      const param = profile.parameters[pname]!;
      const val = this.computeParameterValue(param, context, entityUid ?? "");
      rawValues[pname] = val * param.weight;
      totalWeight += param.weight;
    }

    let prob: number;

    if (profile.formula === "sum_weighted") {
      prob = totalWeight > 0
        ? Object.values(rawValues).reduce((a, b) => a + b, 0) / totalWeight
        : 0.5;
    } else if (profile.formula === "product") {
      const validVals = Object.values(rawValues).filter((v) => v > 0);
      if (validVals.length > 0) {
        const prod = validVals.reduce((a, b) => a * b, 1);
        prob = Math.pow(prod, 1 / validVals.length);
      } else {
        prob = 0;
      }
    } else if (profile.formula === "logistic") {
      const avg = Object.values(rawValues).reduce((a, b) => a + b, 0) / Math.max(1, paramNames.length);
      const k = 4.0;
      prob = 1 / (1 + Math.exp(-k * (avg - 0.5)));
    } else if (profile.formula.startsWith("expression:")) {
      const expr = profile.formula.slice("expression:".length);
      try {
        prob = safeEval(expr, rawValues as Record<string, number>);
      } catch {
        prob = 0.5;
      }
    } else {
      prob = totalWeight > 0
        ? Object.values(rawValues).reduce((a, b) => a + b, 0) / totalWeight
        : 0.5;
    }

    prob *= profile.difficultyModifier;
    prob = prob * (0.5 + this.globalLuck);

    return Math.max(0, Math.min(1, prob));
  }

  roll(
    profile: ProbabilityProfile,
    context: Record<string, unknown>,
    entityUid?: string,
    explicitRoll?: number,
  ): ProbabilityResult {
    const probability = this.compute(profile, context, entityUid);

    let rollValue = explicitRoll ?? Math.random();
    if (this._worldClock) {
      const globalLuck = this._worldClock.getGlobalLuck?.() ?? 0.5;
      rollValue = Math.max(0, Math.min(1, rollValue + (globalLuck - 0.5) * 0.2));
    }

    const success = rollValue < probability;
    const quality = this._determineQuality(rollValue, probability, profile);

    return new ProbabilityResult({
      probability,
      roll: rollValue,
      success,
      quality,
      details: {
        probability,
        roll: rollValue,
        margin: success ? probability - rollValue : rollValue - probability,
      },
    });
  }

  private _determineQuality(
    roll: number,
    probability: number,
    profile: ProbabilityProfile,
  ): OutcomeQuality {
    let margin: number;
    let maxMargin: number;

    if (roll < probability) {
      margin = probability - roll;
      maxMargin = probability;
    } else {
      margin = roll - probability;
      maxMargin = 1 - probability;
    }

    const normalizedMargin = maxMargin > 0 ? margin / maxMargin : 0;

    if (roll < probability) {
      if (normalizedMargin < 0.1) return OutcomeQuality.MARGINAL_SUCCESS;
      if (normalizedMargin > 0.8 && roll > profile.criticalSuccessThreshold) return OutcomeQuality.CRITICAL_SUCCESS;
      return OutcomeQuality.SUCCESS;
    } else {
      if (normalizedMargin < 0.1) return OutcomeQuality.MARGINAL_FAILURE;
      if (normalizedMargin > 0.8 && roll < profile.criticalFailureThreshold) return OutcomeQuality.CRITICAL_FAILURE;
      return OutcomeQuality.FAILURE;
    }
  }

  getSuccessChance(
    profile: ProbabilityProfile,
    context: Record<string, unknown>,
    entityUid?: string,
  ): number {
    return this.compute(profile, context, entityUid);
  }

  // ── Skill Progression ──

  improveSkill(entityUid: string, skillName: string, delta = 0.01): boolean {
    if (!this._npcSkills) return false;

    const profile = this._npcSkills.get(entityUid);
    if (!profile) return false;

    const skills = profile.skills ?? {};
    const current = skills[skillName] ?? 0.5;
    const increment = delta * (1.0 - current);
    const newVal = Math.min(1.0, current + increment);
    skills[skillName] = newVal;

    this._npcSkills.setSkills(entityUid, skills);
    this._npcSkills.save();
    return true;
  }

  getSkill(entityUid: string, skillName: string): number {
    if (!this._npcSkills) return 0.5;
    const profile = this._npcSkills.get(entityUid);
    if (!profile?.skills) return 0.5;
    return profile.skills[skillName] ?? 0.5;
  }

  // ── World Memory Logging ──

  async logOutcome(profile: ProbabilityProfile, result: ProbabilityResult, context: Record<string, unknown>): Promise<void> {
    if (!this._worldMemory) return;

    const actor = (context.actor as string) ?? "unknown";
    const quality = result.quality;
    const importance = isOutcomeCritical(quality) ? 0.6 : 0.3;

    await this._worldMemory.addMemory(
      `${actor} ${profile.name}: ${quality} (prob=${result.probability.toFixed(2)}, roll=${result.roll.toFixed(2)})`,
      "probability",
      profile.name,
      importance,
    );
  }

  // ── Persistence ──

  serializeModifiers(): Record<string, Record<string, unknown>[]> {
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const [uid, mods] of this._modifiers) {
      data[uid] = mods.map((m) => m.toDict() as unknown as Record<string, unknown>);
    }
    return data;
  }

  deserializeModifiers(data: Record<string, Record<string, unknown>[]>): void {
    this._modifiers.clear();
    for (const [uid, modList] of Object.entries(data)) {
      this._modifiers.set(
        uid,
        modList.map((m) => ProbabilityModifier.fromDict(m)),
      );
    }
    const now = Date.now() / 1000;
    for (const uid of this._modifiers.keys()) {
      this.removeExpiredModifiers(uid, now);
    }
  }

  getModifierSummary(entityUid: string): Record<string, unknown> {
    const mods = this.getAllModifiers(entityUid);
    const byParam: Record<string, unknown[]> = {};
    for (const m of mods) {
      const list = byParam[m.parameterName] ?? [];
      list.push({
        value: m.value,
        type: m.modifierType,
        source: m.source,
        expiresAt: m.expiresAt,
        description: m.description,
      });
      byParam[m.parameterName] = list;
    }
    return { totalModifiers: mods.length, byParameter: byParam, globalLuck: this.globalLuck };
  }

  async saveModifiers(path: string): Promise<void> {
    const data = this.serializeModifiers();
    const json = JSON.stringify(data, null, 2);
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, json, "utf-8");
  }

  async loadModifiers(path: string): Promise<void> {
    const { readFile, access } = await import("node:fs/promises");
    try {
      await access(path);
    } catch {
      return;
    }
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as Record<string, Record<string, unknown>[]>;
    this.deserializeModifiers(data);
  }
}

function isOutcomeCritical(q: OutcomeQuality): boolean {
  return q === OutcomeQuality.CRITICAL_FAILURE || q === OutcomeQuality.CRITICAL_SUCCESS;
}
