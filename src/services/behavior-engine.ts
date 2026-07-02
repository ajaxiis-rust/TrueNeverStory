import type { NPCRuntime } from "./npc-runtime";
import type { NPCProfile } from "../models/npc-state";
import { MemoryEngine } from "./memory-engine";

export interface NPCAction {
  type: "move" | "interact" | "search" | "rest" | "trade" | "explore";
  target?: string;
  location?: string;
  description: string;
  timestamp: string;
  priority: number;
}

export interface DailyRoutine {
  hour: number;
  action: NPCAction;
}

export class BehaviorEngine {
  private _runtime: NPCRuntime;
  private _memoryEngine: MemoryEngine;

  constructor(runtime: NPCRuntime) {
    this._runtime = runtime;
    this._memoryEngine = new MemoryEngine(runtime);
  }

  async evaluateActions(name: string): Promise<NPCAction[]> {
    const profile = this._runtime.get(name);
    if (!profile) return [];

    const actions: NPCAction[] = [];

    for (const goal of profile.goals) {
      const action = this._goalToAction(profile, goal);
      if (action) actions.push(action);
    }

    if (profile.health < 50) {
      actions.push({
        type: "rest",
        description: "Need to recover health",
        timestamp: new Date().toISOString(),
        priority: 0.8,
      });
    }

    return actions.sort((a, b) => b.priority - a.priority);
  }

  private _goalToAction(_profile: NPCProfile, goal: string): NPCAction | null {
    const goalLower = goal.toLowerCase();

    if (goalLower.includes("find") || goalLower.includes("search")) {
      return {
        type: "search",
        description: `Searching for: ${goal}`,
        timestamp: new Date().toISOString(),
        priority: 0.6,
      };
    }

    if (goalLower.includes("explore") || goalLower.includes("visit")) {
      return {
        type: "explore",
        description: `Exploring to: ${goal}`,
        timestamp: new Date().toISOString(),
        priority: 0.5,
      };
    }

    return null;
  }

  async processContext(name: string): Promise<void> {
    const profile = this._runtime.get(name);
    if (!profile) return;

    const recentMemories = await this._memoryEngine.search(name, "");
    const context = recentMemories.map(m => m.description).join(" ");

    if (context.includes("treasure") && !profile.goals.some(g => g.toLowerCase().includes("treasure"))) {
      await this._runtime.addGoal(name, "Find the treasure");
    }

    if (context.includes("danger") && !profile.goals.some(g => g.toLowerCase().includes("safety"))) {
      await this._runtime.addGoal(name, "Seek safety");
    }
  }

  async simulateDay(name: string): Promise<NPCAction[]> {
    const actions: NPCAction[] = [];
    const profile = this._runtime.get(name);
    if (!profile) return actions;

    const routines: DailyRoutine[] = [
      { hour: 6, action: { type: "rest", description: "Wake up", timestamp: "", priority: 0.3 } },
      { hour: 8, action: { type: "trade", description: "Morning trading", timestamp: "", priority: 0.4 } },
      { hour: 12, action: { type: "rest", description: "Midday break", timestamp: "", priority: 0.2 } },
      { hour: 14, action: { type: "explore", description: "Afternoon exploration", timestamp: "", priority: 0.5 } },
      { hour: 18, action: { type: "rest", description: "Evening rest", timestamp: "", priority: 0.3 } },
    ];

    for (const routine of routines) {
      const timestamp = new Date();
      timestamp.setHours(routine.hour, 0, 0, 0);
      actions.push({
        ...routine.action,
        timestamp: timestamp.toISOString(),
      });
    }

    return actions;
  }

  async adaptMood(name: string): Promise<void> {
    const profile = this._runtime.get(name);
    if (!profile) return;

    const recentMemories = await this._memoryEngine.searchByEmotion(name, "joy");
    const fearMemories = await this._memoryEngine.searchByEmotion(name, "fear");

    if (recentMemories.length > fearMemories.length) {
      await this._runtime.setMood(name, "happy");
    } else if (fearMemories.length > recentMemories.length) {
      await this._runtime.setMood(name, "anxious");
    } else {
      await this._runtime.setMood(name, "content");
    }
  }

  async makeDecision(name: string, situation: string): Promise<string> {
    const profile = this._runtime.get(name);
    if (!profile) return "observe";

    const memories = await this._memoryEngine.search(name, situation);

    if (memories.some(m => m.emotion === "fear")) {
      return "avoid";
    }

    if (memories.some(m => m.emotion === "joy")) {
      return "approach";
    }

    return "observe";
  }
}
