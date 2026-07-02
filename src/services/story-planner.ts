/**
 * Story Planner — dynamic LLM-driven story arc planning.
 * Two-phase planning with compressed context for small models.
 * Backward-compatible with DirectorLoop (shouldGenerateBeat, generateNextBeat, etc.).
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { LLMQueue } from "../lib/llm-queue";
import type { NPCRuntime } from "./npc-runtime";
import type { SocialGraph } from "./social-graph";
import type { QuestSystem } from "./quest-system";
import type { Chronicler } from "./chronicler";
import { TaskPriority } from "../models/director";
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

export interface BeatData {
  id: string;
  chapter_id: string;
  type: string;
  description: string;
  scheduled_time?: string;
  triggered: boolean;
  involved_entities: string[];
  location?: string;
  consequences?: string[];
}

interface PlannerState {
  chapters: Record<string, ChapterData>;
  beats: Record<string, BeatData>;
  current_chapter_id?: string;
  arc_title?: string;
  last_plan_time?: string;
}

export interface StoryPlannerDeps {
  statePath: string;
  llmQueue?: LLMQueue | null;
  npcRuntime?: NPCRuntime | null;
  socialGraph?: SocialGraph | null;
  questSystem?: QuestSystem | null;
  chronicler?: Chronicler | null;
  worldName?: string;
  worldRules?: string[];
}

export class StoryPlanner {
  private _statePath: string;
  private _llmQueue: LLMQueue | null;
  private _npcRuntime: NPCRuntime | null;
  private _socialGraph: SocialGraph | null;
  private _questSystem: QuestSystem | null;
  private _chronicler: Chronicler | null;
  private _worldName: string;
  private _worldRules: string[];
  private _chapters: Map<string, ChapterData> = new Map();
  private _beats: Map<string, BeatData> = new Map();
  private _arcTitle: string | null = null;
  private _lastPlanTime: Date | null = null;
  currentChapterId: string | null = null;

  constructor(deps: StoryPlannerDeps) {
    this._statePath = deps.statePath;
    this._llmQueue = deps.llmQueue ?? null;
    this._npcRuntime = deps.npcRuntime ?? null;
    this._socialGraph = deps.socialGraph ?? null;
    this._questSystem = deps.questSystem ?? null;
    this._chronicler = deps.chronicler ?? null;
    this._worldName = deps.worldName ?? "Unknown World";
    this._worldRules = deps.worldRules ?? [];
    this._load();
    if (this._chapters.size === 0) {
      this._createFallbackPlan();
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
        this._arcTitle = data.arc_title ?? null;
        this._lastPlanTime = data.last_plan_time ? new Date(data.last_plan_time) : null;
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
      arc_title: this._arcTitle ?? undefined,
      last_plan_time: this._lastPlanTime?.toISOString(),
    };
    await atomicWriteJson(this._statePath, data);
  }

  private _createFallbackPlan(): void {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    const ch1: ChapterData = { id: "ch1", title: "The Awakening", summary: "The protagonist discovers the central conflict.", start_time: now.toISOString(), completed: false, beats: [] };
    const ch2: ChapterData = { id: "ch2", title: "Trials and Tribulations", summary: "The hero faces challenges.", start_time: new Date(now.getTime() + 3 * day).toISOString(), completed: false, beats: [] };
    const ch3: ChapterData = { id: "ch3", title: "Climax", summary: "Final confrontation.", start_time: new Date(now.getTime() + 7 * day).toISOString(), completed: false, beats: [] };

    this._chapters.set("ch1", ch1);
    this._chapters.set("ch2", ch2);
    this._chapters.set("ch3", ch3);
    this.currentChapterId = "ch1";

    const templates: Array<[string, string]> = [
      ["inciting_incident", "A surprising event pushes the story forward."],
      ["revelation", "New information changes understanding."],
      ["setback", "The heroes suffer a defeat."],
      ["victory", "A small triumph builds hope."],
      ["cliffhanger", "The chapter ends with a tense moment."],
    ];

    for (const [chId, ch] of this._chapters) {
      const base = new Date(ch.start_time);
      for (let i = 0; i < templates.length; i++) {
        const [btype, desc] = templates[i]!;
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

  // ─── Context Compression ────────────────────────────────────────

  buildContextSummary(): string {
    const parts: string[] = [];

    parts.push(`World: ${this._worldName}`);

    if (this._worldRules.length > 0) {
      parts.push(`Rules: ${this._worldRules.slice(0, 3).join("; ")}`);
    }

    if (this._npcRuntime) {
      const npcs = Array.from(this._npcRuntime.listAll().entries());
      const npcLines = npcs.slice(0, 8).map(([name, p]) => {
        return `${name}(${p.location},${p.mood})`;
      });
      if (npcLines.length > 0) {
        parts.push(`NPCs: ${npcLines.join(", ")}`);
      }
    }

    if (this._socialGraph) {
      const factionConflicts: string[] = [];
      const alliances: string[] = [];
      for (const faction of ["guards", "thieves", "merchants", "nobles", "peasants"]) {
        const conflicts = this._socialGraph.getFactionConflicts(faction);
        for (const c of conflicts) {
          if (faction < c) factionConflicts.push(`${faction}↔${c}`);
        }
      }
      if (factionConflicts.length > 0) {
        parts.push(`Conflicts: ${factionConflicts.join(", ")}`);
      }

      for (const faction of ["guards", "thieves", "merchants", "nobles", "peasants"]) {
        const activeAlliances = this._socialGraph.getActiveAlliances(faction);
        for (const a of activeAlliances) {
          const other = a.faction1 === faction ? a.faction2 : a.faction1;
          if (faction < other) alliances.push(`${faction}+${other}(${a.type})`);
        }
      }
      if (alliances.length > 0) {
        parts.push(`Alliances: ${alliances.join(", ")}`);
      }
    }

    if (this._questSystem) {
      const active = this._questSystem.getActiveQuests().slice(0, 3);
      if (active.length > 0) {
        const qLines = active.map(q => {
          const objDone = q.objectives.filter(o => o.completed).length;
          return `"${q.title}"(${objDone}/${q.objectives.length})`;
        });
        parts.push(`Quests: ${qLines.join(", ")}`);
      }
    }

    if (this._chronicler) {
      // synchronous summary from internal state — no await needed for compact events
      // chronicler.getTimeline is async but we can skip in context builder
    }

    const pendingBeats = Array.from(this._beats.values()).filter(b => !b.triggered);
    if (pendingBeats.length > 0) {
      parts.push(`Pending beats: ${pendingBeats.length}`);
    }

    if (this._arcTitle) {
      parts.push(`Current arc: ${this._arcTitle}`);
    }

    return parts.join("\n");
  }

  async buildFullContext(): Promise<string> {
    const base = this.buildContextSummary();
    const extra: string[] = [base];

    if (this._chronicler) {
      try {
        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const events = await this._chronicler.getTimeline(since, 5);
        if (events.length > 0) {
          extra.push(`Recent: ${events.map(e => e.description).join(" | ")}`);
        }
      } catch {
        // skip
      }
    }

    const doneChapters = Array.from(this._chapters.values()).filter(ch => ch.completed);
    if (doneChapters.length > 0) {
      extra.push(`Done: ${doneChapters.map(ch => ch.title).join(", ")}`);
    }

    return extra.join("\n");
  }

  // ─── Two-Phase LLM Planning ────────────────────────────────────

  async planNextArc(): Promise<boolean> {
    if (!this._llmQueue) {
      log.debug("No LLM queue, using fallback plan");
      return false;
    }

    const allBeatsDone = Array.from(this._beats.values()).every(b => b.triggered);
    if (!allBeatsDone && this._chapters.size > 0) {
      return false;
    }

    try {
      const context = await this.buildFullContext();

      const arc = await this._phase1PlanArc(context);
      if (!arc) return false;

      await this._phase2DetailBeats(arc, context);

      this._lastPlanTime = new Date();
      await this._save();

      log.info({ arc: this._arcTitle }, "New story arc planned");
      return true;
    } catch (err) {
      log.error({ err }, "LLM arc planning failed");
      return false;
    }
  }

  private async _phase1PlanArc(context: string): Promise<{
    arc_title: string;
    chapters: Array<{ title: string; summary: string; beat_count: number }>;
  } | null> {
    const prompt = `You are a story planner for an interactive fantasy world.
Based on the world state below, plan the NEXT story arc (2-3 chapters, 3-4 beats each).

World State:
${context}

Return JSON only:
{
  "arc_title": "short arc title",
  "chapters": [
    {"title": "chapter title", "summary": "1-sentence summary", "beat_count": 3}
  ]
}

Rules:
- Connect to existing events and characters
- Create dramatic tension and meaningful choices
- Each chapter should escalate stakes
- Keep titles evocative but concise`;

    try {
      const result = await this._llmQueue!.generateJson(prompt, TaskPriority.LOW, 0.8);
      if (result.arc_title && Array.isArray(result.chapters) && result.chapters.length > 0) {
        return result as unknown as { arc_title: string; chapters: Array<{ title: string; summary: string; beat_count: number }> };
      }
    } catch (err) {
      log.warn({ err }, "Phase 1 LLM call failed");
    }
    return null;
  }

  private async _phase2DetailBeats(
    arc: { arc_title: string; chapters: Array<{ title: string; summary: string; beat_count: number }> },
    baseContext: string,
  ): Promise<void> {
    this._chapters.clear();
    this._beats.clear();
    this._arcTitle = arc.arc_title;

    const now = new Date();
    const chapterHours = [0, 24, 48];

    for (let ci = 0; ci < arc.chapters.length; ci++) {
      const chDef = arc.chapters[ci]!;
      const chId = `ch_${ci + 1}_${Date.now()}`;
      const startTime = new Date(now.getTime() + (chapterHours[ci] ?? ci * 24) * 60 * 60 * 1000);

      const ch: ChapterData = {
        id: chId,
        title: chDef.title,
        summary: chDef.summary,
        start_time: startTime.toISOString(),
        completed: false,
        beats: [],
      };
      this._chapters.set(chId, ch);

      if (ci === 0) this.currentChapterId = chId;

      const beats = await this._generateBeatsForChapter(chId, chDef, arc.arc_title, baseContext);

      for (let bi = 0; bi < beats.length; bi++) {
        const b = beats[bi]!;
        const beatId = `${chId}_beat${bi}`;
        const scheduledTime = new Date(startTime.getTime() + 6 * 60 * 60 * 1000 * (bi + 1));

        const beatData: BeatData = {
          id: beatId,
          chapter_id: chId,
          type: b.type || "story_beat",
          description: b.description,
          scheduled_time: scheduledTime.toISOString(),
          triggered: false,
          involved_entities: b.involved || [],
          location: b.location,
          consequences: b.consequences,
        };

        this._beats.set(beatId, beatData);
        ch.beats.push(beatId);
      }
    }
  }

  private async _generateBeatsForChapter(
    chapterId: string,
    chapter: { title: string; summary: string; beat_count: number },
    arcTitle: string,
    context: string,
  ): Promise<Array<{ type: string; description: string; involved: string[]; location?: string; consequences?: string[] }>> {
    if (!this._llmQueue) {
      return this._fallbackBeats(chapterId, chapter.beat_count);
    }

    const prompt = `Generate ${chapter.beat_count} story beats for this chapter.

Arc: "${arcTitle}"
Chapter: "${chapter.title}" — ${chapter.summary}

World Context:
${context}

Return JSON only:
[
  {
    "type": "inciting_incident|revelation|setback|victory|cliffhanger|turning_point|discovery|conflict",
    "description": "1-2 sentence description of what happens",
    "involved": ["NPC_name1", "NPC_name2"],
    "location": "place name",
    "consequences": ["what changes as a result"]
  }
]

Rules:
- Use actual NPC names from the context
- Each beat should flow into the next
- Escalate tension across beats
- Make consequences specific and actionable`;

    try {
      const result = await this._llmQueue.generateJson(prompt, TaskPriority.LOW, 0.8);
      if (Array.isArray(result) && result.length > 0) {
        return result as unknown as Array<{ type: string; description: string; involved: string[]; location?: string; consequences?: string[] }>;
      }
    } catch (err) {
      log.warn({ err }, "Phase 2 LLM call failed, using fallback beats");
    }

    return this._fallbackBeats(chapterId, chapter.beat_count);
  }

  private _fallbackBeats(chapterId: string, count: number): Array<{ type: string; description: string; involved: string[] }> {
    const templates: Array<[string, string]> = [
      ["inciting_incident", "A surprising event pushes the story forward."],
      ["revelation", "New information changes understanding."],
      ["setback", "The heroes suffer a defeat."],
      ["victory", "A small triumph builds hope."],
      ["cliffhanger", "The chapter ends with a tense moment."],
    ];
    return templates.slice(0, count).map(([type, description]) => ({
      type,
      description,
      involved: [],
    }));
  }

  // ─── Adaptive Replanning ───────────────────────────────────────

  shouldReplan(): boolean {
    if (!this._lastPlanTime) return true;
    const hoursSincePlan = (Date.now() - this._lastPlanTime.getTime()) / (60 * 60 * 1000);
    if (hoursSincePlan > 48) return true;

    const total = this._beats.size;
    if (total === 0) return true;

    const triggered = Array.from(this._beats.values()).filter(b => b.triggered).length;
    const staleRatio = total > 0 ? triggered / total : 0;

    return staleRatio > 0.7;
  }

  async replanIfStale(): Promise<boolean> {
    if (!this.shouldReplan()) return false;
    log.info("Plan is stale, replanning");
    return this.planNextArc();
  }

  // ─── Beat Management (backward-compatible) ─────────────────────

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

    const allChapterBeats = Array.from(this._beats.values()).filter(b => b.chapter_id === beat.chapter_id);
    if (allChapterBeats.every(b => b.triggered)) {
      const ch = this._chapters.get(beat.chapter_id);
      if (ch) {
        ch.completed = true;
        const nextChapter = this._findNextChapter(beat.chapter_id);
        if (nextChapter) {
          this.currentChapterId = nextChapter.id;
        }
      }
    }

    await this._save();

    return {
      id: beat.id,
      type: beat.type,
      description: beat.description,
      involved_entities: beat.involved_entities,
      location: beat.location ?? "",
      consequences: beat.consequences ?? [],
      category: "story_beat",
    };
  }

  private _findNextChapter(currentId: string): ChapterData | null {
    const chapters = Array.from(this._chapters.values()).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    const idx = chapters.findIndex(ch => ch.id === currentId);
    if (idx >= 0 && idx < chapters.length - 1) {
      return chapters[idx + 1]!;
    }
    return null;
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
        location: b.location ?? "",
      }));
  }

  async getPlanSummary(): Promise<Record<string, unknown>> {
    const totalBeats = this._beats.size;
    const doneBeats = Array.from(this._beats.values()).filter(b => b.triggered).length;

    return {
      arc_title: this._arcTitle,
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
      pending_beats: totalBeats - doneBeats,
      total_beats: totalBeats,
      llm_available: this._llmQueue !== null,
      last_plan: this._lastPlanTime?.toISOString() ?? null,
    };
  }

  getChapters(): ChapterData[] {
    return Array.from(this._chapters.values());
  }

  getBeats(chapterId?: string): BeatData[] {
    const all = Array.from(this._beats.values());
    return chapterId ? all.filter(b => b.chapter_id === chapterId) : all;
  }
}
