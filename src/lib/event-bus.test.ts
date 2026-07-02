import { describe, it, expect } from "bun:test";
import { EventBus, EventTopic, type Event as TnsEvent } from "./event-bus";

describe("EventBus", () => {
  it("publishes to subscribers", async () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.subscribe(EventTopic.ENTITY_ADDED, async (e) => {
      received.push(e.payload.name as string);
    });
    await bus.publishSimple(EventTopic.ENTITY_ADDED, { name: "Aragorn" }, "test");
    expect(received).toEqual(["Aragorn"]);
  });

  it("supports multiple subscribers", async () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe(EventTopic.STORY_EVENT, async () => { count++; });
    bus.subscribe(EventTopic.STORY_EVENT, async () => { count++; });
    bus.subscribe(EventTopic.STORY_EVENT, async () => { count++; });
    await bus.publishSimple(EventTopic.STORY_EVENT);
    expect(count).toBe(3);
  });

  it("subscribers are called in priority order", async () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.subscribe(EventTopic.STORY_EVENT, async () => { order.push(2); }, 2);
    bus.subscribe(EventTopic.STORY_EVENT, async () => { order.push(10); }, 10);
    bus.subscribe(EventTopic.STORY_EVENT, async () => { order.push(5); }, 5);
    await bus.publishSimple(EventTopic.STORY_EVENT);
    expect(order).toEqual([10, 5, 2]);
  });

  it("unsubscribe removes handler", async () => {
    const bus = new EventBus();
    let count = 0;
    const handler = async () => { count++; };
    bus.subscribe(EventTopic.STORY_EVENT, handler);
    await bus.publishSimple(EventTopic.STORY_EVENT);
    expect(count).toBe(1);
    bus.unsubscribe(EventTopic.STORY_EVENT, handler);
    await bus.publishSimple(EventTopic.STORY_EVENT);
    expect(count).toBe(1);
  });

  it("subscribeMany subscribes to multiple topics", async () => {
    const bus = new EventBus();
    const topics: string[] = [];
    const handler = async (e: TnsEvent) => { topics.push(e.topic); };
    bus.subscribeMany([EventTopic.ENTITY_ADDED, EventTopic.ENTITY_REMOVED], handler);
    await bus.publishSimple(EventTopic.ENTITY_ADDED);
    await bus.publishSimple(EventTopic.ENTITY_REMOVED);
    expect(topics).toEqual([EventTopic.ENTITY_ADDED, EventTopic.ENTITY_REMOVED]);
  });

  it("handler errors don't block other handlers", async () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.subscribe(EventTopic.STORY_EVENT, async () => { throw new Error("boom"); });
    bus.subscribe(EventTopic.STORY_EVENT, async () => { results.push("ok"); });
    await bus.publishSimple(EventTopic.STORY_EVENT);
    expect(results).toEqual(["ok"]);
  });

  it("getReplay returns recent events", async () => {
    const bus = new EventBus();
    await bus.publishSimple(EventTopic.ENTITY_ADDED, { n: 1 });
    await bus.publishSimple(EventTopic.ENTITY_ADDED, { n: 2 });
    await bus.publishSimple(EventTopic.ENTITY_REMOVED, { n: 3 });

    const all = bus.getReplay();
    expect(all).toHaveLength(3);

    const filtered = bus.getReplay(EventTopic.ENTITY_ADDED);
    expect(filtered).toHaveLength(2);

    const limited = bus.getReplay(undefined, 2);
    expect(limited).toHaveLength(2);
  });

  it("waitFor resolves on matching event", async () => {
    const bus = new EventBus();
    const promise = bus.waitFor(EventTopic.STORY_EVENT, 1000);
    setTimeout(() => bus.publishSimple(EventTopic.STORY_EVENT, { data: "hello" }), 10);
    const event = await promise;
    expect(event?.payload.data).toBe("hello");
  });

  it("waitFor times out", async () => {
    const bus = new EventBus();
    const event = await bus.waitFor(EventTopic.STORY_EVENT, 50);
    expect(event).toBeNull();
  });

  it("replay buffer has max size", async () => {
    const bus = new EventBus(3);
    await bus.publishSimple(EventTopic.STORY_EVENT, { n: 1 });
    await bus.publishSimple(EventTopic.STORY_EVENT, { n: 2 });
    await bus.publishSimple(EventTopic.STORY_EVENT, { n: 3 });
    await bus.publishSimple(EventTopic.STORY_EVENT, { n: 4 });
    const all = bus.getReplay();
    expect(all).toHaveLength(3);
    expect(all[0]!.payload.n).toBe(2); // first was shifted out
  });
});
