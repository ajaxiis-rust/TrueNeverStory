/**
 * Director models (replaces world_director/models.py).
 */

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface DirectorTaskData {
  id: string;
  type: string;
  priority: TaskPriority;
  data: Record<string, unknown>;
  created_at: Date;
  status?: string;
  result?: unknown;
}

export class DirectorTask {
  id: string;
  type: string;
  priority: TaskPriority;
  data: Record<string, unknown>;
  createdAt: Date;
  status: string;
  result: unknown;

  constructor(data: DirectorTaskData) {
    this.id = data.id;
    this.type = data.type;
    this.priority = data.priority;
    this.data = data.data;
    this.createdAt = data.created_at;
    this.status = data.status ?? "pending";
    this.result = data.result ?? null;
  }
}

export interface StoryArcData {
  id: string;
  name: string;
  description: string;
  beats: StoryBeat[];
  status: string;
  created_at: string;
}

export interface StoryBeat {
  id: string;
  description: string;
  timing: string;
  completed: boolean;
}

export class StoryArc {
  id: string;
  name: string;
  description: string;
  beats: StoryBeat[];
  status: string;
  createdAt: string;

  constructor(data: StoryArcData) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.beats = data.beats ?? [];
    this.status = data.status ?? "active";
    this.createdAt = data.created_at;
  }
}
