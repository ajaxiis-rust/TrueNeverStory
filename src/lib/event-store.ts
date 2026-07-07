/**
 * EventStore — event sourcing layer on top of Chronicler.
 * Adds rich metadata, replay capability, and snapshot support.
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("event-store");

export interface DomainEvent {
  id: string;
  timestamp: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Snapshot {
  id: string;
  timestamp: string;
  version: number;
  state: Record<string, unknown>;
}

export interface EventStoreConfig {
  eventsPath: string;
  snapshotsPath: string;
  snapshotInterval?: number;
}

export class EventStore {
  private _eventsPath: string;
  private _snapshotsPath: string;
  private _snapshotInterval: number;
  private _eventCount = 0;

  constructor(config: EventStoreConfig) {
    this._eventsPath = config.eventsPath;
    this._snapshotsPath = config.snapshotsPath;
    this._snapshotInterval = config.snapshotInterval ?? 100;

    const dir = dirname(config.eventsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async append(event: Omit<DomainEvent, "id" | "timestamp">): Promise<DomainEvent> {
    const fullEvent: DomainEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    try {
      appendFileSync(this._eventsPath, JSON.stringify(fullEvent) + "\n", "utf-8");
      this._eventCount++;

      if (this._eventCount % this._snapshotInterval === 0) {
        log.info({ count: this._eventCount }, "Snapshot interval reached");
      }
    } catch (err) {
      log.error({ err }, "Failed to append event");
      throw err;
    }

    return fullEvent;
  }

  async getEvents(aggregateId?: string, since?: Date): Promise<DomainEvent[]> {
    if (!existsSync(this._eventsPath)) return [];

    const events: DomainEvent[] = [];
    try {
      const content = readFileSync(this._eventsPath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as DomainEvent;
          if (aggregateId && event.aggregateId !== aggregateId) continue;
          if (since && new Date(event.timestamp) < since) continue;
          events.push(event);
        } catch {
          continue;
        }
      }
    } catch (err) {
      log.error({ err }, "Failed to read events");
      return [];
    }

    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async getEventsByType(eventType: string, limit = 100): Promise<DomainEvent[]> {
    const allEvents = await this.getEvents();
    return allEvents.filter((e) => e.eventType === eventType).slice(-limit);
  }

  async getEventsByAggregate(aggregateType: string, limit = 100): Promise<DomainEvent[]> {
    const allEvents = await this.getEvents();
    return allEvents.filter((e) => e.aggregateType === aggregateType).slice(-limit);
  }

  async saveSnapshot(state: Record<string, unknown>): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      version: this._eventCount,
      state,
    };

    try {
      if (!existsSync(dirname(this._snapshotsPath))) {
        mkdirSync(dirname(this._snapshotsPath), { recursive: true });
      }
      writeFileSync(this._snapshotsPath, JSON.stringify(snapshot, null, 2), "utf-8");
      log.info({ snapshotId: snapshot.id, version: snapshot.version }, "Snapshot saved");
    } catch (err) {
      log.error({ err }, "Failed to save snapshot");
      throw err;
    }

    return snapshot;
  }

  async loadLatestSnapshot(): Promise<Snapshot | null> {
    if (!existsSync(this._snapshotsPath)) return null;

    try {
      const content = readFileSync(this._snapshotsPath, "utf-8");
      return JSON.parse(content) as Snapshot;
    } catch (err) {
      log.error({ err }, "Failed to load snapshot");
      return null;
    }
  }

  async replay(aggregateId: string, handler: (event: DomainEvent) => Promise<void>): Promise<void> {
    const events = await this.getEvents(aggregateId);
    for (const event of events) {
      await handler(event);
    }
  }

  async replayFromSnapshot(
    aggregateId: string,
    handler: (event: DomainEvent) => Promise<void>,
    restoreState: (snapshot: Snapshot) => void,
  ): Promise<void> {
    const snapshot = await this.loadLatestSnapshot();
    if (snapshot) {
      restoreState(snapshot);
      const events = await this.getEvents(aggregateId, new Date(snapshot.timestamp));
      for (const event of events) {
        await handler(event);
      }
    } else {
      await this.replay(aggregateId, handler);
    }
  }

  get eventCount(): number {
    return this._eventCount;
  }

  async count(): Promise<number> {
    if (!existsSync(this._eventsPath)) return 0;
    const content = readFileSync(this._eventsPath, "utf-8");
    return content.split("\n").filter((l) => l.trim()).length;
  }
}
