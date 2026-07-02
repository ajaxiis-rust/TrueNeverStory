/**
 * Quest Manager — dynamic quest system.
 * Replaces world_narrative/quest_manager.ts.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("quest-manager");

interface QuestObjective {
  type: string;
  target?: string;
  description?: string;
  completed?: boolean;
  status?: string;
}

interface QuestData {
  id: string;
  title: string;
  description: string;
  giver: string;
  objectives: QuestObjective[];
  status: string;
  created_at: string;
}

export class QuestManager {
  private _storagePath: string;
  private _quests: Map<string, QuestData> = new Map();
  probCheckCallback: ((profile: string, actor: string, target?: string) => boolean) | null = null;

  constructor(storagePath: string) {
    this._storagePath = storagePath;
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._storagePath)) return;
    try {
      const data = readJsonFileSync<Record<string, QuestData>>(this._storagePath);
      if (data) {
        for (const [id, q] of Object.entries(data)) {
          this._quests.set(id, q);
        }
      }
    } catch (err) {
      log.warn({ err }, "Failed to load quests");
    }
  }

  private _save(): void {
    const data: Record<string, QuestData> = {};
    for (const [id, q] of this._quests) data[id] = q;
    atomicWriteJson(this._storagePath, data);
  }

  getQuest(questId: string): QuestData | undefined {
    return this._quests.get(questId);
  }

  getAllQuests(): QuestData[] {
    return Array.from(this._quests.values());
  }

  addQuest(quest: QuestData): void {
    this._quests.set(quest.id, quest);
    this._save();
  }

  updateQuest(questId: string, updates: Partial<QuestData>): boolean {
    const quest = this._quests.get(questId);
    if (!quest) return false;
    Object.assign(quest, updates);
    this._save();
    return true;
  }

  completeObjective(questId: string, objectiveIndex: number): boolean {
    const quest = this._quests.get(questId);
    if (!quest) return false;
    const obj = quest.objectives[objectiveIndex];
    if (!obj) return false;
    obj.completed = true;
    obj.status = "completed";

    // Check if all objectives are completed
    if (quest.objectives.every((o) => o.completed || o.status === "completed")) {
      quest.status = "completed";
    }
    this._save();
    return true;
  }

  removeQuest(questId: string): boolean {
    const deleted = this._quests.delete(questId);
    if (deleted) this._save();
    return deleted;
  }
}
