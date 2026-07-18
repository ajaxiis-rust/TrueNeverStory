/**
 * RoleplayEngine — State-First pipeline for roleplay processing.
 * v0.25.0: Intent → Simulation → State → Context → Prose
 */

import type { UnifiedEntityStore } from '../store/entity-store';
import type { LLMQueue } from '../lib/llm-queue';
import type { HistoryManager } from '../lib/history-manager';
import { MemoryManager } from './memory-manager';
import { NarratorAgent } from './narrator-agent';
import { NPCAgent } from './npc-agent';
import { SceneAgent } from './scene-agent';
import { DirectorAgent } from './director-agent';
import { CrafterAgent } from './crafter-agent';
import { ResearcherAgent } from './researcher-agent';
import { CartographerAgent } from './cartographer-agent';
import { HistorianAgent } from './historian-agent';
import { LorekeeperAgent } from './lorekeeper-agent';
import { MerchantAgent } from './merchant-agent';
import { QuestGiverAgent } from './quest-giver-agent';
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
import type { StoryContext } from '../models/story';
import type { Intent } from '../models/intent';
import { isMovementIntent, isDialogueIntent, isActionIntent, isCommandIntent, isObservationIntent } from '../models/intent';
import { OutcomeQuality } from '../models/simulation';
import { getLogger } from '../utils/logger';
import { join } from 'node:path';
import { t } from '../i18n';

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

const log = getLogger('roleplay-engine');

// ─── Agent Mention Pattern (kept for backward compat during migration) ──────

