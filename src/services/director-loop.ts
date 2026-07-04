/**
 * Director Background Loop — unified background narrative orchestrator.
 * Replaces world_narrative/director.py.
 *
 * Runs a background loop: clock tick → social sim → villain tick → chance events → story beats.
 */

import type { EventBus } from "../lib/event-bus";
import type { Chronicler } from "./chronicler";
import type { WorldClock } from "./world-clock";
import type { StoryEngine } from "./story-engine";
import type { NPCRuntime } from "./npc-runtime";
import type { VillainManager } from "./villain-manager";
import type { StoryPlanner } from "./story-planner";
import { EventTopic } from "../lib/event-bus";
import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("director-loop");

export interface DirectorConfig {
  tickIntervalMinutes: number;
  chanceEventProbability: number;
  majorBeatCooldownHours: number;
  wakeIntervalSeconds: number;
}

const DEFAULT_CONFIG: DirectorConfig = {
  tickIntervalMinutes: 30,
  chanceEventProbability: 0.3,
  majorBeatCooldownHours: 6,
  wakeIntervalSeconds: 60,
};

interface DirectorState {
  last_major_beat: string | null;
}

export interface DirectorDeps {
  storyEngine: StoryEngine;
  chronicler: Chronicler;
  clock: WorldClock;
  npcRuntime: NPCRuntime;
  villainManager: VillainManager;
  storyPlanner: StoryPlanner;
  eventBus: EventBus;
  statePath: string;
  config?: Partial<DirectorConfig>;
}

export class DirectorLoop {
  private _storyEngine: StoryEngine;
  private _chronicler: Chronicler;
  private _clock: WorldClock;
  private _npcRuntime: NPCRuntime;
  private _villainManager: VillainManager;
  private _storyPlanner: StoryPlanner;
  private _eventBus: EventBus;
  private _config: DirectorConfig;
  private _statePath: string;
  private _running = false;
  private _paused = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _lastMajorBeatTime: Date | null = null;

