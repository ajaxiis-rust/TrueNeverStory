/**
 * Quest model (replaces world_narrative/quest_manager.py Quest).
 */

import { randomUUID } from "node:crypto";

export interface QuestObjective {
  type: string;
  target?: string;
  description?: string;
  completed?: boolean;
  status?: string;
}

export interface QuestData {
  id?: string;
  title?: string;
  description?: string;
  giver?: string;
  objectives?: QuestObjective[];
  status?: string;
  created_at?: string;
}

export class Quest {
  id: string;
  title: string;
  description: string;
  giver: string;
  objectives: QuestObjective[];
  status: string;
  createdAt: string;

  constructor(data: QuestData = {}) {
    this.id = data.id ?? randomUUID();
    this.title = data.title ?? "Untitled Quest";
    this.description = data.description ?? "";
    this.giver = data.giver ?? "Unknown";
    this.objectives = data.objectives ?? [];
    this.status = data.status ?? "active";
    this.createdAt = data.created_at ?? new Date().toISOString();
  }

  get progress(): number {
    if (this.objectives.length === 0) return 0;
    const completed = this.objectives.filter(
      (o) => o.completed || o.status === "completed"
    ).length;
    return completed / this.objectives.length;
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      giver: this.giver,
      objectives: this.objectives,
      status: this.status,
      created_at: this.createdAt,
    };
  }

  static fromDict(data: Record<string, unknown>): Quest {
    return new Quest({
      id: data.id as string,
      title: data.title as string,
      description: data.description as string,
      giver: data.giver as string,
      objectives: data.objectives as QuestObjective[],
      status: data.status as string,
      created_at: data.created_at as string,
    });
  }
}
