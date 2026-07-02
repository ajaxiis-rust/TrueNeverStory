/**
 * Story Planner — plans story arcs, chapters, and scheduled beats.
 * Replaces world_narrative/story_planner.ts.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("story-planner");

interface ChapterData {
  id: string;
  title: string;
  summary: string;
  start_time: string;
  end_time?: string;
  completed: boolean;
  beats: string[];
}

interface BeatData {
  id: string;
  chapter_id: string;
  type: string;
  description: string;
  scheduled_time?: string;
  triggered: boolean;
  involved_entities: string[];
}

interface PlannerState {
  chapters: Record<string, ChapterData>;
  beats: Record<string, BeatData>;
  current_chapter_id?: string;
}

export class StoryPlanner {
  private _statePath: string;
  private _chapters: Map<string, ChapterData> = new Map();
  private _beats: Map<string, BeatData> = new Map();
  currentChapterId: string | null = null;

  constructor(statePath: string) {
    this._statePath = statePath;
    this._load();
    if (this._chapters.size === 0) {
      this._createInitialPlan();
    }
  }

  private _load(): void {
    if (!existsSync(this._statePath)) return;
    try {
      const data = readJsonFileSync<PlannerState>(this._statePath);
      if (data) {
        for (const [k, v] of Object.entries(data.chapters ?? {})) {
          this._chapters.set(k, v);
        }
        for (const [k, v] of Object.entries(data.beats ?? {})) {
          this._beats.set(k, v);
        }
        this.currentChapterId = data.current_chapter_id ?? null;
      }
    } catch (err) {
      log.warn({ err }, "Failed to load story planner");
    }
  }

  private async _save(): Promise<void> {
    const data: PlannerState = {
      chapters: Object.fromEntries(this._chapters),
      beats: Object.fromEntries(this._beats),
      current_chapter_id: this.currentChapterId ?? undefined,
    };
    await atomicWriteJson(this._statePath, data);
  }

  private _createInitialPlan(): void {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    const ch1: ChapterData = { id: "ch1", title: "The Awakening", summary: "The protagonist discovers the central conflict.", start_time: now.toISOString(), completed: false, beats: [] };
    const ch2: ChapterData = { id: "ch2", title: "Trials and Tribulations", summary: "The hero faces challenges.", start_time: new Date(now.getTime() + 3 * day).toISOString(), completed: false, beats: [] };
    const ch3: ChapterData = { id: "ch3", title: "Climax", summary: "Final confrontation.", start_time: new Date(now.getTime() + 7 * day).toISOString(), completed: false, beats: [] };

    this._chapters.set("ch1", ch1);
    this._chapters.set("ch2", ch2);
    this._chapters.set("ch3", ch3);
    this.currentChapterId = "ch1";

    const beatTemplates: Array<[string, string]> = [
      ["inciting_incident", "A surprising event pushes the story forward."],
      ["revelation", "New information changes understanding."],
      ["setback", "The heroes suffer a defeat."],
      ["victory", "A small triumph builds hope."],
      ["cliffhanger", "The chapter ends with a tense moment."],
    ];

    for (const [chId, ch] of this._chapters) {
      const base = new Date(ch.start_time);
      for (let i = 0; i < beatTemplates.length; i++) {
        const [btype, desc] = beatTemplates[i]!;
        const beatId = `${chId}_${btype}`;
        this._beats.set(beatId, {
          id: beatId,
          chapter_id: chId,
          type: btype,
          description: desc,
          scheduled_time: new Date(base.getTime() + 12 * 60 * 60 * 1000 * (i + 1)).toISOString(),
          triggered: false,
          involved_entities: [],
        });
        ch.beats.push(beatId);
      }
    }

    this._save();
  }

  async shouldGenerateBeat(currentTime: Date): Promise<boolean> {
    for (const beat of this._beats.values()) {
      if (!beat.triggered && beat.scheduled_time && new Date(beat.scheduled_time) <= currentTime) {
        return true;
      }
    }
    return false;
  }

  async generateNextBeat(currentTime: Date): Promise<Record<string, unknown> | null> {
    const pending = Array.from(this._beats.values())
      .filter((b) => !b.triggered && b.scheduled_time && new Date(b.scheduled_time) <= currentTime)
      .sort((a, b) => new Date(a.scheduled_time!).getTime() - new Date(b.scheduled_time!).getTime());

    if (pending.length === 0) return null;

    const beat = pending[0]!;
    beat.triggered = true;
    await this._save();

    return {
      id: beat.id,
      type: beat.type,
      description: beat.description,
      involved_entities: beat.involved_entities,
      category: "story_beat",
    };
  }

  async markBeatDone(beatId: string): Promise<void> {
    const beat = this._beats.get(beatId);
    if (beat) {
      beat.triggered = true;
      await this._save();
    }
  }

  async getPendingBeats(currentTime: Date): Promise<Record<string, unknown>[]> {
    return Array.from(this._beats.values())
      .filter((b) => !b.triggered && b.scheduled_time && new Date(b.scheduled_time) <= currentTime)
      .map((b) => ({
        id: b.id,
        type: b.type,
        description: b.description,
        involved_entities: b.involved_entities,
      }));
  }

  async getPlanSummary(): Promise<Record<string, unknown>> {
    return {
      current_chapter: this.currentChapterId,
      chapters: Object.fromEntries(
        Array.from(this._chapters.entries()).map(([cid, ch]) => [
          cid,
          {
            title: ch.title,
            summary: ch.summary,
            completed: ch.completed,
            beats_done: Array.from(this._beats.values()).filter((b) => b.chapter_id === cid && b.triggered).length,
            beats_total: ch.beats.length,
          },
        ]),
      ),
      pending_beats: Array.from(this._beats.values()).filter((b) => !b.triggered).length,
    };
  }
}