  constructor(deps: DirectorDeps) {
    this._storyEngine = deps.storyEngine;
    this._chronicler = deps.chronicler;
    this._clock = deps.clock;
    this._npcRuntime = deps.npcRuntime;
    this._villainManager = deps.villainManager;
    this._storyPlanner = deps.storyPlanner;
    this._eventBus = deps.eventBus;
    this._config = { ...DEFAULT_CONFIG, ...deps.config };
    this._statePath = join(deps.statePath, "director_state.json");
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._statePath)) return;
    try {
      const data = readJsonFileSync<DirectorState>(this._statePath);
      if (data?.last_major_beat) {
        this._lastMajorBeatTime = new Date(data.last_major_beat);
      }
    } catch (err) {
      log.debug({ err }, "Failed to load director state");
    }
  }

  private async _save(): Promise<void> {
    const data: DirectorState = {
      last_major_beat: this._lastMajorBeatTime?.toISOString() ?? null,
    };
    await atomicWriteJson(this._statePath, data);
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._timer = setInterval(() => {
      this._runTick().catch((err) => log.error({ err }, "Director tick failed"));
    }, this._config.wakeIntervalSeconds * 1000);
    log.info("Director started");
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    log.info("Director stopped");
  }

  get isRunning(): boolean {
    return this._running;
  }

  get isPaused(): boolean {
    return this._paused;
  }

  pause(): void {
    this._paused = true;
    log.info("Director paused");
  }

  resume(): void {
    this._paused = false;
    log.info("Director resumed");
  }

  async forceChanceEvent(): Promise<Record<string, unknown>> {
    return this._generateChanceEvent(this._clock.currentTime);
  }

  async forceBeat(): Promise<Record<string, unknown>> {
    return this._generateMajorBeat(this._clock.currentTime);
  }

  async getStatus(): Promise<Record<string, unknown>> {
    return {
      running: this._running,
      last_major_beat: this._lastMajorBeatTime?.toISOString() ?? null,
      villain_status: await this._villainManager.getStatus(),
      story_plan: await this._storyPlanner.getPlanSummary(),
    };
  }

  private async _runTick(): Promise<void> {
    if (this._paused) return;
    try {
      await this._clock.tick(this._config.tickIntervalMinutes);
      const currentTime = this._clock.currentTime;

      // Social simulation
      try {
        await this._npcRuntime.simulateTurn(currentTime);
      } catch (err) {
        log.error({ err: err instanceof Error ? err : new Error(String(err ?? "simulateTurn failed")) }, "NPC simulateTurn failed");
      }

      // Villain tick
      let villainEvents: Array<Record<string, unknown>> = [];
      try {
        villainEvents = await this._villainManager.tick(currentTime);
      } catch (err) {
        log.error({ err: err instanceof Error ? err : new Error(String(err ?? "villain tick failed")) }, "Villain tick failed");
      }
      for (const ev of villainEvents) {
        try {
          await this._storyEngine.applyEffects(
            (ev.effects as Record<string, unknown>[]) ?? [],
            currentTime,
            (ev.involved_entities as string[]) ?? [],
          );
          await this._eventBus.publishSimple(
            EventTopic.VILLAIN_PROGRESS,
            { event: ev.title ?? "Unknown" },
            "director",
          );
        } catch (err) {
          log.error({ err: err instanceof Error ? err : new Error(String(err ?? "villain effect failed")) }, "Villain event processing failed");
        }
      }

      // Chance event
      if (Math.random() < this._config.chanceEventProbability) {
        try {
          await this._generateChanceEvent(currentTime);
        } catch (err) {
          log.error({ err: err instanceof Error ? err : new Error(String(err ?? "chance event failed")) }, "Chance event failed");
        }
      }

      // Major beat
      try {
        await this._maybeGenerateMajorBeat(currentTime);
      } catch (err) {
        log.error({ err: err instanceof Error ? err : new Error(String(err ?? "major beat failed")) }, "Major beat failed");
      }

      // Scheduled beats
      try {
        await this._processScheduledBeats(currentTime);
      } catch (err) {
        log.error({ err: err instanceof Error ? err : new Error(String(err ?? "scheduled beats failed")) }, "Scheduled beats failed");
      }

      this._save();
    } catch (err) {
      log.error({ err: err instanceof Error ? err : new Error(String(err ?? "Director tick failed")) }, "Director loop error");
    }
  }

  private async _generateChanceEvent(currentTime: Date): Promise<Record<string, unknown>> {
    const categories = [
      "accident", "discovery", "misunderstanding", "weather_event",
      "luck", "misfortune", "random_encounter", "rumor",
    ];
    const category = categories[Math.floor(Math.random() * categories.length)] ?? "accident";
    const npcs = Array.from(this._npcRuntime.listAll().keys());
    const involved = npcs.length >= 2
      ? [npcs[Math.floor(Math.random() * npcs.length)]!, npcs[Math.floor(Math.random() * npcs.length)]!]
      : npcs;

    const event = await this._storyEngine.generateEvent(
      currentTime,
      involved,
      category,
      0.2 + Math.random() * 0.5,
    );
    await this._storyEngine.applyEffects(
      (event.effects as Record<string, unknown>[]) ?? [],
      currentTime,
      (event.involved_entities as string[]) ?? [],
    );
    await this._chronicler.logEvent(
      `[Director] Chance: ${event.title ?? "Unknown event"}`,
      currentTime,
      "director",
    );
    await this._eventBus.publishSimple(
      EventTopic.STORY_EVENT,
      { title: event.title, category },
      "director",
    );
    return event;
  }

  private async _maybeGenerateMajorBeat(currentTime: Date): Promise<void> {
    if (this._lastMajorBeatTime) {
      const cooldown = this._config.majorBeatCooldownHours * 60 * 60 * 1000;
      if (currentTime.getTime() - this._lastMajorBeatTime.getTime() < cooldown) return;
    }
    if (await this._storyPlanner.shouldGenerateBeat(currentTime)) {
      await this._generateMajorBeat(currentTime);
    }
  }

  private async _generateMajorBeat(currentTime: Date): Promise<Record<string, unknown>> {
    log.info("Generating major story beat");
    const beat = await this._storyPlanner.generateNextBeat(currentTime);
    if (!beat) return {};

    const event = await this._storyEngine.generateEvent(
      currentTime,
      (beat.involved_entities as string[]) ?? [],
      (beat.category as string) ?? "story_beat",
      0.8,
    );
    await this._storyEngine.applyEffects(
      (event.effects as Record<string, unknown>[]) ?? [],
      currentTime,
      (event.involved_entities as string[]) ?? [],
    );
    await this._chronicler.logEvent(
      `[Director] Major beat: ${event.title ?? "Unknown"}`,
      currentTime,
      "director",
    );
    this._lastMajorBeatTime = currentTime;
    await this._save();
    await this._storyPlanner.markBeatDone(beat.id as string);

    await this._eventBus.publishSimple(
      EventTopic.STORY_BEAT,
      { title: event.title, beat_id: beat.id },
      "director",
    );
    return event;
  }

  private async _processScheduledBeats(currentTime: Date): Promise<void> {
    const pending = await this._storyPlanner.getPendingBeats(currentTime);
    for (const beat of pending) {
      const event = await this._storyEngine.generateEvent(
        currentTime,
        (beat.involved_entities as string[]) ?? [],
        "scheduled",
        0.6,
      );
      await this._storyEngine.applyEffects(
        (event.effects as Record<string, unknown>[]) ?? [],
        currentTime,
        (event.involved_entities as string[]) ?? [],
      );
      await this._chronicler.logEvent(
        `[Director] Scheduled: ${event.title ?? "Unknown"}`,
        currentTime,
        "director",
      );
    }
  }
}
