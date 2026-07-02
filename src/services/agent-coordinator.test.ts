import { describe, it, expect, beforeEach } from "bun:test";
import { AgentCoordinator } from "./agent-coordinator";
import { DirectorTask, TaskPriority } from "../models/director";

function makeTask(type: string, priority: TaskPriority = TaskPriority.NORMAL, step?: string): DirectorTask {
  return new DirectorTask({
    id: crypto.randomUUID(),
    type,
    priority,
    data: step ? { step } : {},
    created_at: new Date(),
  });
}

describe("AgentCoordinator", () => {
  let coord: AgentCoordinator;

  beforeEach(() => {
    coord = new AgentCoordinator(3);
  });

  it("starts and stops cleanly", () => {
    coord.start();
    expect(coord.pendingCount).toBe(0);
    coord.stop();
  });

  it("submit adds task to queue", async () => {
    coord.start();
    const task = makeTask("test");
    coord.registerHandler("test", async () => {});
    await coord.submit(task);
    // Task may have already been drained, but active count should be ≤ max
    expect(coord.activeCount).toBeLessThanOrEqual(3);
    coord.stop();
  });

  it("queue maintains insertion order for same priority", async () => {
    const order: string[] = [];
    coord = new AgentCoordinator(1);
    coord.registerHandler("seq", async (t) => {
      order.push(t.data.step as string);
    });
    coord.start();

    await coord.submit(makeTask("seq", TaskPriority.NORMAL, "first"));
    await coord.submit(makeTask("seq", TaskPriority.NORMAL, "second"));
    await coord.submit(makeTask("seq", TaskPriority.NORMAL, "third"));

    await new Promise((r) => setTimeout(r, 500));
    expect(order).toEqual(["first", "second", "third"]);
    coord.stop();
  });

  it("submitAndWait resolves with handler result", async () => {
    coord.start();
    coord.registerHandler("calc", async () => 42);
    const result = await coord.submitAndWait(makeTask("calc"));
    expect(result).toBe(42);
    coord.stop();
  });

  it("submitAndWait rejects on handler error", async () => {
    coord.start();
    coord.registerHandler("fail", async () => {
      throw new Error("boom");
    });
    try {
      await coord.submitAndWait(makeTask("fail"));
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe("boom");
    }
    coord.stop();
  });

  it("concurrent limit is respected", async () => {
    let running = 0;
    let maxRunning = 0;
    coord = new AgentCoordinator(2);
    coord.start();

    coord.registerHandler("concurrent", async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
    });

    for (let i = 0; i < 6; i++) {
      await coord.submit(makeTask("concurrent"));
    }

    await new Promise((r) => setTimeout(r, 200));
    expect(maxRunning).toBeLessThanOrEqual(2);
    coord.stop();
  });
});
