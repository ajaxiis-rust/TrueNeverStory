/**
 * Narrative Service — backward-compatible wrapper around Bootstrapper + Facade.
 * Delegates to composition root for creation and facade for lifecycle.
 */

import { bootstrapNarrativeServices, type BootstrapperResult } from "./narrative-bootstrapper";
import { NarrativeFacade } from "./narrative-facade";
import { RoleplayEngine } from "./roleplay-engine";
import { BirthScenario } from "./birth";
import { SQLiteStore } from "../lib/sqlite-store";
import { EventSourcingChronicler } from "./event-sourcing-chronicler";
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
  readonly entityStore: BootstrapperResult["entityStore"];
  readonly graphStore: BootstrapperResult["graphStore"];
  readonly eventBus: BootstrapperResult["eventBus"];
  readonly historyMgr: BootstrapperResult["historyMgr"];
  readonly llm: BootstrapperResult["llm"];
  readonly llmQueue: BootstrapperResult["llmQueue"];
  readonly chronicler: BootstrapperResult["chronicler"];
  readonly validator: BootstrapperResult["validator"];
  readonly questMgr: BootstrapperResult["questMgr"];
  readonly clock: BootstrapperResult["clock"];
  readonly probEngine: BootstrapperResult["probEngine"];
  readonly probResolver: BootstrapperResult["probResolver"];
  readonly storyPlanner: BootstrapperResult["storyPlanner"];
  readonly villainManager: BootstrapperResult["villainManager"];
  readonly socialSim: BootstrapperResult["socialSim"];
  readonly npcRuntime: BootstrapperResult["npcRuntime"];
  readonly storyEngine: BootstrapperResult["storyEngine"];
  readonly director: BootstrapperResult["director"];
  readonly worldBuilder: BootstrapperResult["worldBuilder"];
  readonly agentCoordinator: BootstrapperResult["agentCoordinator"];
  readonly storyArcManager: BootstrapperResult["storyArcManager"];
  readonly userAgent: BootstrapperResult["userAgent"];
  readonly worldEvolver: BootstrapperResult["worldEvolver"];
  readonly npcGenerator: BootstrapperResult["npcGenerator"];
  readonly graphValidator: BootstrapperResult["graphValidator"];
  readonly sqliteStore: BootstrapperResult["sqliteStore"];
  readonly eventSourcingChronicler: EventSourcingChronicler;
  readonly providerRateLimiter: BootstrapperResult["providerRateLimiter"];

  private _services: BootstrapperResult;
  private _facade: NarrativeFacade;
  private _booted = false;

  constructor(deps: NarrativeContextDeps) {
    this.dbPath = deps.dbPath;
    this.worldFrame = deps.worldFrame;

    this._services = bootstrapNarrativeServices(deps.dbPath, deps.worldFrame);
    this._facade = new NarrativeFacade({
      dbPath: deps.dbPath,
      worldFrame: deps.worldFrame,
      services: this._services,
    });

    this.entityStore = this._services.entityStore;
    this.graphStore = this._services.graphStore;
    this.eventBus = this._services.eventBus;
    this.historyMgr = this._services.historyMgr;
    this.llm = this._services.llm;
    this.llmQueue = this._services.llmQueue;
    this.chronicler = this._services.chronicler;
    this.validator = this._services.validator;
    this.questMgr = this._services.questMgr;
    this.clock = this._services.clock;
    this.probEngine = this._services.probEngine;
    this.probResolver = this._services.probResolver;
    this.storyPlanner = this._services.storyPlanner;
    this.villainManager = this._services.villainManager;
    this.socialSim = this._services.socialSim;
    this.npcRuntime = this._services.npcRuntime;
    this.storyEngine = this._services.storyEngine;
    this.director = this._services.director;
    this.worldBuilder = this._services.worldBuilder;
    this.agentCoordinator = this._services.agentCoordinator;
    this.storyArcManager = this._services.storyArcManager;
    this.userAgent = this._services.userAgent;
    this.worldEvolver = this._services.worldEvolver;
    this.npcGenerator = this._services.npcGenerator;
    this.graphValidator = this._services.graphValidator;
    this.sqliteStore = this._services.sqliteStore;
    this.eventSourcingChronicler = this._services.eventSourcingChronicler;
    this.providerRateLimiter = this._services.providerRateLimiter;

    this._booted = true;
  }

  async start(): Promise<void> {
    return this._facade.start();
  }

  async stop(): Promise<void> {
    return this._facade.stop();
  }

  pause(): void {
    this._facade.pause();
  }

  resume(): void {
    this._facade.resume();
  }

  async reset(newDbPath: string, newWorldFrame: Record<string, unknown>): Promise<void> {
    if (this._facade.isRunning) {
      await this._facade.stop();
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

    if (this._facade.isRunning) {
      await this._facade.start();
    }

    log.info({ path: newDbPath }, "NarrativeService reset to new world");
  }

  createRoleplayEngine(
    mcpServer?: import('../mcp/server').TNSServer,
    translationService?: import('./translation-service').TranslationService,
  ): RoleplayEngine {
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
      eventBus: this.eventBus,
      mcpServer,
      translationService,
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
    await this._facade.stop();
    log.info("NarrativeService shutdown complete");
  }
}
