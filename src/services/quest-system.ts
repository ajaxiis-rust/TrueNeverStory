/**
 * Quest System — full quest lifecycle with objectives, rewards, chains, and dialogue integration.
 * Extends QuestManager with rich quest mechanics.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { NPCRuntime } from "./npc-runtime";
import type { SocialGraph } from "./social-graph";
import type { QuestManager } from "./quest-manager";

export type QuestType = "main" | "side" | "daily" | "faction" | "chain";

export type ObjectiveType = "kill" | "collect" | "talk" | "go_to" | "escort" | "craft" | "survive";

export type QuestState = "available" | "active" | "completed" | "failed" | "abandoned";

export interface QuestReward {
  gold: number;
  experience: number;
  items: string[];
  reputation: Record<string, number>;
}

export interface QuestPrerequisite {
  minLevel?: number;
  faction?: string;
  completedQuests?: string[];
  minRelationship?: { npc: string; value: number };
}

export interface QuestObjectiveDef {
  type: ObjectiveType;
  target: string;
  description: string;
  count: number;
  current: number;
  completed: boolean;
}

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  giver: string;
  giverFaction: string | null;
  objectives: QuestObjectiveDef[];
  rewards: QuestReward;
  prerequisites: QuestPrerequisite;
  failureConditions: string[];
  timeLimit: number | null;
  chainNext: string | null;
  state: QuestState;
  acceptedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface QuestProgress {
  questId: string;
  title: string;
  state: QuestState;
  objectives: { description: string; progress: number; total: number }[];
  overallProgress: number;
}

export class QuestSystem {
  private _statePath: string;
  private _questMgr: QuestManager;
  private _runtime: NPCRuntime | null;
  private _social: SocialGraph | null;
  private _definitions: Map<string, QuestDefinition> = new Map();

  constructor(
    statePath: string,
    questMgr: QuestManager,
    runtime: NPCRuntime | null = null,
    social: SocialGraph | null = null,
  ) {
    this._statePath = statePath;
    this._questMgr = questMgr;
    this._runtime = runtime;
    this._social = social;

    const dir = join(statePath, "quests");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
  }

  private _load(): void {
    const path = join(this._statePath, "quests", "definitions.json");
    if (!existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data.quests) {
        for (const [id, q] of Object.entries(data.quests)) {
          this._definitions.set(id, q as QuestDefinition);
        }
      }
    } catch {
      // ignore
    }
  }

  private _save(): void {
    const data = { quests: Object.fromEntries(this._definitions) };
    writeFileSync(join(this._statePath, "quests", "definitions.json"), JSON.stringify(data, null, 2));
  }

  createQuest(
    title: string,
    description: string,
    type: QuestType,
    giver: string,
    objectives: Array<{ type: ObjectiveType; target: string; description: string; count: number }>,
    rewards: QuestReward,
    opts: {
      giverFaction?: string;
      prerequisites?: QuestPrerequisite;
      failureConditions?: string[];
      timeLimit?: number;
      chainNext?: string;
    } = {},
  ): QuestDefinition {
    const id = `quest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const quest: QuestDefinition = {
      id,
      title,
      description,
      type,
      giver,
      giverFaction: opts.giverFaction ?? null,
      objectives: objectives.map(o => ({
        type: o.type,
        target: o.target,
        description: o.description,
        count: o.count,
        current: 0,
        completed: false,
      })),
      rewards,
      prerequisites: opts.prerequisites ?? {},
      failureConditions: opts.failureConditions ?? [],
      timeLimit: opts.timeLimit ?? null,
      chainNext: opts.chainNext ?? null,
      state: "available",
      acceptedAt: null,
      completedAt: null,
      expiresAt: null,
    };

    this._definitions.set(id, quest);

    this._questMgr.addQuest({
      id,
      title,
      description,
      giver,
      objectives: quest.objectives.map(o => ({
        type: o.type,
        target: o.target,
        description: o.description,
        completed: o.completed,
      })),
      status: "available",
      created_at: new Date().toISOString(),
    });

    this._save();
    return quest;
  }

  meetsPrerequisites(questId: string, playerLevel: number, playerFaction: string | null, completedQuests: string[]): boolean {
    const quest = this._definitions.get(questId);
    if (!quest) return false;
    const prereqs = quest.prerequisites;

    if (prereqs.minLevel !== undefined && playerLevel < prereqs.minLevel) return false;
    if (prereqs.faction !== undefined && prereqs.faction !== playerFaction) return false;
    if (prereqs.completedQuests) {
      if (!prereqs.completedQuests.every(q => completedQuests.includes(q))) return false;
    }
    if (prereqs.minRelationship && this._social) {
      const rel = this._social.getRelationship(prereqs.minRelationship.npc, "Player");
      if (!rel || rel.strength < prereqs.minRelationship.value) return false;
    }
    return true;
  }

  acceptQuest(questId: string): boolean {
    const quest = this._definitions.get(questId);
    if (!quest || quest.state !== "available") return false;

    quest.state = "active";
    quest.acceptedAt = new Date().toISOString();
    if (quest.timeLimit) {
      quest.expiresAt = new Date(Date.now() + quest.timeLimit * 60000).toISOString();
    }

    this._questMgr.updateQuest(questId, { status: "active" });
    this._save();
    return true;
  }

  abandonQuest(questId: string): boolean {
    const quest = this._definitions.get(questId);
    if (!quest || quest.state !== "active") return false;

    quest.state = "abandoned";
    this._questMgr.updateQuest(questId, { status: "abandoned" });
    this._save();
    return true;
  }

  progressObjective(questId: string, objectiveIndex: number, amount = 1): boolean {
    const quest = this._definitions.get(questId);
    if (!quest || quest.state !== "active") return false;

    const obj = quest.objectives[objectiveIndex];
    if (!obj || obj.completed) return false;

    obj.current = Math.min(obj.count, obj.current + amount);
    if (obj.current >= obj.count) {
      obj.completed = true;
      this._questMgr.completeObjective(questId, objectiveIndex);
    }

    if (quest.objectives.every(o => o.completed)) {
      quest.state = "completed";
      quest.completedAt = new Date().toISOString();
      this._questMgr.updateQuest(questId, { status: "completed" });

      if (quest.chainNext) {
        const next = this._definitions.get(quest.chainNext);
        if (next && next.state === "available") {
          // chain quest becomes available
        }
      }
    }

    this._save();
    return true;
  }

  completeObjectiveByType(questId: string, type: ObjectiveType, target: string, amount = 1): boolean {
    const quest = this._definitions.get(questId);
    if (!quest || quest.state !== "active") return false;

    const idx = quest.objectives.findIndex(o => o.type === type && o.target === target && !o.completed);
    if (idx === -1) return false;

    return this.progressObjective(questId, idx, amount);
  }

  checkTimeLimits(): string[] {
    const failed: string[] = [];
    const now = new Date();

    for (const [id, quest] of this._definitions) {
      if (quest.state !== "active" || !quest.expiresAt) continue;
      if (new Date(quest.expiresAt) < now) {
        quest.state = "failed";
        this._questMgr.updateQuest(id, { status: "failed" });
        failed.push(id);
      }
    }

    if (failed.length > 0) this._save();
    return failed;
  }

  getQuest(questId: string): QuestDefinition | undefined {
    return this._definitions.get(questId);
  }

  getAvailableQuests(): QuestDefinition[] {
    return Array.from(this._definitions.values()).filter(q => q.state === "available");
  }

  getActiveQuests(): QuestDefinition[] {
    return Array.from(this._definitions.values()).filter(q => q.state === "active");
  }

  getCompletedQuests(): QuestDefinition[] {
    return Array.from(this._definitions.values()).filter(q => q.state === "completed");
  }

  getQuestsByGiver(giver: string): QuestDefinition[] {
    return Array.from(this._definitions.values()).filter(q => q.giver === giver);
  }

  getQuestsByType(type: QuestType): QuestDefinition[] {
    return Array.from(this._definitions.values()).filter(q => q.type === type);
  }

  getQuestProgress(questId: string): QuestProgress | null {
    const quest = this._definitions.get(questId);
    if (!quest) return null;

    const objectives = quest.objectives.map(o => ({
      description: o.description,
      progress: o.current,
      total: o.count,
    }));

    const totalObj = quest.objectives.reduce((sum, o) => sum + o.count, 0);
    const currentObj = quest.objectives.reduce((sum, o) => sum + o.current, 0);
    const overallProgress = totalObj > 0 ? currentObj / totalObj : 0;

    return {
      questId: quest.id,
      title: quest.title,
      state: quest.state,
      objectives,
      overallProgress,
    };
  }

  getAllProgress(): QuestProgress[] {
    return Array.from(this._definitions.values())
      .map(q => this.getQuestProgress(q.id)!)
      .filter(Boolean);
  }

  grantRewards(questId: string): QuestReward | null {
    const quest = this._definitions.get(questId);
    if (!quest || quest.state !== "completed") return null;
    return quest.rewards;
  }

  getDialogueOffer(giver: string, playerLevel: number, playerFaction: string | null, completedQuests: string[]): QuestDefinition | null {
    const all = Array.from(this._definitions.values());
    const available = all.filter(q =>
      q.giver === giver &&
      q.state === "available" &&
      this.meetsPrerequisites(q.id, playerLevel, playerFaction, completedQuests),
    );

    const active = all.filter(q =>
      q.giver === giver && q.state === "active",
    );

    if (active.length > 0) return active[0]!;
    if (available.length > 0) return available[0]!;
    return null;
  }

  getQuestSummary(questId: string): string {
    const quest = this._definitions.get(questId);
    if (!quest) return "Unknown quest";

    const objList = quest.objectives
      .map(o => `  [${o.completed ? "x" : " "}] ${o.description} (${o.current}/${o.count})`)
      .join("\n");

    return `=== ${quest.title} (${quest.state}) ===\n${quest.description}\n\nObjectives:\n${objList}\n\nRewards: ${quest.rewards.gold} gold, ${quest.rewards.experience} XP`;
  }
}
