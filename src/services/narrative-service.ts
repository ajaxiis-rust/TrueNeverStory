/**
 * Narrative Service — dependency injection container for all narrative services.
 * Replaces world_narrative/context.ts.
 */

import { UnifiedEntityStore } from "../store/entity-store";
import { EventBus } from "../lib/event-bus";
import { HistoryManager } from "../lib/history-manager";
import { LLMClient } from "../lib/llm-client";
import { LLMQueue } from "../lib/llm-queue";
import { RoleplayEngine } from "./roleplay-engine";
import { Chronicler } from "./chronicler";
import { WorldValidator } from "./world-validator";
import { QuestManager } from "./quest-manager";
import { WorldClock } from "./world-clock";
import { ProbabilityEngine } from "./probability-engine";
import { ProbabilityContextResolver } from "./probability-resolver";
import { StoryPlanner } from "./story-planner";
import { VillainManager } from "./villain-manager";
import { SocialSimulator } from "./social-simulator";
import { GraphStore } from "./graph-store";
import { NPCRuntime } from "./npc-runtime";
import { StoryEngine } from "./story-engine";
import { DirectorLoop } from "./director-loop";
import { WorldBuilder } from "./world-builder";
import { AgentCoordinator } from "./agent-coordinator";
import { StoryArcManager } from "./story-arc-manager";
import { UserAgent } from "./user-agent";
import { BirthScenario } from "./birth";
import { WorldEvolver } from "./world-evolver";
import { NPCGenerator } from "./npc-generator";
import { GraphValidator } from "../intelligence/graph-validator";
import { SQLiteStore } from "../lib/sqlite-store";
import { getLogger } from "../utils/logger";
import { join } from "node:path";

const log = getLogger("narrative-service");

export interface NarrativeContextDeps {
  dbPath: string;
  worldFrame: Record<string, unknown>;
}

export class NarrativeService {
  readonly dbPath: string;
  readonly worldFrame: Record<string, unknown>;
  readonly entityStore: UnifiedEntityStore;
  readonly graphStore: GraphStore;
  readonly eventBus: EventBus;
  readonly historyMgr: HistoryManager;
  readonly llm: LLMClient;
  readonly llmQueue: LLMQueue;
  readonly chronicler: Chronicler;
  readonly validator: WorldValidator;
  readonly questMgr: QuestManager;
  readonly clock: WorldClock;
  readonly probEngine: ProbabilityEngine;
  readonly probResolver: ProbabilityContextResolver;
  readonly storyPlanner: StoryPlanner;
  readonly villainManager: VillainManager;
  readonly socialSim: SocialSimulator;
  readonly npcRuntime: NPCRuntime;
  readonly storyEngine: StoryEngine;
  readonly director: DirectorLoop;
  readonly worldBuilder: WorldBuilder;
  readonly agentCoordinator: AgentCoordinator;
  readonly storyArcManager: StoryArcManager;
  readonly userAgent: UserAgent;
  readonly worldEvolver: WorldEvolver;
  readonly npcGenerator: NPCGenerator;
  readonly graphValidator: GraphValidator;
  readonly sqliteStore: SQLiteStore;

  private _booted = false;
  private _servicesStarted = false;

  constructor(deps: NarrativeContextDeps) {
    this.dbPath = deps.dbPath;
    this.worldFrame = deps.worldFrame;

    this.entityStore = new UnifiedEntityStore(join(deps.dbPath, "entities.json"));
    this.graphStore = new GraphStore(this.entityStore, deps.dbPath);
    this.eventBus = new EventBus();
    this.historyMgr = new HistoryManager(deps.dbPath);
    this.llm = new LLMClient();
    this.llmQueue = new LLMQueue(this.llm, 3);

    // SQLite for hybrid search
    this.sqliteStore = new SQLiteStore(deps.dbPath);

    // Sync entities → SQLite on mutation
    this.entityStore.onMutation((action, uid) => {
      const node = this.entityStore.get(uid);
      if (node) {
        this.sqliteStore.upsertEntity({
          uid: node.uid,
          name: node.name,
          entityType: node.entityType,
          summary: node.profile.summary,
          tags: JSON.stringify(node.profile.tags),
          description: (node.profile.l1.description as string) || "",
          profile: JSON.stringify(node.profile.toDict()),
        });
      }
    });

    this.chronicler = new Chronicler(join(deps.dbPath, "timeline.jsonl"));
    this.validator = new WorldValidator(this.entityStore, deps.worldFrame);
    this.questMgr = new QuestManager(join(deps.dbPath, "quests.json"));
    this.clock = new WorldClock(join(deps.dbPath, "world_clock.json"));
    this.probEngine = new ProbabilityEngine(0.5);
    this.probResolver = new ProbabilityContextResolver(this.entityStore, null);
    this.probEngine.setContextResolver(this.probResolver);
    this.probEngine.setWorldClock(this.clock);
    this.villainManager = new VillainManager(
      join(deps.dbPath, "villains.json"),
      this.chronicler,
      this.llmQueue,
      this.entityStore,
    );
    this.socialSim = new SocialSimulator(this.entityStore, this.chronicler, deps.dbPath);

    // NEW: NPC Runtime (OptimizedMemoryStore)
    this.npcRuntime = new NPCRuntime(
      deps.dbPath,
      this.entityStore,
      this.llmQueue,
      this.chronicler,
    );

    this.storyPlanner = new StoryPlanner({
      statePath: join(deps.dbPath, "story_planner.json"),
      llmQueue: this.llmQueue,
      npcRuntime: this.npcRuntime,
      chronicler: this.chronicler,
      worldName: (deps.worldFrame.name as string) ?? "Unknown World",
      worldRules: ((deps.worldFrame.rules as Array<{ name: string }>) ?? []).map(r => r.name),
    });

    // NEW: Story Engine
    this.storyEngine = new StoryEngine({
      llmQueue: this.llmQueue,
      entityStore: this.entityStore,
      graphStore: this.graphStore,
      chronicler: this.chronicler,
      validator: this.validator,
      questMgr: this.questMgr,
      socialSim: this.socialSim,
      clock: this.clock,
      npcRuntime: this.npcRuntime,
      eventBus: this.eventBus,
      worldName: (deps.worldFrame.title as string) ?? (deps.worldFrame.world_name as string) ?? "World",
      worldRules: ((deps.worldFrame.world_rules as Array<Record<string, unknown>>) ?? []).map((r) => ({
        name: r.name as string,
        description: r.description as string,
      })),
    });

    // NEW: Director Background Loop
    this.director = new DirectorLoop({
      storyEngine: this.storyEngine,
      chronicler: this.chronicler,
      clock: this.clock,
      npcRuntime: this.npcRuntime,
      villainManager: this.villainManager,
      storyPlanner: this.storyPlanner,
      eventBus: this.eventBus,
      statePath: deps.dbPath,
    });

    // NEW: World Builder
    this.worldBuilder = new WorldBuilder({
      llmQueue: this.llmQueue,
      entityStore: this.entityStore,
      eventBus: this.eventBus,
      dbPath: deps.dbPath,
    });

    // NEW: Agent Coordinator (priority task queue for director)
    this.agentCoordinator = new AgentCoordinator(5);

    // NEW: Story Arc Manager
    this.storyArcManager = new StoryArcManager(deps.dbPath);

    // NEW: User Agent (party + combat)
    this.userAgent = new UserAgent(
      this.entityStore,
      this.llmQueue,
      this.npcRuntime,
      this.chronicler,
      this.validator,
    );

    // NEW: NPC Generator (intelligent NPC creation)
    this.npcGenerator = new NPCGenerator({
      llmQueue: this.llmQueue,
      entityStore: this.entityStore,
      eventBus: this.eventBus,
      worldFrame: deps.worldFrame,
    });

    // NEW: World Evolver (auto-add NPCs/locations/items)
    this.worldEvolver = new WorldEvolver({
      worldBuilder: this.worldBuilder,
      npcGenerator: this.npcGenerator,
      chronicler: this.chronicler,
    });

    // NEW: Graph Validator (self-healing)
    this.graphValidator = new GraphValidator({
      graphStore: this.graphStore,
      entityStore: this.entityStore,
      autoHeal: true,
    });

    this._booted = true;
  }

