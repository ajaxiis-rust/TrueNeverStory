/**
 * EventSourcingChronicler — extends Chronicler with Event Sourcing capabilities.
 * Wraps existing logEvent calls to also store rich domain events.
 */

import { EventStore, type DomainEvent } from "../lib/event-store";
import type { Chronicler } from "./chronicler";
import { getLogger } from "../utils/logger";

const log = getLogger("event-sourcing-chronicler");

export interface EventSourcingConfig {
  eventsPath: string;
  snapshotsPath: string;
  snapshotInterval?: number;
}

export class EventSourcingChronicler {
  private _chronicler: Chronicler;
  private _eventStore: EventStore;

  constructor(chronicler: Chronicler, config: EventSourcingConfig) {
    this._chronicler = chronicler;
    this._eventStore = new EventStore(config);
  }

  get eventStore(): EventStore {
    return this._eventStore;
  }

  async logEvent(
    description: string,
    storyTime: Date,
    group = "narrative",
    metadata?: {
      aggregateId?: string;
      aggregateType?: string;
      eventType?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<string> {
    const eventId = await this._chronicler.logEvent(description, storyTime, group);

    if (metadata) {
      try {
        await this._eventStore.append({
          aggregateId: metadata.aggregateId ?? "world",
          aggregateType: metadata.aggregateType ?? "narrative",
          eventType: metadata.eventType ?? group,
          payload: {
            description,
            group,
            ...metadata.payload,
          },
          metadata: {
            chroniclerEventId: eventId,
            storyTime: storyTime.toISOString(),
          },
        });
      } catch (err) {
        log.debug({ err }, "Failed to append to event store");
      }
    }

    return eventId;
  }

  async getTimeline(since?: Date, limit = 50): Promise<Array<{ id: string; timestamp: string; group: string; description: string }>> {
    return this._chronicler.getTimeline(since, limit);
  }

  async getEventsByGroup(group: string, limit = 50): Promise<Array<{ id: string; timestamp: string; group: string; description: string }>> {
    return this._chronicler.getEventsByGroup(group, limit);
  }

  async getDomainEvents(aggregateId?: string, since?: Date) {
    return this._eventStore.getEvents(aggregateId, since);
  }

  async getEventsByType(eventType: string, limit = 100) {
    return this._eventStore.getEventsByType(eventType, limit);
  }

  async saveSnapshot(state: Record<string, unknown>) {
    return this._eventStore.saveSnapshot(state);
  }

  async loadLatestSnapshot() {
    return this._eventStore.loadLatestSnapshot();
  }

  async replay(aggregateId: string, handler: (event: DomainEvent) => Promise<void>) {
    return this._eventStore.replay(aggregateId, handler);
  }

  async replayFromSnapshot(
    aggregateId: string,
    handler: (event: DomainEvent) => Promise<void>,
    restoreState: (snapshot: import("../lib/event-store").Snapshot) => void,
  ) {
    return this._eventStore.replayFromSnapshot(aggregateId, handler, restoreState);
  }
}
