/**
 * RoleplayEngine — State-First pipeline for roleplay processing.
 * v0.25.0: Intent → Simulation → State → Context → Prose
 */

import type { UnifiedEntityStore } from '../store/entity-store';
import type { LLMQueue } from '../lib/llm-queue';
import type { HistoryManager } from '../lib/history-manager';
import { MemoryManager } from './memory-manager';
import { CrafterAgent } from './crafter-agent';
import { ResearcherAgent } from './researcher-agent';
import { DialogueManager } from './dialogue-manager';
import { DialogueContext } from './dialogue-context';
import { SocialGraph } from './social-graph';
import { MemoryEngine } from './memory-engine';
import { StartResolver } from './start-resolver';
import { Chronicler } from './chronicler';
import { IntentParser } from './intent-parser';
import { SimulationEngine } from './simulation-engine';
import { StateMutator } from './state-mutator';
import { ContextBuilder, GameContext, EngineState } from './context-builder';
import { EventBus, EventTopic } from '../lib/event-bus';
import type { NPCRuntime } from './npc-runtime';
import type { WorldValidator } from './world-validator';
import type { UserAgent } from './user-agent';
import type { SQLiteStore } from '../lib/sqlite-store';
import type { Intent } from '../models/intent';
import { isCommandIntent } from '../models/intent';
import { getLogger } from '../utils/logger';
import { join } from 'node:path';
import { t } from '../i18n';
import { SessionState } from './roleplay/session-state';
import { CommandHandler } from './roleplay/handlers/command-handler';
import { PipelineRunner } from './roleplay/pipeline-runner';
import type { PipelineContext } from './roleplay/pipeline-context';
import { LiteraryV2Generator } from './roleplay/prose/literary-v2-generator';

// v0.25.0 New agents
import { DramaturgAgent } from './agents/dramaturg';
import { ValidatorAgent } from './agents/validator';
import { StylistAgent } from './agents/stylist';
import { ActorAgent } from './agents/actor';
import { CensorAgent } from './agents/censor';
import { ChroniclerAgent } from './agents/chronicler-agent';
import { AgentRegistryV2, getAgentRegistryV2 } from './agent-registry-v2';
import type { TNSServer } from '../mcp/server';
import { TranslationService, type LanguageCode } from './translation-service';
import { LiteraryCompilerDB } from '../mcp/literary-compiler/schema';
import { MetricsCollector, deriveMetrics, inferFromMetrics } from './metrics-collector';
import { blendBehavioralSignals, createDefaultProfile, deriveType, computeDistribution, buildPlayerVoice, type JungianProfile, type WorldState, type SceneContext } from './jungian-profiler';
import { PlayerProfileStore } from '../lib/player-profile-store';
import { loadAuthorCorpus } from './author-matcher';
import { getFeatureFlagManager } from '../lib/feature-flags';
import { logLiterarySignals, computeLiteraryToneHint } from './literary-modulation';
import { shouldExpand, analyzeCharge, detectRefusal, expand, RefusalTracker } from './short-turn-expander';
import { DeferredHookStore } from './deferred-hook-store';
import { readJsonFileSync, atomicWriteJson } from '../lib/atomic-io';

const log = getLogger('roleplay-engine');

// ─── Agent Mention Pattern (kept for backward compat during migration) ──────

const AGENT_MENTION = /^@([^\s]+)\s+(.+)$/s;

// ─── Service Message Agent Interface ─────────────────────────────────────────

export interface ServiceMessageContext {
  message: string;
  location: string;
  character: string;
  storyTime: string;
  recentEvents: string[];
  worldRules: string[];
  nearbyNpcs: string[];
  conversation: Array<{ user: string; assistant: string }>;
}

export interface ServiceMessageAgent {
  name: string;
  generateServiceMessage(ctx: ServiceMessageContext): Promise<string>;
}

// ─── Engine Dependencies ─────────────────────────────────────────────────────

export interface EngineAgents {
  crafter: CrafterAgent;
  researcher: ResearcherAgent;
  dramaturg: DramaturgAgent;
  validator: ValidatorAgent;
  stylist: StylistAgent;
  actor: ActorAgent;
  censor: CensorAgent;
  chroniclerAgent: ChroniclerAgent;
}

interface EngineDeps {
  dbPath: string;
  entityStore: UnifiedEntityStore;
  llmQueue: LLMQueue;
  historyMgr: HistoryManager;
  worldFrame: Record<string, unknown>;
  npcRuntime?: NPCRuntime;
  chronicler?: Chronicler;
  validator?: WorldValidator;
  userAgent?: UserAgent;
  sqliteStore?: SQLiteStore;
  eventBus?: EventBus;
  mcpServer?: TNSServer;
  translationService?: TranslationService;
  /** Pre-created agents — when provided, skip construction in engine. */
  agents?: EngineAgents;
  playerProfileStore?: PlayerProfileStore;
}