  async start(): Promise<void> {
    if (this._servicesStarted) return;
    await this.llmQueue.start();
    await this.graphStore.boot();

    // Sync all existing entities to SQLite
    for (const node of this.entityStore.allNodes()) {
      this.sqliteStore.upsertEntity({
        uid: node.uid,
        name: node.name,
        entityType: node.entityType,
        summary: node.profile.summary,
        tags: JSON.stringify(node.profile.tags),
        description: (node.profile.l1.description as string) || "",
        profile: JSON.stringify(node.profile.toDict()),
      });
    }
    log.info({ count: this.sqliteStore.entityCount() }, "Synced entities to SQLite");

    this.director.start();
    this._servicesStarted = true;
    log.info("Narrative services started");
  }

  async stop(): Promise<void> {
    if (!this._servicesStarted) return;
    this.director.stop();
    await this.llmQueue.stop();
    this._servicesStarted = false;
    log.info("Narrative services stopped");
  }

  pause(): void {
    this.director.pause();
    log.info("Narrative services paused");
  }

  resume(): void {
    this.director.resume();
    log.info("Narrative services resumed");
  }

  async reset(newDbPath: string, newWorldFrame: Record<string, unknown>): Promise<void> {
    if (this._servicesStarted) {
      this.director.stop();
      await this.llmQueue.stop();
    }

    this.sqliteStore.close();

    (this as { dbPath: string }).dbPath = newDbPath;
    (this as { worldFrame: Record<string, unknown> }).worldFrame = newWorldFrame;

    this.entityStore.reload(join(newDbPath, "entities.json"));
    await this.graphStore.boot();

    (this as { sqliteStore: SQLiteStore }).sqliteStore = new SQLiteStore(newDbPath);

    for (const node of this.entityStore.allNodes()) {
      this.sqliteStore.upsertEntity({
        uid: node.uid,
        name: node.name,
        entityType: node.entityType,
        summary: node.profile.summary,
        tags: JSON.stringify(node.profile.tags),
        description: (node.profile.l1.description as string) || "",
        profile: JSON.stringify(node.profile.toDict()),
      });
    }

    if (this._servicesStarted) {
      await this.llmQueue.start();
      this.director.start();
    }

    log.info({ path: newDbPath }, "NarrativeService reset to new world");
  }

  createRoleplayEngine(): RoleplayEngine {
    return new RoleplayEngine({
      dbPath: this.dbPath,
      entityStore: this.entityStore,
      llmQueue: this.llmQueue,
      historyMgr: this.historyMgr,
      worldFrame: this.worldFrame,
      npcRuntime: this.npcRuntime,
      chronicler: this.chronicler,
      validator: this.validator,
      userAgent: this.userAgent,
      sqliteStore: this.sqliteStore,
    });
  }

  createBirthScenario(): BirthScenario {
    return new BirthScenario({
      entityStore: this.entityStore,
      graphStore: this.graphStore,
      llmQueue: this.llmQueue,
      npcRuntime: this.npcRuntime,
      chronicler: this.chronicler,
      clock: this.clock,
      worldFrame: this.worldFrame,
    });
  }

  async shutdown(): Promise<void> {
    await this.stop();
    log.info("NarrativeService shutdown complete");
  }
}
