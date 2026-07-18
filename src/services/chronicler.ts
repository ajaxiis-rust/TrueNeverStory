/**
 * Chronicler — event timeline logger.
 * Replaces world_narrative/chronicler.py.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("chronicler");

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

interface TimelineEntry {
  id: string;
  timestamp: string;
  group: string;
  description: string;
}

export class Chronicler {
  private _logPath: string;
  private _maxLogSize: number;
  private _worldMemory: { addEvent?: (data: { eventDescription: string; group: string; importance: number }) => Promise<void> } | null;

  constructor(logPath: string, maxLogSize = MAX_LOG_SIZE, worldMemory?: { addEvent?: (data: { eventDescription: string; group: string; importance: number }) => Promise<void> } | null) {
    this._logPath = logPath;
    this._maxLogSize = maxLogSize;
    this._worldMemory = worldMemory ?? null;

    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private _checkAndRotate(): void {
    if (!existsSync(this._logPath)) return;
    try {
      const stat = statSync(this._logPath);
      if (stat.size > this._maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const backupPath = this._logPath.replace(".jsonl", `.old_${timestamp}.jsonl`);
        renameSync(this._logPath, backupPath);
        log.info({ backupPath }, "Rotated log file");
      }
    } catch (err) {
      log.warn({ err }, "Log rotation failed");
    }
  }

  async logEvent(description: string, storyTime: Date, group = "narrative"): Promise<string> {
    this._checkAndRotate();

    const eventId = randomUUID();
    const entry: TimelineEntry = {
      id: eventId,
      timestamp: storyTime.toISOString(),
      group,
      description,
    };

    try {
      appendFileSync(this._logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      log.error({ err }, "Failed to write event to log");
      throw err;
    }

    // Sync to unified world memory if available
    if (this._worldMemory) {
      try {
        await this._worldMemory.addEvent?.({
          eventDescription: description,
          group,
          importance: 0.4,
        });
      } catch (err) {
        log.debug({ err }, "Failed to add event to world memory");
      }
    }

    return eventId;
  }

  async getTimeline(since?: Date, limit = 50): Promise<TimelineEntry[]> {
    if (!existsSync(this._logPath)) return [];

    let entries: TimelineEntry[] = [];
    try {
      const content = readFileSync(this._logPath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as TimelineEntry;
          if (!since || new Date(entry.timestamp) >= since) {
            entries.push(entry);
          }
        } catch (e) {
          log.debug({ err: e, line }, "Failed to parse timeline entry");
          continue;
        }
      }
    } catch (err) {
      log.error({ err }, "Failed to read timeline");
      return [];
    }

    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return entries.slice(-limit);
  }

  async getEventsByGroup(group: string, limit = 50): Promise<TimelineEntry[]> {
    const allEvents = await this.getTimeline(undefined, limit * 2);
    return allEvents.filter((e) => e.group === group).slice(-limit);
  }
}
