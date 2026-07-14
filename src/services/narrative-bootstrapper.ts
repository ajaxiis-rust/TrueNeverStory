/**
 * Narrative Bootstrapper — composition root for all narrative services.
 * Creates and wires all dependencies without exposing internal wiring.
 */

import { UnifiedEntityStore } from "../store/entity-store";
import { EventBus } from "../lib/event-bus";
import { HistoryManager } from "../lib/history-manager";
import { LLMClient } from "../lib/llm-client";
import { LLMQueue } from "../lib/llm-queue";
import { ProviderRateLimiter } from "../lib/provider-rate-limiter";
import { Chronicler } from "./chronicler";
import { EventSourcingChronicler } from "./event-sourcing-chronicler";
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
import { WorldEvolver } from "./world-evolver";
import { NPCGenerator } from "./npc-generator";
import { GraphValidator } from "../intelligence/graph-validator";
import { SQLiteStore } from "../lib/sqlite-store";
import { EconomicService } from "./economic-service";
import { EconomicDB } from "../mcp/literary-compiler/economic-schema";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadRateLimitConfig(): { rpm: number; maxConcurrent: number; maxQueueSize: number } {
  const defaults = { rpm: 45, maxConcurrent: 3, maxQueueSize: 50 };
  try {
    const path = join(process.cwd(), "conf", "providers.json");
    if (!existsSync(path)) return defaults;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return { ...defaults, ...data.rateLimit };
  } catch { return defaults; }
}

export interface BootstrapperResult {
  entityStore: UnifiedEntityStore;
  graphStore: GraphStore;
  eventBus: EventBus;
  historyMgr: HistoryManager;
  llm: LLMClient;
  llmQueue: LLMQueue;
  providerRateLimiter: ProviderRateLimiter;
  sqliteStore: SQLiteStore;
  chronicler: Chronicler;
  eventSourcingChronicler: EventSourcingChronicler;
  validator: WorldValidator;
  questMgr: QuestManager;
  clock: WorldClock;
  probEngine: ProbabilityEngine;
  probResolver: ProbabilityContextResolver;
  storyPlanner: StoryPlanner;
  villainManager: VillainManager;
  socialSim: SocialSimulator;
  npcRuntime: NPCRuntime;
  storyEngine: StoryEngine;
  director: DirectorLoop;
  worldBuilder: WorldBuilder;
  agentCoordinator: AgentCoordinator;
  storyArcManager: StoryArcManager;
  userAgent: UserAgent;
  worldEvolver: WorldEvolver;
  npcGenerator: NPCGenerator;
  graphValidator: GraphValidator;
  economicService: EconomicService;
}

export function bootstrapNarrativeServices(
  dbPath: string,
  worldFrame: Record<string, unknown>,
): BootstrapperResult {
  const entityStore = new UnifiedEntityStore(join(dbPath, "entities.json"));
  const graphStore = new GraphStore(entityStore, dbPath);
  const eventBus = new EventBus();
  const historyMgr = new HistoryManager(dbPath);
  const llm = new LLMClient();

  const rateCfg = loadRateLimitConfig();
  const providerRateLimiter = new ProviderRateLimiter();
  const llmQueue = new LLMQueue(llm, {
    maxConcurrent: rateCfg.maxConcurrent,
    maxQueueSize: rateCfg.maxQueueSize,
    rateLimit: { rpm: rateCfg.rpm },
    providerRateLimiter,
  });

  const sqliteStore = new SQLiteStore(dbPath);

  entityStore.onMutation((action, uid) => {
    const node = entityStore.get(uid);
    if (node) {
      sqliteStore.upsertEntity({
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

  const chronicler = new Chronicler(join(dbPath, "timeline.jsonl"));
  const eventSourcingChronicler = new EventSourcingChronicler(chronicler, {
    eventsPath: join(dbPath, "domain_events.jsonl"),
    snapshotsPath: join(dbPath, "snapshot.json"),
    snapshotInterval: 100,
  });
  const validator = new WorldValidator(entityStore, worldFrame);
  const questMgr = new QuestManager(join(dbPath, "quests.json"));
  const clock = new WorldClock(join(dbPath, "world_clock.json"));
  const probEngine = new ProbabilityEngine(0.5);
  const probResolver = new ProbabilityContextResolver(entityStore, null);
  probEngine.setContextResolver(probResolver);
  probEngine.setWorldClock(clock);

  const villainManager = new VillainManager(
    join(dbPath, "villains.json"),
    chronicler,
    llmQueue,
    entityStore,
    "villain",
  );

  const socialSim = new SocialSimulator(entityStore, chronicler, dbPath);

  const npcRuntime = new NPCRuntime(dbPath, entityStore, llmQueue, chronicler);

  const economicService = new EconomicService(new EconomicDB(join(dbPath, "economic.db")));

  const storyPlanner = new StoryPlanner({
    statePath: join(dbPath, "story_planner.json"),
    llmQueue,
    npcRuntime,
    chronicler,
    worldName: (worldFrame.name as string) ?? "Unknown World",
    worldRules: ((worldFrame.rules as Array<{ name: string }>) ?? []).map(r => r.name),
    agentId: "story-planner",
  });

  const storyEngine = new StoryEngine({
    llmQueue,
    entityStore,
    graphStore,
    chronicler,
    validator,
    questMgr,
    socialSim,
    clock,
    npcRuntime,
    eventBus,
    worldName: (worldFrame.title as string) ?? (worldFrame.world_name as string) ?? "World",
    worldRules: ((worldFrame.world_rules as Array<Record<string, unknown>>) ?? []).map((r) => ({
      name: r.name as string,
      description: r.description as string,
    })),
    agentId: "director",
  });

  const director = new DirectorLoop({
    storyEngine,
    chronicler,
    clock,
    npcRuntime,
    villainManager,
    storyPlanner,
    eventBus,
    economicService,
    statePath: dbPath,
    config: {
      factionNames: ((worldFrame.factions as Array<Record<string, unknown>>) ?? [])
        .map(f => f.name as string)
        .filter(Boolean),
    },
  });

  const worldBuilder = new WorldBuilder({
    llmQueue,
    entityStore,
    eventBus,
    dbPath,
    agentId: "director",
  });

  const agentCoordinator = new AgentCoordinator(5);

  const storyArcManager = new StoryArcManager(dbPath);

  const userAgent = new UserAgent(entityStore, llmQueue, npcRuntime, chronicler, validator, "npc");

  const npcGenerator = new NPCGenerator({
    llmQueue,
    entityStore,
    eventBus,
    worldFrame,
    agentId: "npc",
  });

  const worldEvolver = new WorldEvolver({
    worldBuilder,
    npcGenerator,
    chronicler,
  });

  const graphValidator = new GraphValidator({
    graphStore,
    entityStore,
    autoHeal: true,
  });

  return {
    entityStore,
    graphStore,
    eventBus,
    historyMgr,
    llm,
    llmQueue,
    providerRateLimiter,
    sqliteStore,
    chronicler,
    eventSourcingChronicler,
    validator,
    questMgr,
    clock,
    probEngine,
    probResolver,
    storyPlanner,
    villainManager,
    socialSim,
    npcRuntime,
    storyEngine,
    director,
    worldBuilder,
    agentCoordinator,
    storyArcManager,
    userAgent,
    worldEvolver,
    npcGenerator,
    graphValidator,
    economicService,
  };
}