interface SessionParams {
  character?: string | null;
  location?: string;
  storyTime?: Date;
  role?: string;
  sessionId?: string | null;
}

// ─── RoleplayEngine ──────────────────────────────────────────────────────────

export class RoleplayEngine {
  private _dbPath: string;
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _historyMgr: HistoryManager;
  private _worldFrame: Record<string, unknown>;
  private _eventBus: EventBus;

  // State-First pipeline services
  readonly intentParser: IntentParser;
  readonly simulationEngine: SimulationEngine;
  readonly stateMutator: StateMutator;
  readonly contextBuilder: ContextBuilder;

  // v0.25.0 New agents
  readonly agentRegistry: AgentRegistryV2;
  readonly dramaturg: DramaturgAgent;
  readonly validator: ValidatorAgent;
  readonly stylist: StylistAgent;
  readonly actor: ActorAgent;
  readonly censor: CensorAgent;
  readonly chroniclerAgent: ChroniclerAgent;

  // v0.25.0 Translation
  readonly translationService?: TranslationService;

  // Subsystem agents (crafting, research) — not prose generators
  readonly crafter: CrafterAgent;
  readonly researcher: ResearcherAgent;
  dialogueManager?: DialogueManager;
  readonly startResolver: StartResolver;
  readonly chronicler: Chronicler;
  readonly memory: MemoryManager;

  // Session state
  readonly session = new SessionState();

  // Command handler
  readonly commandHandler: CommandHandler;

  // Pipeline runner
  readonly pipelineRunner: PipelineRunner;

  // Prose generator
  readonly v2Generator: LiteraryV2Generator;

  // Backward-compat getter/setter
  get activeCharacter() { return this.session.activeCharacter; }
  set activeCharacter(v: string | null) { this.session.activeCharacter = v; }
  get currentLocation() { return this.session.currentLocation; }
  set currentLocation(v: string) { this.session.currentLocation = v; }
  get currentTime() { return this.session.currentTime; }
  set currentTime(v: Date) { this.session.currentTime = v; }
  get userRole() { return this.session.userRole; }
  set userRole(v: string) { this.session.userRole = v; }
  get activeSessionId() { return this.session.activeSessionId; }
  set activeSessionId(v: string | null) { this.session.activeSessionId = v; }
  get allowAutoEvents() { return this.session.allowAutoEvents; }
  set allowAutoEvents(v: boolean) { this.session.allowAutoEvents = v; }
  get visitedLocations() { return this.session.visitedLocations; }
  set visitedLocations(v: Set<string>) { this.session.visitedLocations = v; }

  // Extended deps
  private _npcRuntime?: NPCRuntime;
  private _validator?: WorldValidator;
  private _userAgent?: UserAgent;
  private _sqliteStore?: SQLiteStore;

  // Sequential processing queue — prevents concurrent processInput/processInputStream
  private _processingQueue: Promise<void> = Promise.resolve();

