/**
 * StoryArcManager — CRUD for story arcs.
 * Replaces world_director/story_arc_manager.py.
 */

import { randomUUID } from "node:crypto";
import type { StoryArc, StoryBeat } from "../models/director";
import { atomicWriteJson, readJsonFileSync } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("story-arc-manager");

export type ArcType = "hero" | "villain" | "redemption" | "tragedy" | "coming_of_age";

export interface ArcPhase {
  description: string;
  required_beats: string[];
  completed: boolean;
}

export interface ArcTimelineEvent {
  description: string;
  timestamp: string;
}

export interface ManagedStoryArc {
  id: string;
  name: string;
  protagonist: string;
  arcType: ArcType;
  currentPhase: number;
  phases: ArcPhase[];
  timeline: ArcTimelineEvent[];
}

export class StoryArcManager {
  private _storagePath: string;
  private _arcs = new Map<string, ManagedStoryArc>();

  constructor(storagePath: string) {
    this._storagePath = join(storagePath, "story_arcs.json");
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._storagePath)) return;
    try {
      const data = readJsonFileSync<Record<string, ManagedStoryArc>>(this._storagePath);
      if (data) {
        for (const [id, arc] of Object.entries(data)) {
          this._arcs.set(id, arc);
        }
      }
    } catch (err) {
      log.warn({ err }, "Failed to load story arcs");
    }
  }

  private _save(): void {
    const data: Record<string, ManagedStoryArc> = {};
    for (const [id, arc] of this._arcs) {
      data[id] = arc;
    }
    atomicWriteJson(this._storagePath, data);
  }

  createArc(name: string, protagonist: string, arcType: ArcType, phases: ArcPhase[]): ManagedStoryArc {
    const id = randomUUID();
    const arc: ManagedStoryArc = {
      id,
      name,
      protagonist,
      arcType,
      currentPhase: 0,
      phases,
      timeline: [],
    };
    this._arcs.set(id, arc);
    this._save();
    log.info({ name, arcType }, "Created story arc");
    return arc;
  }

  advancePhase(arcId: string): boolean {
    const arc = this._arcs.get(arcId);
    if (!arc || arc.currentPhase + 1 >= arc.phases.length) return false;
    arc.currentPhase++;
    this._save();
    log.info({ arc: arc.name, phase: arc.currentPhase }, "Advanced arc phase");
    return true;
  }

  addEvent(arcId: string, description: string): void {
    const arc = this._arcs.get(arcId);
    if (!arc) return;
    arc.timeline.push({ description, timestamp: new Date().toISOString() });
    this._save();
  }

  getArcsForCharacter(characterUid: string): ManagedStoryArc[] {
    return Array.from(this._arcs.values()).filter((a) => a.protagonist === characterUid);
  }

  getArc(arcId: string): ManagedStoryArc | undefined {
    return this._arcs.get(arcId);
  }

  listArcs(): ManagedStoryArc[] {
    return Array.from(this._arcs.values());
  }

  deleteArc(arcId: string): boolean {
    const deleted = this._arcs.delete(arcId);
    if (deleted) this._save();
    return deleted;
  }
}
