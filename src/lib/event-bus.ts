/**
 * TrueNeverStory — Async event bus for decoupled inter-module communication.
 * Replaces world_core/event_bus.py.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("event-bus");

export enum EventTopic {
  ENTITY_ADDED = "entity.added",
  ENTITY_UPDATED = "entity.updated",
  ENTITY_REMOVED = "entity.removed",
  ENTITY_LAYER_COMPLETED = "entity.layer_completed",
  RELATIONSHIP_ADDED = "relationship.added",
  RELATIONSHIP_REPAIRED = "relationship.repaired",
  RELATIONSHIP_BROKEN = "relationship.broken",
  WORLD_CREATED = "world.created",
  WORLD_FRAME_LOADED = "world.frame_loaded",
  WORLD_EVOLVED = "world.evolved",
  STORY_EVENT = "narrative.event",
  STORY_BEAT = "narrative.beat",
  VILLAIN_PROGRESS = "narrative.villain_progress",
  QUEST_ADDED = "narrative.quest_added",
  QUEST_UPDATED = "narrative.quest_updated",
  MEMORY_ADDED = "memory.added",
  MEMORY_CONSOLIDATED = "memory.consolidated",
  MEMORY_FORGOTTEN = "memory.forgotten",
  MAINTENANCE_START = "system.maintenance_start",
  MAINTENANCE_DONE = "system.maintenance_done",
  GRAPH_CHANGED = "system.graph_changed",
  ERROR = "system.error",
  HEARTBEAT_INTENT_PARSED = "heartbeat.intent_parsed",
  HEARTBEAT_SIMULATION_STARTED = "heartbeat.simulation_started",
  HEARTBEAT_SIMULATION_COMPLETE = "heartbeat.simulation_complete",
  HEARTBEAT_STATE_MUTATED = "heartbeat.state_mutated",
  HEARTBEAT_PROSE_GENERATING = "heartbeat.prose_generating",
  HEARTBEAT_PROSE_COMPLETE = "heartbeat.prose_complete",
}

export interface Event {
  id: string;
  topic: EventTopic;
  payload: Record<string, unknown>;
  timestamp: Date;
  source: string;
}

export type EventHandler = (event: Event) => Promise<void>;

function uuid(): string {
  return crypto.randomUUID();
}

export class EventBus {
  private _handlers: Map<EventTopic, Array<{ priority: number; handler: EventHandler }>> = new Map();
  private _replayBuffer: Event[] = [];
  private _replayBufferSize: number;

  constructor(replayBufferSize = 100) {
    this._replayBufferSize = replayBufferSize;
  }

  subscribe(topic: EventTopic, handler: EventHandler, priority = 0): void {
    const list = this._handlers.get(topic) ?? [];
    list.push({ priority, handler });
    list.sort((a, b) => b.priority - a.priority);
    this._handlers.set(topic, list);
  }

  subscribeMany(topics: EventTopic[], handler: EventHandler, priority = 0): void {
    for (const topic of topics) {
      this.subscribe(topic, handler, priority);
    }
  }

  unsubscribe(topic: EventTopic, handler: EventHandler): void {
    const list = this._handlers.get(topic);
    if (list) {
      const filtered = list.filter((entry) => entry.handler !== handler);
      this._handlers.set(topic, filtered);
    }
  }

  async publish(event: Event): Promise<void> {
    this._replayBuffer.push(event);
    if (this._replayBuffer.length > this._replayBufferSize) {
      this._replayBuffer.shift();
    }

    const handlers = this._handlers.get(event.topic) ?? [];
    for (const { handler } of handlers) {
      try {
        await handler(event);
      } catch (err) {
        log.error({ err, topic: event.topic }, "Event handler error");
      }
    }
  }

  async publishSimple(
    topic: EventTopic,
    payload: Record<string, unknown> = {},
    source = "",
  ): Promise<void> {
    await this.publish({
      id: uuid(),
      topic,
      payload,
      timestamp: new Date(),
      source,
    });
  }

  getReplay(topic?: EventTopic, limit = 50): Event[] {
    const events = topic
      ? this._replayBuffer.filter((e) => e.topic === topic)
      : [...this._replayBuffer];
    return events.slice(-limit);
  }

  waitFor(topic: EventTopic, timeoutMs = 30000): Promise<Event | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.unsubscribe(topic, handler);
          resolve(null);
        }
      }, timeoutMs);

      const handler: EventHandler = async (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.unsubscribe(topic, handler);
          resolve(event);
        }
      };

      this.subscribe(topic, handler);
    });
  }
}

// ── Global singleton ──────────────────────────────────────────────

let _globalBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_globalBus) {
    _globalBus = new EventBus();
  }
  return _globalBus;
}