  // Jungian profiler (Phase 1 — logging only)
  private playerProfileStore?: PlayerProfileStore;
  private jungianProfile: JungianProfile = createDefaultProfile();
  private metricsCollector = new MetricsCollector();
  private refusalTracker = new RefusalTracker();
  private deferredHookStore = new DeferredHookStore();
  private recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] } = {
    extraversion: [], intuition: [], thinking: [], judging: [],
  };

  constructor(deps: EngineDeps) {
    this._dbPath = deps.dbPath;
    this._entityStore = deps.entityStore;
    this._llmQueue = deps.llmQueue;
    this._historyMgr = deps.historyMgr;
    this._worldFrame = deps.worldFrame;
    this._npcRuntime = deps.npcRuntime;
    this._validator = deps.validator;
    this._userAgent = deps.userAgent;
    this._sqliteStore = deps.sqliteStore;
    this._eventBus = deps.eventBus ?? new EventBus();
    this.playerProfileStore = deps.playerProfileStore;
    this.initJungianProfile();
    this.loadDeferredHooks();
    // Block closure for deferred hooks is driven by story beats, not a turn-count heuristic.
    this._eventBus.subscribe(EventTopic.STORY_BEAT, async () => {
      if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
        this.deferredHookStore.closeBlock(this.metricsCollector.getTurnCount());
        this.persistDeferredHooks();
      }
    });

    // Initialize State-First pipeline services
    this.intentParser = new IntentParser(deps.llmQueue);
    this.simulationEngine = new SimulationEngine(
      deps.entityStore,
      this._eventBus,
    );
    this.stateMutator = new StateMutator(
      deps.entityStore,
      this._eventBus,
      deps.chronicler ?? new Chronicler(join(deps.dbPath, 'timeline.jsonl')),
    );
    this.contextBuilder = new ContextBuilder(
      deps.entityStore,
      deps.chronicler ?? new Chronicler(join(deps.dbPath, 'timeline.jsonl')),
      new MemoryManager(join(deps.dbPath, 'roleplay_memory.json')),
      deps.worldFrame,
    );

    // Initialize v0.25.0 agents (from deps or constructor)
    this.translationService = deps.translationService;
    this.agentRegistry = getAgentRegistryV2();

    if (deps.agents) {
      this.dramaturg = deps.agents.dramaturg;
      this.validator = deps.agents.validator;
      this.stylist = deps.agents.stylist;
      this.actor = deps.agents.actor;
      this.censor = deps.agents.censor;
      this.chroniclerAgent = deps.agents.chroniclerAgent;
      this.crafter = deps.agents.crafter;
      this.researcher = deps.agents.researcher;
    } else {
      this.dramaturg = new DramaturgAgent(deps.mcpServer as TNSServer, deps.llmQueue, () => this.getLiteraryDb());
      this.validator = new ValidatorAgent(deps.mcpServer as TNSServer);
      this.stylist = new StylistAgent(deps.mcpServer as TNSServer, deps.llmQueue);
      this.actor = new ActorAgent(deps.entityStore, deps.llmQueue);
      this.censor = new CensorAgent(deps.llmQueue);
      this.chroniclerAgent = new ChroniclerAgent(deps.entityStore, this._eventBus);
      this.crafter = new CrafterAgent(deps.entityStore, deps.llmQueue, deps.dbPath);
      this.researcher = new ResearcherAgent(deps.llmQueue);
    }

    // Register new agents
    this.agentRegistry.register(this.dramaturg);
    this.agentRegistry.register(this.validator);
    this.agentRegistry.register(this.stylist);
    this.agentRegistry.register(this.actor);
    this.agentRegistry.register(this.censor);
    this.agentRegistry.register(this.chroniclerAgent);
    // DialogueManager requires SocialGraph + MemoryEngine, both backed by the same dbPath
    if (this._npcRuntime) {
      const socialGraph = new SocialGraph(deps.dbPath);
      const memoryEngine = new MemoryEngine(this._npcRuntime);
      const dialogueCtx = new DialogueContext(this._npcRuntime, socialGraph, memoryEngine);
      this.dialogueManager = new DialogueManager(deps.dbPath, this._npcRuntime, socialGraph, dialogueCtx);
    }
    this.startResolver = new StartResolver(deps.entityStore, deps.llmQueue, 'director');
    this.chronicler = deps.chronicler ?? new Chronicler(join(deps.dbPath, 'timeline.jsonl'));
    this.memory = new MemoryManager(join(deps.dbPath, 'roleplay_memory.json'));

    this.commandHandler = new CommandHandler({
      entityStore: deps.entityStore,
      crafter: this.crafter,
      chronicler: this.chronicler,
      userAgent: deps.userAgent,
      session: this.session,
    });

    this.pipelineRunner = new PipelineRunner({
      entityStore: deps.entityStore,
      llmQueue: deps.llmQueue,
      historyMgr: deps.historyMgr,
      worldFrame: deps.worldFrame,
      session: this.session,
      translationService: this.translationService,
      intentParser: this.intentParser,
      simulationEngine: this.simulationEngine,
      stateMutator: this.stateMutator,
      contextBuilder: this.contextBuilder,
    });

    this.v2Generator = new LiteraryV2Generator(deps.llmQueue, this.stylist, deps.worldFrame, () => this.getLiteraryDb());
  }

  reset(newDbPath: string): void {
    this._dbPath = newDbPath;
    this.memory.reload(join(newDbPath, 'roleplay_memory.json'));
    this.session.reset();
  }

  setSession(params: SessionParams): void {
    this.session.set({
      character: params.character,
      location: params.location,
      time: params.storyTime,
      role: params.role,
      sessionId: params.sessionId,
    });
  }

  private get playerId(): string {
    return this.activeCharacter ?? this.activeSessionId ?? 'default';
  }

  private resolveAuthorPhrases(): string[] {
    const authorName = this.playerProfileStore?.getClosestAuthor(this.playerId);
    if (!authorName) return [];
    return loadAuthorCorpus().find(a => a.name === authorName)?.samplePhrases ?? [];
  }

  private deferredHooksPath(): string {
    return join(this._dbPath ?? '.', 'deferred-hooks.json');
  }

  private persistDeferredHooks(): void {
    atomicWriteJson(this.deferredHooksPath(), this.deferredHookStore.toJSON());
  }

  private loadDeferredHooks(): void {
    const data = readJsonFileSync<unknown>(this.deferredHooksPath());
    if (Array.isArray(data)) {
      this.deferredHookStore = DeferredHookStore.fromJSON(data);
    }
  }

  private initJungianProfile(): void {
    const saved = this.playerProfileStore?.getJungianProfile(this.playerId);
    if (saved) this.jungianProfile = saved;
    const metrics = this.playerProfileStore?.getBehavioralMetrics(this.playerId);
    if (metrics) this.metricsCollector.restore(metrics.aggregates, metrics.totalTurns);
  }

  private runBlendCycle(): void {
    if (this.metricsCollector.getTurnCount() % 20 !== 0 || this.metricsCollector.getTurnCount() === 0) return;
    const playerId = this.playerId;
    const derived = deriveMetrics(this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), this.visitedLocations.size);
    const signals = inferFromMetrics(derived);
    for (const axis of ['extraversion', 'intuition', 'thinking', 'judging'] as const) {
      this.recentSignals[axis].push(signals[axis]);
      if (this.recentSignals[axis].length > 10) this.recentSignals[axis].shift();
    }
    this.jungianProfile = blendBehavioralSignals(signals, this.jungianProfile, this.recentSignals);
    this.metricsCollector.decay();
    this.playerProfileStore?.upsertJungianProfile(playerId, this.jungianProfile);
    this.playerProfileStore?.upsertBehavioralMetrics(playerId, this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), signals);
    log.info({ playerId, confidence: this.jungianProfile.confidence, type: deriveType(this.jungianProfile) }, 'jungian profile blended');
  }

  private async runEnrichmentConveyor(gameContext: GameContext, outcome: string): Promise<string> {
    const wf = this._worldFrame;
    const worldState: WorldState = {
      genre: typeof wf.genre === 'string' ? wf.genre : undefined,
      socialSystem: typeof wf.social_system === 'object' && wf.social_system !== null
        ? (wf.social_system as { primary?: string }).primary
        : undefined,
    };
    const sceneContext: SceneContext = {
      mood: outcome === 'critical_failure' || outcome === 'failure' ? 'somber'
        : outcome === 'critical_success' ? 'joyful' : undefined,
      timeOfDay: gameContext.timeOfDay,
    };
    const dist = computeDistribution(this.jungianProfile, worldState, sceneContext);
    const dramaturg = await this.dramaturg.enrichScene(dist.archetypes, gameContext);
    const nearbyWithTypes = gameContext.nearbyNpcs.map(n => ({
      id: n.uid ?? n.name, name: n.name,
      psychotype: n.profile.l3.psychotype as JungianProfile | undefined,
    }));
    const actor = this.actor.enrichNpcs(dist.informationStyle, nearbyWithTypes);
    const validator = await this.validator.verify(gameContext, dramaturg.filledSkeleton);
    const toneHint = getFeatureFlagManager().isEnabled('literary-modulation-enabled')
      ? computeLiteraryToneHint(dist)
      : undefined;
    return buildPlayerVoice(dist, dramaturg, actor, validator, toneHint);
  }

  // ─── Main Input Processing (State-First Pipeline) ──────────────────────

  async processInput(userInput: string): Promise<string | { agentResponse: { response: string; agentId: string; agentName: string } }> {
    // Sequential queue: wait for previous call to complete
    const prev = this._processingQueue;
    let resolve: () => void;
    this._processingQueue = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      return await this._processInputImpl(userInput);
    } finally {
      resolve!();
    }
  }

  private async _processInputImpl(userInput: string): Promise<string | { agentResponse: { response: string; agentId: string; agentName: string } }> {
    const ctx = this.pipelineRunner.buildContext(userInput);
    if (!ctx.parsedInput) return '';

    // Agent mentions bypass the new pipeline
    const agentMatch = ctx.parsedInput.match(AGENT_MENTION);
    if (agentMatch) {
      const result = await this.processAgentMessage(agentMatch[1]!, agentMatch[2]!);
      return { agentResponse: result };
    }

    // Step 0+1: Translate + classify intent
    const intent = await this.pipelineRunner.translateAndClassify(ctx);
    await this._eventBus.publishSimple(EventTopic.HEARTBEAT_INTENT_PARSED, { input: ctx.parsedInput }, 'engine');

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.metricsCollector.recordInput(ctx.parsedInput);
      this.metricsCollector.recordIntent(intent, ctx.parsedInput, true);
    }

    // Step 2: Handle commands directly
    if (isCommandIntent(intent)) {
      return this._handleCommand(intent.command + (intent.args?.raw ? ` ${intent.args.raw}` : ''));
    }

    // Step 3: Run deterministic simulation
    await this._eventBus.publishSimple(EventTopic.HEARTBEAT_SIMULATION_STARTED, {}, 'engine');
    ctx.intent = intent;
    const simResult = await this.pipelineRunner.runSimulation(ctx);
    await this._eventBus.publishSimple(EventTopic.HEARTBEAT_SIMULATION_COMPLETE, {
      outcome: simResult.outcome,
      probability: simResult.probability,
    }, 'engine');

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.metricsCollector.recordSimulation(intent, simResult);
    }

    // Step 4: Apply state changes immediately
    if (simResult.stateChanges.length > 0) {
      await this._eventBus.publishSimple(EventTopic.HEARTBEAT_STATE_MUTATED, {}, 'engine');
      await this.stateMutator.applyChanges(simResult.stateChanges);
    }

    // Step 5: Build context from UPDATED state
    const gameContext = await this.pipelineRunner.buildGameContext(ctx);

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.runBlendCycle();
      if (this.jungianProfile.confidence >= 0.3) {
        ctx.playerVoice = await this.runEnrichmentConveyor(gameContext, simResult.outcome);
      }
    }

    // Step 6: Generate prose based on intent type
    await this._eventBus.publishSimple(EventTopic.HEARTBEAT_PROSE_GENERATING, {}, 'engine');

    let narrative: string;
    ctx.v2Used = true;

    try {
      narrative = await this.v2Generator.generate(intent, simResult, gameContext, ctx.parsedInput, ctx.playerVoice, this.resolveAuthorPhrases());
    } catch (err) {
      log.error({ err }, 'v2 prose generation failed');
      narrative = 'The story pauses here.';
    }

    await this._eventBus.publishSimple(EventTopic.HEARTBEAT_PROSE_COMPLETE, {}, 'engine');

    // Short Turn Expansion — gated by feature flag, respecting repeated refusals
    if (getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
        && shouldExpand(ctx.parsedInput, intent)) {
      const sceneId = `${gameContext.location?.name ?? 'unknown'}_${gameContext.character?.name ?? 'hero'}`;
      // Record explicit refusal so a second refusal in this scene suppresses expansion.
      if (detectRefusal(ctx.parsedInput)) {
        this.refusalTracker.recordRefusal(sceneId);
      }
      if (!this.refusalTracker.shouldSuppress(sceneId)
          && analyzeCharge(ctx.parsedInput, simResult, gameContext) !== 'none') {
        try {
          narrative = await expand(
            ctx.parsedInput, simResult, gameContext,
            ctx.playerVoice, this.resolveAuthorPhrases(),
            this._llmQueue,
          );
          log.info({ originalLen: ctx.parsedInput.length, expandedLen: narrative.length }, 'short turn expanded');
        } catch (err) {
          log.warn({ err }, 'short turn expansion failed, using original narrative');
        }
      }
    }

    // Deferred Hook Detection — gated by feature flag
    if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
      const charge = analyzeCharge(ctx.parsedInput, simResult, gameContext);
      if (charge === 'high') {
        const lower = ctx.parsedInput.toLowerCase();
        const refusedNpc = gameContext.nearbyNpcs.find(n => n.name && lower.includes(n.name.toLowerCase()));
        if (refusedNpc) {
          this.deferredHookStore.add({
            npcId: refusedNpc.uid ?? refusedNpc.name,
            npcName: refusedNpc.name,
            hookStrength: 2, // default to "edge"
            sourceTurn: this.metricsCollector.getTurnCount(),
          });
          this.persistDeferredHooks();
          log.info({ npcId: refusedNpc.uid, npcName: refusedNpc.name }, 'deferred hook created');
        }
      }
    }

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled') && narrative) {
      const cleaned = await this.censor.clean(narrative, gameContext);
      narrative = cleaned.cleaned;
      log.info({ jungianEnabled: true, jungianType: deriveType(this.jungianProfile), confidence: this.jungianProfile.confidence }, 'jungian adaptation applied');
    }

    // Observability — log literary signals without affecting generation
    if (getFeatureFlagManager().isEnabled('literary-modulation-enabled')
        || getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
        || getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
      const signals = logLiterarySignals(
        ctx, gameContext, intent, ctx.playerVoice, this.resolveAuthorPhrases(),
      );
      log.info({ literarySignals: signals }, 'literary modulation observability');
    }

    // Step 6.5: Translate if needed
    if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
      const lang = this._worldFrame.language as LanguageCode;
      if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
        narrative = await this.translationService.translate(narrative, lang);
      }
    }

    // Step 7: Log and persist
    await this.chronicler.logEvent(
      `User action: ${ctx.parsedInput}`,
      this.currentTime,
      'user_input',
    );
    this.memory.addEntry(ctx.parsedInput, narrative);

    if (this.activeSessionId) {
      this._historyMgr.addTurn(this.activeSessionId, 'user', ctx.parsedInput);
      this._historyMgr.addTurn(this.activeSessionId, 'assistant', narrative);
    }

    // Advance time
    this.currentTime = new Date(this.currentTime.getTime() + 5 * 60 * 1000);

    return narrative;
  }

  async *processInputStream(userInput: string): AsyncGenerator<{ type: string; content?: string; agent_id?: string; agent_name?: string; location?: string; story_time?: string; active_character?: string; error?: string }> {
    // Sequential queue: wait for previous call to complete
    const prev = this._processingQueue;
    let resolve: () => void;
    this._processingQueue = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      yield* this._processInputStreamImpl(userInput);
    } finally {
      resolve!();
    }
  }

  private async *_processInputStreamImpl(userInput: string): AsyncGenerator<{ type: string; content?: string; agent_id?: string; agent_name?: string; location?: string; story_time?: string; active_character?: string; error?: string }> {
    const stripped = userInput.trim();
    if (!stripped) {
      yield { type: 'done', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Agent mentions bypass streaming
    const agentMatch = stripped.match(AGENT_MENTION);
    if (agentMatch) {
      const result = await this.processAgentMessage(agentMatch[1]!, agentMatch[2]!);
      yield { type: 'chunk', content: `【${result.agentName}】\n${result.response}` };
      yield { type: 'done', agent_id: result.agentId, agent_name: result.agentName, location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Build engine state and parse intent
    const engineState: EngineState = {
      activeCharacter: this.activeCharacter,
      currentLocation: this.currentLocation,
      currentTime: this.currentTime,
      userRole: this.userRole,
      visitedLocations: this.visitedLocations,
    };

    // Reverse translate non-English input
    let parsedInput = stripped;
    if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
      const inputLang = this.translationService.detectLanguage(stripped);
      if (inputLang !== 'en') {
        parsedInput = await this.translationService.translateToEnglish(stripped, inputLang);
      }
    }

    const parserContext = this.contextBuilder.buildParserContext(engineState);
    const intent = await this.intentParser.parse(parsedInput, parserContext);

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.metricsCollector.recordInput(parsedInput);
      this.metricsCollector.recordIntent(intent, parsedInput, true);
    }

    // Yield heartbeat: intent parsed
    yield { type: 'heartbeat', content: 'Understanding your input...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    // Commands — no streaming
    if (isCommandIntent(intent)) {
      const result = await this._handleCommand(intent.command + (intent.args?.raw ? ` ${intent.args.raw}` : ''));
      yield { type: 'chunk', content: result as string };
      yield { type: 'done', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Run simulation
    yield { type: 'heartbeat', content: 'Rolling dice...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
    const characterEntity = this._entityStore.getByNameAndType(this.activeCharacter ?? 'unknown', 'Character');
    const simContext = {
      characterLevel: typeof characterEntity?.profile?.l2?.['level'] === 'number' ? characterEntity.profile.l2['level'] : 1,
      characterStats: (characterEntity?.profile?.l2 ?? {}) as Record<string, number>,
      locationDanger: 0,
      timeOfDay: this._getTimeOfDay(),
      weather: 'clear',
      activeBuffs: [],
      activeDebuffs: [],
    };
    const simResult = await this.simulationEngine.simulate(intent, simContext);

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.metricsCollector.recordSimulation(intent, simResult);
    }

    // Yield heartbeat: simulation complete
    yield { type: 'heartbeat', content: `Outcome: ${simResult.outcome}`, location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    // Apply state changes
    if (simResult.stateChanges.length > 0) {
      yield { type: 'heartbeat', content: 'Updating world state...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      await this.stateMutator.applyChanges(simResult.stateChanges);
    }

    // Build context
    const gameContext = await this.contextBuilder.build(engineState);

    let playerVoice: string | undefined;
    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
      this.runBlendCycle();
      if (this.jungianProfile.confidence >= 0.3) {
        playerVoice = await this.runEnrichmentConveyor(gameContext, simResult.outcome);
      }
    }

    // Generate prose (streaming for actions, non-streaming for movement/dialogue)
    yield { type: 'heartbeat', content: 'Weaving narrative...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    let narrative = await this.v2Generator.generate(intent, simResult, gameContext, parsedInput, playerVoice, this.resolveAuthorPhrases());

    // Short Turn Expansion — gated by feature flag, respecting repeated refusals
    if (getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
        && shouldExpand(parsedInput, intent)) {
      const sceneId = `${gameContext.location?.name ?? 'unknown'}_${gameContext.character?.name ?? 'hero'}`;
      if (detectRefusal(parsedInput)) {
        this.refusalTracker.recordRefusal(sceneId);
      }
      if (!this.refusalTracker.shouldSuppress(sceneId)
          && analyzeCharge(parsedInput, simResult, gameContext) !== 'none') {
        try {
          narrative = await expand(
            parsedInput, simResult, gameContext,
            playerVoice, this.resolveAuthorPhrases(),
            this._llmQueue,
          );
          log.info({ originalLen: parsedInput.length, expandedLen: narrative.length }, 'short turn expanded');
        } catch (err) {
          log.warn({ err }, 'short turn expansion failed, using original narrative');
        }
      }
    }

    // Deferred Hook Detection — gated by feature flag
    if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
      const charge = analyzeCharge(parsedInput, simResult, gameContext);
      if (charge === 'high') {
        const lower = parsedInput.toLowerCase();
        const refusedNpc = gameContext.nearbyNpcs.find(n => n.name && lower.includes(n.name.toLowerCase()));
        if (refusedNpc) {
          this.deferredHookStore.add({
            npcId: refusedNpc.uid ?? refusedNpc.name,
            npcName: refusedNpc.name,
            hookStrength: 2, // default to "edge"
            sourceTurn: this.metricsCollector.getTurnCount(),
          });
          this.persistDeferredHooks();
          log.info({ npcId: refusedNpc.uid, npcName: refusedNpc.name }, 'deferred hook created');
        }
      }
    }

    if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled') && narrative) {
      const cleaned = await this.censor.clean(narrative, gameContext);
      narrative = cleaned.cleaned;
      log.info({ jungianEnabled: true, jungianType: deriveType(this.jungianProfile), confidence: this.jungianProfile.confidence }, 'jungian adaptation applied');
    }

    // Observability — log literary signals without affecting generation
    if (getFeatureFlagManager().isEnabled('literary-modulation-enabled')
        || getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
        || getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
      const signals = logLiterarySignals(
        { parsedInput }, gameContext, intent, playerVoice, this.resolveAuthorPhrases(),
      );
      log.info({ literarySignals: signals }, 'literary modulation observability');
    }

    if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
      const lang = this._worldFrame.language as LanguageCode;
      if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
        narrative = await this.translationService.translate(narrative, lang);
      }
    }
    yield { type: 'chunk', content: narrative };

    // Yield heartbeat: prose complete
    yield { type: 'heartbeat', content: 'Complete', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    // Log and persist
    await this.chronicler.logEvent(`User action: ${stripped}`, this.currentTime, 'user_input');
    this.memory.addEntry(stripped, '');
    if (this.activeSessionId) {
      this._historyMgr.addTurn(this.activeSessionId, 'user', stripped);
    }

    this.currentTime = new Date(this.currentTime.getTime() + 5 * 60 * 1000);
    yield { type: 'done', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
  }


  // ─── Legacy Agent Support (Phase 3 will replace these) ─────────────────

  async processAgentMessage(agentId: string, message: string): Promise<{ response: string; agentId: string; agentName: string }> {
    const agent = this._getAgentById(agentId);
    if (!agent) {
      return {
        response: `Unknown agent: ${agentId}. Available: chronicler, story-planner, social-sim, villain, researcher`,
        agentId,
        agentName: agentId,
      };
    }

    const recentEvents = (await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 2 * 60 * 60 * 1000),
      10,
    )).map(e => e.description);

    const worldRules = this._entityStore.allNodes()
      .filter(n => n.entityType === 'WorldRule')
      .map(n => n.profile.summary);

    const nearbyNpcs = this._getNearbyNpcs();
    const conversation = this.memory.getRecent(5);

    const response = await agent.generateServiceMessage({
      message,
      location: this.currentLocation,
      character: this.activeCharacter ?? 'unknown',
      storyTime: this.currentTime.toISOString(),
      recentEvents,
      worldRules,
      nearbyNpcs,
      conversation,
    });

    return { response, agentId, agentName: agent.name };
  }

  private _getAgentById(agentId: string): ServiceMessageAgent | null {
    const agents: Record<string, ServiceMessageAgent> = {
      chronicler: {
        name: 'Chronicler',
        generateServiceMessage: async (ctx) => {
          const timeline = await this.chronicler.getTimeline(new Date(this.currentTime.getTime() - 24 * 60 * 60 * 1000), 20);
          return `The world timeline contains ${timeline.length} events. Recent events:\n${timeline.slice(-5).map(e => `- ${e.description}`).join('\n') || 'No recent events.'}\n\nYour request: "${ctx.message}"`;
        },
      },
      'story-planner': {
        name: 'Story Planner',
        generateServiceMessage: async (ctx) => {
          const planPrompt = `You are a Story Planner for a living narrative world.
World rules: ${ctx.worldRules.join('; ') || 'None'}
Recent events: ${ctx.recentEvents.join('; ') || 'None'}
Current location: ${ctx.location}
Active character: ${ctx.character}

Your task: Analyze the current narrative state and respond to the player's request.
Provide story arc suggestions, beat recommendations, or plot analysis.

Player request: "${ctx.message}"`;
          return this._llmQueue.generateText(planPrompt, 1, 0.7, 'story-planner');
        },
      },
      'social-sim': {
        name: 'Social Simulator',
        generateServiceMessage: async (ctx) => {
          const simPrompt = `You are a Social Dynamics Simulator for a living narrative world.
Current location: ${ctx.location}
Nearby NPCs: ${ctx.nearbyNpcs.join(', ') || 'none'}
Recent events: ${ctx.recentEvents.join('; ') || 'None'}
World rules: ${ctx.worldRules.join('; ') || 'None'}

Your task: Analyze social dynamics, simulate NPC interactions, or respond to the player's request.
Consider relationships, moods, and recent events.

Player request: "${ctx.message}"`;
          return this._llmQueue.generateText(simPrompt, 1, 0.7, 'social-sim');
        },
      },
      villain: {
        name: 'Villain Manager',
        generateServiceMessage: async (ctx) => {
          const villainPrompt = `You are a Villain Manager for a living narrative world.
World rules: ${ctx.worldRules.join('; ') || 'None'}
Recent events: ${ctx.recentEvents.join('; ') || 'None'}
Current location: ${ctx.location}
Active character: ${ctx.character}

Your task: Plan antagonist actions, analyze villain schemes, or respond to the player's request.
Consider the villain's goals, resources, and opportunities.

Player request: "${ctx.message}"`;
          return this._llmQueue.generateText(villainPrompt, 1, 0.7, 'villain');
        },
      },
      researcher: this.researcher,
    };
    return agents[agentId] ?? null;
  }

  private _getNearbyNpcs(): string[] {
    const allNodes = this._entityStore.listByType('Character');
    return allNodes
      .filter(n => n.profile.l2.current_location === this.currentLocation)
      .map(n => n.name);
  }

  // ─── Command Handler ───────────────────────────────────────────────────

  private async _handleCommand(cmd: string): Promise<string> {
    return this.commandHandler.handle(cmd);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private _getTimeOfDay(): 'dawn' | 'day' | 'dusk' | 'night' {
    const hour = this.currentTime.getHours();
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 18) return 'day';
    if (hour >= 18 && hour < 21) return 'dusk';
    return 'night';
  }

  // ─── V2 Literary Compiler helpers ─────────────────────────────────────

  private _literaryDb: LiteraryCompilerDB | null = null;

  getLiteraryDb(): LiteraryCompilerDB | null {
    if (!this._literaryDb) {
      try {
        const dbPath = join(process.cwd(), 'data', 'literary-compiler', 'literary.db');
        this._literaryDb = new LiteraryCompilerDB(dbPath);
      } catch {
        log.warn('Could not open literary.db for v2 pipeline');
      }
    }
    return this._literaryDb;
  }


  getSessionState(): Record<string, unknown> {
    return {
      active_character: this.activeCharacter,
      current_location: this.currentLocation,
      current_time: this.currentTime.toISOString(),
      user_role: this.userRole,
      allow_auto_events: this.allowAutoEvents,
    };
  }

  destroy(): void {
    this.visitedLocations.clear();
    this.activeCharacter = null;
    this.activeSessionId = null;
  }
}
