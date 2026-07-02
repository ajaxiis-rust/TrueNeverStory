/**
 * World Clock — in-game time management with scheduled events.
 * Replaces world_narrative/world_clock.ts.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { getLogger } from "../utils/logger";

const log = getLogger("world-clock");

interface ScheduledEventData {
  time: string;
  callback: string;
  data: Record<string, unknown>;
}

interface ClockState {
  current_time: string;
  global_luck: number;
  scheduled: ScheduledEventData[];
}

export class WorldClock {
  private _statePath: string;
  currentTime: Date;
  globalLuck: number;
  private _scheduledEvents: Array<{ time: Date; callback: string; data: Record<string, unknown> }> = [];
  private _callbacks: Map<string, (data: Record<string, unknown>) => void | Promise<void>> = new Map();
  storyEngine: { generateEvent?: (data: Record<string, unknown>) => Promise<Record<string, unknown>> } | null = null;

  constructor(statePath: string) {
    this._statePath = statePath;
    this.currentTime = new Date();
    this.globalLuck = 0.5;
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._statePath)) return;
    try {
      const data = readJsonFileSync<ClockState>(this._statePath);
      if (data) {
        this.currentTime = new Date(data.current_time);
        this.globalLuck = data.global_luck ?? 0.5;
        this._scheduledEvents = (data.scheduled ?? []).map((e) => ({
          time: new Date(e.time),
          callback: e.callback,
          data: e.data,
        }));
      }
    } catch (err) {
      log.warn({ err }, "Failed to load world clock state");
    }
  }

  async _save(): Promise<void> {
    const data: ClockState = {
      current_time: this.currentTime.toISOString(),
      global_luck: this.globalLuck,
      scheduled: this._scheduledEvents.map((e) => ({
        time: e.time.toISOString(),
        callback: e.callback,
        data: e.data,
      })),
    };
    await atomicWriteJson(this._statePath, data);
  }

  registerCallback(name: string, cb: (data: Record<string, unknown>) => void | Promise<void>): void {
    this._callbacks.set(name, cb);
  }

  async tick(minutes = 10): Promise<void> {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);

    const due = this._scheduledEvents.filter((e) => e.time <= this.currentTime);
    this._scheduledEvents = this._scheduledEvents.filter((e) => e.time > this.currentTime);

    for (const event of due) {
      await this._dispatchEvent(event);
    }

    await this._save();
  }

  private async _dispatchEvent(event: { callback: string; data: Record<string, unknown> }): Promise<void> {
    log.info({ callback: event.callback }, "Dispatching scheduled event");
    const cb = this._callbacks.get(event.callback);
    if (cb) {
      try {
        await cb(event.data);
      } catch (err) {
        log.error({ err, callback: event.callback }, "Event callback failed");
      }
    }
  }

  async scheduleEvent(when: Date, callback: string, data: Record<string, unknown> = {}): Promise<void> {
    this._scheduledEvents.push({ time: when, callback, data });
    this._scheduledEvents.sort((a, b) => a.time.getTime() - b.time.getTime());
    await this._save();
  }

  async scheduleRelative(minutesFromNow: number, callback: string, data: Record<string, unknown> = {}): Promise<void> {
    const when = new Date(this.currentTime.getTime() + minutesFromNow * 60 * 1000);
    await this.scheduleEvent(when, callback, data);
  }

  getGlobalLuck(): number {
    return this.globalLuck;
  }

  async setGlobalLuck(luck: number): Promise<void> {
    this.globalLuck = Math.max(0, Math.min(1, luck));
    await this._save();
  }

  getScheduledEvents(): Array<{ time: string; callback: string; data: Record<string, unknown> }> {
    return this._scheduledEvents.map((e) => ({
      time: e.time.toISOString(),
      callback: e.callback,
      data: e.data,
    }));
  }
}