const AGENT_MENTION = /^@(\S+)\s+(.+)$/;

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

  // Agents (legacy, to be replaced in Phase 3)
  readonly narrator: NarratorAgent;
  readonly npcAgent: NPCAgent;
  readonly sceneAgent: SceneAgent;
  readonly directorAgent: DirectorAgent;
  readonly crafter: CrafterAgent;
  readonly researcher: ResearcherAgent;
  readonly cartographer: CartographerAgent;
  readonly historian: HistorianAgent;
  readonly lorekeeper: LorekeeperAgent;
  readonly merchant: MerchantAgent;
  readonly questGiver: QuestGiverAgent;
  dialogueManager?: DialogueManager;
  readonly startResolver: StartResolver;
  readonly chronicler: Chronicler;
  readonly memory: MemoryManager;

  // Session state
  activeCharacter: string | null = null;
  currentLocation = 'unknown';
  currentTime = new Date();
  userRole = 'protagonist';
  activeSessionId: string | null = null;
  allowAutoEvents = true;
  visitedLocations = new Set<string>();

  // Extended deps
  private _npcRuntime?: NPCRuntime;
  private _validator?: WorldValidator;
  private _userAgent?: UserAgent;
  private _sqliteStore?: SQLiteStore;

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

    // Initialize v0.25.0 new agents
    this.agentRegistry = getAgentRegistryV2();
    this.dramaturg = new DramaturgAgent(deps.mcpServer as TNSServer, deps.llmQueue);
    this.validator = new ValidatorAgent(deps.mcpServer as TNSServer);
    this.stylist = new StylistAgent(deps.mcpServer as TNSServer, deps.llmQueue);
    this.actor = new ActorAgent(deps.entityStore, deps.llmQueue);
    this.censor = new CensorAgent(deps.llmQueue);
    this.chroniclerAgent = new ChroniclerAgent(deps.entityStore, this._eventBus);

    // Register new agents
    this.agentRegistry.register(this.dramaturg);
    this.agentRegistry.register(this.validator);
    this.agentRegistry.register(this.stylist);
    this.agentRegistry.register(this.actor);
    this.agentRegistry.register(this.censor);
    this.agentRegistry.register(this.chroniclerAgent);

    // Initialize Translation Service
    this.translationService = deps.translationService;

    // Initialize legacy agents (to be replaced in Phase 3)
    this.narrator = new NarratorAgent(deps.llmQueue);
    this.npcAgent = new NPCAgent(deps.llmQueue);
    this.sceneAgent = new SceneAgent(deps.llmQueue);
    this.directorAgent = new DirectorAgent(deps.llmQueue);
    this.crafter = new CrafterAgent(deps.entityStore, deps.llmQueue, deps.dbPath);
    this.researcher = new ResearcherAgent(deps.llmQueue);
    this.cartographer = new CartographerAgent(deps.llmQueue);
    this.historian = new HistorianAgent(deps.llmQueue);
    this.lorekeeper = new LorekeeperAgent(deps.llmQueue);
    this.merchant = new MerchantAgent(deps.llmQueue);
    this.questGiver = new QuestGiverAgent(deps.llmQueue);
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
  }

  reset(newDbPath: string): void {
    this._dbPath = newDbPath;
    this.memory.reload(join(newDbPath, 'roleplay_memory.json'));
    this.currentLocation = 'unknown';
    this.activeSessionId = null;
    this.activeCharacter = null;
    this.visitedLocations.clear();
  }

  setSession(params: SessionParams): void {
    if (params.character !== undefined) this.activeCharacter = params.character;
    if (params.location) this.currentLocation = params.location;
    if (params.storyTime) this.currentTime = params.storyTime;
    if (params.role) this.userRole = params.role;
    if (params.sessionId !== undefined) this.activeSessionId = params.sessionId;
  }

  // ─── Main Input Processing (State-First Pipeline) ──────────────────────

  async processInput(userInput: string): Promise<string | { agentResponse: { response: string; agentId: string; agentName: string } }> {
    const stripped = userInput.trim();
    if (!stripped) return '';

    // Agent mentions bypass the new pipeline (backward compat)
    const agentMatch = stripped.match(AGENT_MENTION);
    if (agentMatch) {
      const result = await this.processAgentMessage(agentMatch[1]!, agentMatch[2]!);
      return { agentResponse: result };
    }

    // Build engine state
    const engineState: EngineState = {
      activeCharacter: this.activeCharacter,
      currentLocation: this.currentLocation,
      currentTime: this.currentTime,
      userRole: this.userRole,
      visitedLocations: this.visitedLocations,
    };

    // Step 0: Reverse translate non-English input
    let parsedInput = stripped;
    if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
      const inputLang = this.translationService.detectLanguage(stripped);
      if (inputLang !== 'en') {
        parsedInput = await this.translationService.translateToEnglish(stripped, inputLang);
      }
    }

    // Step 1: Parse intent
    this._eventBus.publishSimple(EventTopic.HEARTBEAT_INTENT_PARSED, { input: stripped }, 'engine');
    const parserContext = this.contextBuilder.buildParserContext(engineState);
    const intent = await this.intentParser.parse(parsedInput, parserContext);

    // Step 2: Handle commands directly (no simulation needed)
    if (isCommandIntent(intent)) {
      return this._handleCommand(intent.command + (intent.args?.raw ? ` ${intent.args.raw}` : ''));
    }

    // Step 3: Run deterministic simulation
    this._eventBus.publishSimple(EventTopic.HEARTBEAT_SIMULATION_STARTED, {}, 'engine');
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
    this._eventBus.publishSimple(EventTopic.HEARTBEAT_SIMULATION_COMPLETE, {
      outcome: simResult.outcome,
      probability: simResult.probability,
    }, 'engine');

    // Step 4: Apply state changes immediately
    if (simResult.stateChanges.length > 0) {
      this._eventBus.publishSimple(EventTopic.HEARTBEAT_STATE_MUTATED, {}, 'engine');
      await this.stateMutator.applyChanges(simResult.stateChanges);
    }

    // Step 5: Build context from UPDATED state
    const gameContext = await this.contextBuilder.build(engineState);

    // Step 6: Generate prose based on intent type
    this._eventBus.publishSimple(EventTopic.HEARTBEAT_PROSE_GENERATING, {}, 'engine');
    let narrative: string;

    if (isMovementIntent(intent)) {
      narrative = await this._handleMovementWithIntent(intent, gameContext);
    } else if (isDialogueIntent(intent)) {
      narrative = await this._handleDialogueWithIntent(intent, gameContext);
    } else if (isObservationIntent(intent)) {
      narrative = await this._handleObservation(intent, gameContext);
    } else {
      // Action or fallback — use narrator with simulation constraints
      narrative = await this._handleActionWithSimulation(intent, simResult, gameContext);
    }

    this._eventBus.publishSimple(EventTopic.HEARTBEAT_PROSE_COMPLETE, {}, 'engine');

    // Step 6.5: Translate if needed
    if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
      const lang = this._worldFrame.language as LanguageCode;
      if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
        narrative = await this.translationService.translate(narrative, lang);
      }
    }

    // Step 7: Log and persist
    await this.chronicler.logEvent(
      `User action: ${stripped}`,
      this.currentTime,
      'user_input',
    );
    this.memory.addEntry(stripped, narrative);

    if (this.activeSessionId) {
      this._historyMgr.addTurn(this.activeSessionId, 'user', stripped);
      this._historyMgr.addTurn(this.activeSessionId, 'assistant', narrative);
    }

    // Advance time
    this.currentTime = new Date(this.currentTime.getTime() + 5 * 60 * 1000);

    return narrative;
  }

  async *processInputStream(userInput: string): AsyncGenerator<{ type: string; content?: string; agent_id?: string; agent_name?: string; location?: string; story_time?: string; active_character?: string; error?: string }> {
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

    // Yield heartbeat: simulation complete
    yield { type: 'heartbeat', content: `Outcome: ${simResult.outcome}`, location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    // Apply state changes
    if (simResult.stateChanges.length > 0) {
      yield { type: 'heartbeat', content: 'Updating world state...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      await this.stateMutator.applyChanges(simResult.stateChanges);
    }

    // Build context
    const gameContext = await this.contextBuilder.build(engineState);

    // Generate prose (streaming for actions, non-streaming for movement/dialogue)
    yield { type: 'heartbeat', content: 'Weaving narrative...', location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };

    if (isMovementIntent(intent)) {
      let result = await this._handleMovementWithIntent(intent, gameContext);
      if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
        const lang = this._worldFrame.language as LanguageCode;
        if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
          result = await this.translationService.translate(result, lang);
        }
      }
      yield { type: 'chunk', content: result };
    } else if (isDialogueIntent(intent)) {
      let result = await this._handleDialogueWithIntent(intent, gameContext);
      if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
        const lang = this._worldFrame.language as LanguageCode;
        if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
          result = await this.translationService.translate(result, lang);
        }
      }
      yield { type: 'chunk', content: result };
    } else if (isObservationIntent(intent)) {
      let result = await this._handleObservation(intent, gameContext);
      if (this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en') {
        const lang = this._worldFrame.language as LanguageCode;
        if (['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(lang)) {
          result = await this.translationService.translate(result, lang);
        }
      }
      yield { type: 'chunk', content: result };
    } else {
      // Streaming for actions
      try {
        yield* this._handleActionStreamWithSimulation(intent, simResult, gameContext);
      } catch (err) {
        yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
      }
    }

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

  // ─── Intent-Based Handlers ─────────────────────────────────────────────

  private async _handleMovementWithIntent(
    intent: Intent & { type: 'movement' },
    context: GameContext,
  ): Promise<string> {
    const destination = intent.destination;
    const locNode = this._entityStore.getByNameAndType(destination, 'Location');
    if (!locNode) {
      const lang = t();
      return lang.noPlace(destination);
    }

    // Get recent events for scene transition
    const recentEvents = context.recentTimeline.map(e => e.description);
    const worldRules = context.worldRules.map(r => r.description);

    // Scene agent generates the journey description
    const description = await this.sceneAgent.transition(
      this.currentLocation,
      destination,
      this.activeCharacter ?? 'you',
      recentEvents,
      worldRules,
    );

    // Update state (already done by simulation, but ensure location is set)
    this.currentLocation = destination;
    this.currentTime = new Date(this.currentTime.getTime() + 10 * 60 * 1000);

    await this.chronicler.logEvent(
      `${this.activeCharacter ?? 'Player'} moved to ${destination}`,
      this.currentTime,
      'movement',
    );

    return description;
  }

  private async _handleDialogueWithIntent(
    intent: Intent & { type: 'dialogue' },
    context: GameContext,
  ): Promise<string> {
    const npcNode = this._entityStore.getByNameAndType(intent.target, 'Character');
    if (!npcNode) {
      const lang = t();
      return lang.noNpc(intent.target);
    }

    const personality = (npcNode.profile.l2.personality as string) ?? 'friendly and neutral';
    const recentEvents = context.recentTimeline.map(e => e.description);

    const response = await this.npcAgent.respond(
      intent.target,
      personality,
      this.activeCharacter ?? 'you',
      this.currentLocation,
      intent.content,
      recentEvents,
    );

    await this.chronicler.logEvent(
      `${this.activeCharacter ?? 'Player'} talked to ${intent.target}: '${intent.content}'`,
      this.currentTime,
      'dialogue',
    );

    return `${intent.target} says: "${response}"`;
  }

  private async _handleObservation(
    intent: Intent & { type: 'observation' },
    context: GameContext,
  ): Promise<string> {
    if (intent.target) {
      // Observe specific target
      const entity = this._entityStore.getByName(intent.target);
      if (entity) {
        const description = (entity.profile.l2.description as string) ?? (entity.profile.summary as string);
        return `You examine ${intent.target}. ${description}`;
      }
      return `You look at ${intent.target} but see nothing noteworthy.`;
    }

    // General observation
    const locNode = context.location;
    if (locNode) {
      const desc = (locNode.profile.l2.description as string) ?? 'You see nothing special.';
      return `You look around. ${desc}`;
    }
    return 'You look around but see nothing of note.';
  }

  private async _handleActionWithSimulation(
    intent: Intent,
    simResult: { outcome: OutcomeQuality; narrativeHints: string[]; probability: number },
    context: GameContext,
  ): Promise<string> {
    // Build story context for narrator
    const nearbyNpcs = context.nearbyNpcs.map(n => n.name);
    const worldRules = context.worldRules.map(r => `- ${r.name}: ${r.description}`);
    const recentTimeline = context.recentTimeline.map(e => e.description);

    const storyContext: StoryContext = {
      worldName: context.world.name,
      currentTime: context.time.toISOString(),
      location: context.location?.name ?? this.currentLocation,
      activeCharacter: this.activeCharacter,
      userRole: this.userRole,
      recentTimeline,
      worldRules,
      nearbyNpcs,
      availableItems: [],
      activeQuests: context.activeQuests.map(q => ({ title: q.title, status: q.status })),
      directorPlan: null,
      genre: (this._worldFrame.genre as string) ?? undefined,
      language: (this._worldFrame.language as string) ?? undefined,
      magicSystem: ((this._worldFrame.magic_system as Record<string, string>)?.rules) ?? undefined,
      worldDescription: (this._worldFrame.description as string) ?? undefined,
    };

    const conversation = this.memory.getRecent(5);

    // Add simulation hints to context
    const hints = simResult.narrativeHints.join('\n');

    const narrative = await this.narrator.generate(
      storyContext,
      [],
      [`Simulation outcome: ${simResult.outcome} (${(simResult.probability * 100).toFixed(0)}%)\nHints: ${hints}`],
      conversation,
    );

    return narrative;
  }

  private async *_handleActionStreamWithSimulation(
    intent: Intent,
    simResult: { outcome: OutcomeQuality; narrativeHints: string[]; probability: number },
    context: GameContext,
  ): AsyncGenerator<{ type: string; content?: string; location?: string; story_time?: string; active_character?: string }> {
    const nearbyNpcs = context.nearbyNpcs.map(n => n.name);
    const worldRules = context.worldRules.map(r => `- ${r.name}: ${r.description}`);
    const recentTimeline = context.recentTimeline.map(e => e.description);

    const storyContext: StoryContext = {
      worldName: context.world.name,
      currentTime: context.time.toISOString(),
      location: context.location?.name ?? this.currentLocation,
      activeCharacter: this.activeCharacter,
      userRole: this.userRole,
      recentTimeline,
      worldRules,
      nearbyNpcs,
      availableItems: [],
      activeQuests: context.activeQuests.map(q => ({ title: q.title, status: q.status })),
      directorPlan: null,
      genre: (this._worldFrame.genre as string) ?? undefined,
      language: (this._worldFrame.language as string) ?? undefined,
      magicSystem: ((this._worldFrame.magic_system as Record<string, string>)?.rules) ?? undefined,
      worldDescription: (this._worldFrame.description as string) ?? undefined,
    };

    const conversation = this.memory.getRecent(5);
    const hints = simResult.narrativeHints.join('\n');

    const shouldTranslate = this.translationService && this._worldFrame.language && this._worldFrame.language !== 'en'
      && ['ru', 'de', 'fr', 'es', 'ja', 'zh'].includes(this._worldFrame.language as string);

    let fullNarrative = '';
    for await (const chunk of this.narrator.generateStream(
      storyContext,
      [],
      [`Simulation outcome: ${simResult.outcome} (${(simResult.probability * 100).toFixed(0)}%)
Hints: ${hints}`],
      conversation,
    )) {
      fullNarrative += chunk;
      if (!shouldTranslate) {
        yield { type: 'chunk', content: chunk };
      }
    }

    if (shouldTranslate) {
      const lang = this._worldFrame.language as LanguageCode;
      const translated = await this.translationService!.translate(fullNarrative, lang);
      yield { type: 'chunk', content: translated };
      fullNarrative = translated;
    }

    this.memory.addEntry('', fullNarrative);
  }

  // ─── Legacy Agent Support (Phase 3 will replace these) ─────────────────

  async processAgentMessage(agentId: string, message: string): Promise<{ response: string; agentId: string; agentName: string }> {
    const agent = this._getAgentById(agentId);
    if (!agent) {
      return {
        response: `Unknown agent: ${agentId}. Available: narrator, director, scene, npc, chronicler, story-planner, social-sim, villain, researcher, historian, cartographer, merchant, quest-giver, lorekeeper`,
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
      narrator: this.narrator,
      director: this.directorAgent,
      scene: this.sceneAgent,
      npc: this.npcAgent,
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
    const lang = t();
    const parts = cmd.split(/\s+/);
    const verb = parts[0]?.toLowerCase() ?? '';

    switch (verb) {
      case 'help':
        return 'Commands: /look, /inventory, /craft, /status, /quests, /time, /save, /quit, /party [add|remove], /attack <target>\n@agent <id> <msg> — private message to an agent\n/craft list — available recipes\n/craft <recipe_id> — craft an item\n/craft suggest <item1> <item2> — get LLM suggestion';
      case 'look': {
        const locNode = this._entityStore.getByNameAndType(this.currentLocation, 'Location');
        if (locNode) {
          const desc = (locNode.profile.l2.description as string) ?? lang.youSee;
          return `You look around. ${desc}`;
        }
        return lang.youSeeNothing;
      }
      case 'inventory': {
        if (!this.activeCharacter) return lang.noCharacter;
        const inv = this.crafter.scanInventory(this.activeCharacter);
        if (inv.size === 0) return lang.crafterInventoryEmpty;
        const lines = ['Inventory:'];
        for (const [name, count] of inv) {
          lines.push(`  ${count > 1 ? `${count}x ` : ''}${name}`);
        }
        const craftable = this.crafter.findCraftable(inv);
        if (craftable.length > 0) {
          lines.push('\nCan craft:');
          for (const r of craftable) {
            lines.push(`  ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')}`);
          }
        }
        return lines.join('\n');
      }
      case 'craft': {
        if (!this.activeCharacter) return lang.noCharacter;
        const subcommand = parts[1]?.toLowerCase() ?? '';

        if (subcommand === 'list') {
          const recipes = this.crafter.getRecipes();
          if (recipes.length === 0) return 'No recipes known.';
          const inv = this.crafter.scanInventory(this.activeCharacter);
          const lines = ['Known recipes:'];
          for (const r of recipes) {
            const canCraft = this.crafter.findCraftable(inv).some(cr => cr.id === r.id);
            const mark = canCraft ? ' ✓' : '';
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')} → ${r.result} [${r.difficulty}]${mark}`);
          }
          lines.push('\n/craft <recipe_id> to craft | /craft suggest <item1> <item2> for ideas');
          return lines.join('\n');
        }

        if (subcommand === 'suggest') {
          const item1 = parts[2] ?? '';
          const item2 = parts[3] ?? '';
          if (!item1 || !item2) return lang.crafterSuggestion('item1', 'item2');
          const worldRules = this._entityStore.allNodes()
            .filter(n => n.entityType === 'WorldRule')
            .map(n => n.profile.summary)
            .join('; ');
          const suggestion = await this.crafter.suggestRecipe(item1, item2, worldRules);
          return suggestion;
        }

        if (subcommand) {
          const result = this.crafter.craft(subcommand, this.activeCharacter);
          if (result.success) {
            await this.chronicler.logEvent(
              `${this.activeCharacter} crafted ${result.result}`,
              this.currentTime,
              'crafting',
            );
            return lang.crafterCrafted(result.result ?? subcommand, subcommand);
          }
          return result.message;
        }

        const inv = this.crafter.scanInventory(this.activeCharacter);
        const craftable = this.crafter.findCraftable(inv);
        const almost = this.crafter.findAlmostCraftable(inv);
        const lines: string[] = [];

        if (craftable.length > 0) {
          lines.push('Can craft now:');
          for (const r of craftable) {
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')} → ${r.result}`);
          }
        }

        if (almost.length > 0) {
          lines.push('\nAlmost ready (need 1 more ingredient):');
          for (const { recipe, missing } of almost) {
            lines.push(`  ${recipe.id}: ${recipe.name} — need: ${missing.join(', ')}`);
          }
        }

        if (craftable.length === 0 && almost.length === 0) {
          return lang.crafterNothingToCraft;
        }

        lines.push('\n/craft <recipe_id> to craft');
        return lines.join('\n');
      }
      case 'status':
        return `Location: ${this.currentLocation}\nCharacter: ${this.activeCharacter ?? 'none'}\nTime: ${this.currentTime.toISOString()}`;
      case 'quests':
        return lang.noQuests;
      case 'time':
        return `Story time: ${this.currentTime.toISOString()}`;
      case 'save':
        return lang.sessionSaved;
      case 'quit':
        return lang.goodbye;
      case 'party': {
        if (!this._userAgent) return 'Party system not available.';
        const subcmd = parts.slice(1);
        return this._userAgent.handlePartyCommand(subcmd);
      }
      case 'attack': {
        if (!this._userAgent) return 'Attack system not available.';
        const target = parts[1];
        if (!target) return 'Usage: /attack <target>';
        return this._userAgent.handleAttack(target, this.activeCharacter, this.currentLocation, this.currentTime);
      }
      default:
        return lang.unknownCommand(verb);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private _getTimeOfDay(): 'dawn' | 'day' | 'dusk' | 'night' {
    const hour = this.currentTime.getHours();
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 18) return 'day';
    if (hour >= 18 && hour < 21) return 'dusk';
    return 'night';
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
