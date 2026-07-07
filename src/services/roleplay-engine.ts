/**
 * RoleplayEngine — main roleplay processing with agents.
 * Replaces world_engine/roleplay_engine.py.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import type { LLMQueue } from "../lib/llm-queue";
import type { HistoryManager } from "../lib/history-manager";
import { MemoryManager } from "./memory-manager";
import { NarratorAgent } from "./narrator-agent";
import { NPCAgent } from "./npc-agent";
import { SceneAgent } from "./scene-agent";
import { DirectorAgent } from "./director-agent";
import { CrafterAgent } from "./crafter-agent";
import { ResearcherAgent } from "./researcher-agent";
import { HistorianAgent } from "./historian-agent";
import { CartographerAgent } from "./cartographer-agent";
import { MerchantAgent } from "./merchant-agent";
import { QuestGiverAgent } from "./quest-giver-agent";
import { LorekeeperAgent } from "./lorekeeper-agent";
import { StartResolver } from "./start-resolver";
import { Chronicler } from "./chronicler";
import type { NPCRuntime } from "./npc-runtime";
import type { WorldValidator } from "./world-validator";
import type { UserAgent } from "./user-agent";
import type { SQLiteStore } from "../lib/sqlite-store";
import type { StoryContext } from "../models/story";
import { getLogger } from "../utils/logger";
import { join } from "node:path";
import { t } from "../i18n";

const log = getLogger("roleplay-engine");

const MOVE_PATTERNS = /^(?:go|move|travel|walk|run|head)\s+(?:to|toward|into|for)\b/i;
const TALK_PATTERNS = /^(?:say\s+to|talk\s+to|ask|tell|shout\s+at|whisper\s+to)\b/i;
const AGENT_MENTION = /^@(\S+)\s+(.+)$/;

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
}

interface SessionParams {
  character?: string | null;
  location?: string;
  storyTime?: Date;
  role?: string;
  sessionId?: string | null;
}

export class RoleplayEngine {
  private _dbPath: string;
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _historyMgr: HistoryManager;
  private _worldFrame: Record<string, unknown>;

  // Agents
  readonly narrator: NarratorAgent;
  readonly npcAgent: NPCAgent;
  readonly sceneAgent: SceneAgent;
  readonly directorAgent: DirectorAgent;
  readonly crafter: CrafterAgent;
  readonly researcher: ResearcherAgent;
  readonly historian: ServiceMessageAgent;
  readonly cartographer: ServiceMessageAgent;
  readonly merchant: ServiceMessageAgent;
  readonly questGiver: ServiceMessageAgent;
  readonly lorekeeper: ServiceMessageAgent;
  readonly startResolver: StartResolver;
  readonly chronicler: Chronicler;
  readonly memory: MemoryManager;

  // Session state
  activeCharacter: string | null = null;
  currentLocation = "unknown";
  currentTime = new Date();
  userRole = "protagonist";
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

    this.narrator = new NarratorAgent(deps.llmQueue);
    this.npcAgent = new NPCAgent(deps.llmQueue);
    this.sceneAgent = new SceneAgent(deps.llmQueue);
    this.directorAgent = new DirectorAgent(deps.llmQueue);
    this.crafter = new CrafterAgent(deps.entityStore, deps.llmQueue, deps.dbPath);
    this.researcher = new ResearcherAgent(deps.llmQueue);

    const historianRaw = new HistorianAgent(deps.llmQueue);
    this.historian = { name: "Historian", generateServiceMessage: async (ctx) => {
      const events = (await this.chronicler.getTimeline(new Date(this.currentTime.getTime() - 7 * 24 * 60 * 60 * 1000), 30)).map(e => e.description);
      const worldRules = this._entityStore.allNodes().filter(n => n.entityType === "WorldRule").map(n => n.profile.summary);
      return historianRaw.generate({ query: ctx.message, worldHistory: events, relevantEvents: ctx.recentEvents, worldRules });
    }};

    const cartographerRaw = new CartographerAgent(deps.llmQueue);
    this.cartographer = { name: "Cartographer", generateServiceMessage: async (ctx) => {
      const locations = this._entityStore.listByType("Location").map(l => ({
        name: l.name,
        description: (l.profile.l2.description as string) ?? (l.profile.summary as string) ?? "",
        connections: this._entityStore.allNodes()
          .filter(n => n.entityType === "Relationship" && (n.profile.l1.source === l.uid || n.profile.l1.target === l.uid))
          .map(n => {
            const otherUid = n.profile.l1.source === l.uid ? n.profile.l1.target : n.profile.l1.source;
            const other = this._entityStore.get(otherUid as string);
            return other?.name ?? "";
          })
          .filter(Boolean),
      }));
      return cartographerRaw.generate({ query: ctx.message, locations, currentLocation: ctx.location });
    }};

    const merchantRaw = new MerchantAgent(deps.llmQueue);
    this.merchant = { name: "Merchant", generateServiceMessage: async (ctx) => {
      const items = this._entityStore.listByType("Item").slice(0, 20).map(i => ({
        name: i.name,
        price: (i.profile.l2.price as number) ?? 10,
        quantity: 1,
      }));
      return merchantRaw.generate({ query: ctx.message, merchantName: ctx.character, inventory: items, worldEconomy: ctx.worldRules.join("; ") || "Standard fantasy economy" });
    }};

    const questGiverRaw = new QuestGiverAgent(deps.llmQueue);
    this.questGiver = { name: "Quest Giver", generateServiceMessage: async (ctx) => {
      const quests = this._entityStore.listByType("Quest").map(q => ({
        title: q.name,
        status: (q.profile.l2.status as string) ?? "active",
      }));
      return questGiverRaw.generate({ query: ctx.message, worldState: ctx.recentEvents.join("; ") || "No recent events", activeQuests: quests, nearbyNpcs: ctx.nearbyNpcs, playerLevel: 1 });
    }};

    const lorekeeperRaw = new LorekeeperAgent(deps.llmQueue);
    this.lorekeeper = { name: "Lorekeeper", generateServiceMessage: async (ctx) => {
      const facts = this._entityStore.allNodes().filter(n => n.entityType === "WorldRule" || n.entityType === "Lore").map(n => `${n.name}: ${n.profile.summary}`);
      const races = this._entityStore.listByType("Race").map(r => `${r.name}: ${r.profile.summary}`);
      const magicSystem = this._entityStore.allNodes().filter(n => n.entityType === "MagicSystem").map(n => n.profile.summary).join("; ") || "Not defined";
      return lorekeeperRaw.generate({ query: ctx.message, worldFacts: facts, magicSystem, races });
    }};

    this.startResolver = new StartResolver(deps.entityStore, deps.llmQueue, "director");
    this.chronicler = deps.chronicler ?? new Chronicler(join(deps.dbPath, "timeline.jsonl"));
    this.memory = new MemoryManager(join(deps.dbPath, "roleplay_memory.json"));
  }

  reset(newDbPath: string): void {
    this._dbPath = newDbPath;
    this.memory.reload(join(newDbPath, "roleplay_memory.json"));
    this.currentLocation = "unknown";
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

  async processInput(userInput: string): Promise<string | { agentResponse: { response: string; agentId: string; agentName: string } }> {
    const stripped = userInput.trim();
    if (stripped.startsWith("/")) return this._handleCommand(stripped.slice(1));
    const agentMatch = stripped.match(AGENT_MENTION);
    if (agentMatch) {
      const result = await this.processAgentMessage(agentMatch[1]!, agentMatch[2]!);
      return { agentResponse: result };
    }
    if (MOVE_PATTERNS.test(stripped)) return this._handleMovement(userInput);
    if (TALK_PATTERNS.test(stripped)) return this._handleDialogue(userInput);
    return this._handleGenericAction(userInput);
  }

  async *processInputStream(userInput: string): AsyncGenerator<{ type: string; content?: string; agent_id?: string; agent_name?: string; location?: string; story_time?: string; active_character?: string; error?: string }> {
    const stripped = userInput.trim();

    // Commands — no streaming, return full result
    if (stripped.startsWith("/")) {
      const result = await this._handleCommand(stripped.slice(1));
      yield { type: "chunk", content: result as string };
      yield { type: "done", location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Agent mention — no streaming
    const agentMatch = stripped.match(AGENT_MENTION);
    if (agentMatch) {
      const result = await this.processAgentMessage(agentMatch[1]!, agentMatch[2]!);
      yield { type: "chunk", content: `【${result.agentName}】\n${result.response}` };
      yield { type: "done", agent_id: result.agentId, agent_name: result.agentName, location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Movement — no streaming
    if (MOVE_PATTERNS.test(stripped)) {
      const result = await this._handleMovement(userInput);
      yield { type: "chunk", content: result as string };
      yield { type: "done", location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Dialogue — no streaming
    if (TALK_PATTERNS.test(stripped)) {
      const result = await this._handleDialogue(userInput);
      yield { type: "chunk", content: result as string };
      yield { type: "done", location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
      return;
    }

    // Generic action — STREAM via narrator
    try {
      yield* this._handleGenericActionStream(userInput);
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  async processAgentMessage(agentId: string, message: string): Promise<{ response: string; agentId: string; agentName: string }> {
    const agent = this._getAgentById(agentId);
    if (!agent) {
      return { response: `Unknown agent: ${agentId}. Available: narrator, director, scene, npc, chronicler, story-planner, social-sim, villain, researcher, historian, cartographer, merchant, quest-giver, lorekeeper`, agentId, agentName: agentId };
    }

    const recentEvents = (await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 2 * 60 * 60 * 1000),
      10,
    )).map((e) => e.description);

    const worldRules = this._entityStore.allNodes()
      .filter((n) => n.entityType === "WorldRule")
      .map((n) => n.profile.summary);

    const nearbyNpcs = this._getNearbyNpcs();
    const conversation = this.memory.getRecent(5);

    const response = await agent.generateServiceMessage({
      message,
      location: this.currentLocation,
      character: this.activeCharacter ?? "unknown",
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
      chronicler: { name: "Chronicler", generateServiceMessage: async (ctx) => {
        const timeline = await this.chronicler.getTimeline(new Date(this.currentTime.getTime() - 24 * 60 * 60 * 1000), 20);
        return `The world timeline contains ${timeline.length} events. Recent events:\n${timeline.slice(-5).map(e => `- ${e.description}`).join("\n") || "No recent events."}\n\nYour request: "${ctx.message}"`;
      }},
      "story-planner": { name: "Story Planner", generateServiceMessage: async (ctx) => {
        const planPrompt = `You are a Story Planner for a living narrative world.
World rules: ${ctx.worldRules.join("; ") || "None"}
Recent events: ${ctx.recentEvents.join("; ") || "None"}
Current location: ${ctx.location}
Active character: ${ctx.character}

Your task: Analyze the current narrative state and respond to the player's request.
Provide story arc suggestions, beat recommendations, or plot analysis.

Player request: "${ctx.message}"`;
        return this._llmQueue.generateText(planPrompt, 1, 0.7, "story-planner");
      }},
      "social-sim": { name: "Social Simulator", generateServiceMessage: async (ctx) => {
        const simPrompt = `You are a Social Dynamics Simulator for a living narrative world.
Current location: ${ctx.location}
Nearby NPCs: ${ctx.nearbyNpcs.join(", ") || "none"}
Recent events: ${ctx.recentEvents.join("; ") || "None"}
World rules: ${ctx.worldRules.join("; ") || "None"}

Your task: Analyze social dynamics, simulate NPC interactions, or respond to the player's request.
Consider relationships, moods, and recent events.

Player request: "${ctx.message}"`;
        return this._llmQueue.generateText(simPrompt, 1, 0.7, "social-sim");
      }},
      villain: { name: "Villain Manager", generateServiceMessage: async (ctx) => {
        const villainPrompt = `You are a Villain Manager for a living narrative world.
World rules: ${ctx.worldRules.join("; ") || "None"}
Recent events: ${ctx.recentEvents.join("; ") || "None"}
Current location: ${ctx.location}
Active character: ${ctx.character}

Your task: Plan antagonist actions, analyze villain schemes, or respond to the player's request.
Consider the villain's goals, resources, and opportunities.

Player request: "${ctx.message}"`;
        return this._llmQueue.generateText(villainPrompt, 1, 0.7, "villain");
      }},
      researcher: this.researcher,
      historian: this.historian,
      cartographer: this.cartographer,
      merchant: this.merchant,
      "quest-giver": this.questGiver,
      lorekeeper: this.lorekeeper,
    };
    return agents[agentId] ?? null;
  }

  private async _handleMovement(userInput: string): Promise<string> {
    const lang = t();
    const destMatch = userInput.match(/(?:to|toward|into|for|в|к|на)\s+([a-zA-Zа-яА-ЯёЁ0-9' -]+)/i);
    if (!destMatch) return lang.whereToGo;

    const destination = destMatch[1]?.trim() ?? "";
    const locNode = this._entityStore.getByNameAndType(destination, "Location");
    if (!locNode) return lang.noPlace(destination);

    // Get recent events for scene transition
    const recentEvents = await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 24 * 60 * 60 * 1000),
      10,
    );
    const recentTexts = recentEvents.map((e) => e.description);

    const worldRules = this._entityStore.allNodes()
      .filter((n) => n.entityType === "WorldRule")
      .map((n) => n.profile.summary);

    // Scene agent generates the journey description
    const description = await this.sceneAgent.transition(
      this.currentLocation,
      destination,
      this.activeCharacter ?? "you",
      recentTexts,
      worldRules,
    );

    // Update state
    this.currentLocation = destination;
    this.currentTime = new Date(this.currentTime.getTime() + 10 * 60 * 1000);

    await this.chronicler.logEvent(
      `${this.activeCharacter ?? "Player"} moved to ${destination}`,
      this.currentTime,
      "movement",
    );

    return description;
  }

  private async _handleDialogue(userInput: string): Promise<string> {
    const lang = t();
    const match = userInput.match(
      /(?:say to|talk to|ask|tell|shout at|whisper to|сказать|поговорить|спросить|сказать)\s+([a-zA-Zа-яА-ЯёЁ0-9' -]+?)(?:\s+)(.+)$/i,
    );
    if (!match) {
      const simpleMatch = userInput.match(/(?:talk to|address|поговорить с)\s+([a-zA-Zа-яА-ЯёЁ0-9' -]+)/i);
      if (simpleMatch?.[1]) return lang.toWhom(simpleMatch[1]);
      return lang.whomTalking;
    }

    const npcName = match[1]?.trim() ?? "";
    const playerLine = match[2]?.trim() ?? "";
    if (!playerLine) return lang.whatSay(npcName);

    const npcNode = this._entityStore.getByNameAndType(npcName, "Character");
    if (!npcNode) return lang.noNpc(npcName);

    const personality = (npcNode.profile.l2.personality as string) ?? "friendly and neutral";

    // Get recent events
    const recent = await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 2 * 60 * 60 * 1000),
      5,
    );
    const recentTexts = recent.map((e) => e.description);

    const response = await this.npcAgent.respond(
      npcName,
      personality,
      this.activeCharacter ?? "you",
      this.currentLocation,
      playerLine,
      recentTexts,
    );

    await this.chronicler.logEvent(
      `${this.activeCharacter ?? "Player"} talked to ${npcName}: '${playerLine}'`,
      this.currentTime,
      "dialogue",
    );

    return `${npcName} says: "${response}"`;
  }

  private async _handleGenericAction(userInput: string): Promise<string> {
    const nearbyNpcs = this._getNearbyNpcs();
    const worldRules = this._entityStore.allNodes()
      .filter((n) => n.entityType === "WorldRule")
      .map((n) => `- ${n.name}: ${n.profile.summary}`)
      .join("\n");

    const recentTimeline = (await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 2 * 60 * 60 * 1000),
      10,
    )).map((e) => e.description);

    const context: StoryContext = {
      worldName: (this._worldFrame.title as string) ?? (this._worldFrame.world_name as string) ?? "TrueNeverStory World",
      currentTime: this.currentTime.toISOString(),
      location: this.currentLocation,
      activeCharacter: this.activeCharacter,
      userRole: this.userRole,
      recentTimeline,
      worldRules: worldRules ? worldRules.split("\n") : [],
      nearbyNpcs,
      availableItems: [],
      activeQuests: [],
      directorPlan: null,
      genre: this._worldFrame.genre as string | undefined,
      language: this._worldFrame.language as string | undefined,
      magicSystem: (this._worldFrame.magic_system as Record<string, string>)?.rules,
      worldDescription: this._worldFrame.description as string | undefined,
    };

    const conversation = this.memory.getRecent(5);

    const narrative = await this.narrator.generate(
      context,
      [],
      [],
      conversation,
    );

    await this.chronicler.logEvent(
      `User action: ${userInput}`,
      this.currentTime,
      "user_input",
    );
    this.memory.addEntry(userInput, narrative);

    if (this.activeSessionId) {
      this._historyMgr.addTurn(this.activeSessionId, "user", userInput);
      this._historyMgr.addTurn(this.activeSessionId, "assistant", narrative);
    }

    this.currentTime = new Date(this.currentTime.getTime() + 5 * 60 * 1000);
    return narrative;
  }

  private async *_handleGenericActionStream(userInput: string): AsyncGenerator<{ type: string; content?: string; location?: string; story_time?: string; active_character?: string }> {
    const nearbyNpcs = this._getNearbyNpcs();
    const worldRules = this._entityStore.allNodes()
      .filter((n) => n.entityType === "WorldRule")
      .map((n) => `- ${n.name}: ${n.profile.summary}`)
      .join("\n");

    const recentTimeline = (await this.chronicler.getTimeline(
      new Date(this.currentTime.getTime() - 2 * 60 * 60 * 1000),
      10,
    )).map((e) => e.description);

    const context: StoryContext = {
      worldName: (this._worldFrame.title as string) ?? (this._worldFrame.world_name as string) ?? "TrueNeverStory World",
      currentTime: this.currentTime.toISOString(),
      location: this.currentLocation,
      activeCharacter: this.activeCharacter,
      userRole: this.userRole,
      recentTimeline,
      worldRules: worldRules ? worldRules.split("\n") : [],
      nearbyNpcs,
      availableItems: [],
      activeQuests: [],
      directorPlan: null,
      genre: this._worldFrame.genre as string | undefined,
      language: this._worldFrame.language as string | undefined,
      magicSystem: (this._worldFrame.magic_system as Record<string, string>)?.rules,
      worldDescription: this._worldFrame.description as string | undefined,
    };

    const conversation = this.memory.getRecent(5);

    let fullNarrative = "";
    for await (const chunk of this.narrator.generateStream(context, [], [], conversation)) {
      fullNarrative += chunk;
      yield { type: "chunk", content: chunk };
    }

    await this.chronicler.logEvent(
      `User action: ${userInput}`,
      this.currentTime,
      "user_input",
    );
    this.memory.addEntry(userInput, fullNarrative);

    if (this.activeSessionId) {
      this._historyMgr.addTurn(this.activeSessionId, "user", userInput);
      this._historyMgr.addTurn(this.activeSessionId, "assistant", fullNarrative);
    }

    this.currentTime = new Date(this.currentTime.getTime() + 5 * 60 * 1000);
    yield { type: "done", location: this.currentLocation, story_time: this.currentTime.toISOString(), active_character: this.activeCharacter ?? undefined };
  }

  private _getNearbyNpcs(): string[] {
    const allNodes = this._entityStore.listByType("Character");
    return allNodes
      .filter((n) => n.profile.l2.current_location === this.currentLocation)
      .map((n) => n.name);
  }

  private async _handleCommand(cmd: string): Promise<string> {
    const lang = t();
    const parts = cmd.split(/\s+/);
    const verb = parts[0]?.toLowerCase() ?? "";

    switch (verb) {
      case "help":
        return "Commands: /look, /inventory, /craft, /status, /quests, /time, /save, /quit, /party [add|remove], /attack <target>\n@agent <id> <msg> — private message to an agent (e.g. @narrator describe the forest)\n/craft list — available recipes\n/craft <recipe_id> — craft an item\n/craft suggest <item1> <item2> — get LLM suggestion";
      case "look": {
        const locNode = this._entityStore.getByNameAndType(this.currentLocation, "Location");
        if (locNode) {
          const desc = (locNode.profile.l2.description as string) ?? lang.youSee;
          return `You look around. ${desc}`;
        }
        return lang.youSeeNothing;
      }
      case "inventory": {
        if (!this.activeCharacter) return lang.noCharacter;
        const inv = this.crafter.scanInventory(this.activeCharacter);
        if (inv.size === 0) return lang.crafterInventoryEmpty;
        const lines = ["Inventory:"];
        for (const [name, count] of inv) {
          lines.push(`  ${count > 1 ? `${count}x ` : ""}${name}`);
        }
        const craftable = this.crafter.findCraftable(inv);
        if (craftable.length > 0) {
          lines.push("\nCan craft:");
          for (const r of craftable) {
            lines.push(`  ${r.name} (${r.nameRu}): ${r.ingredients.join(" + ")}`);
          }
        }
        return lines.join("\n");
      }
      case "craft": {
        if (!this.activeCharacter) return lang.noCharacter;
        const subcommand = parts[1]?.toLowerCase() ?? "";

        if (subcommand === "list") {
          const recipes = this.crafter.getRecipes();
          if (recipes.length === 0) return "No recipes known.";
          const inv = this.crafter.scanInventory(this.activeCharacter);
          const lines = ["Known recipes:"];
          for (const r of recipes) {
            const canCraft = this.crafter.findCraftable(inv).some((cr) => cr.id === r.id);
            const mark = canCraft ? " ✓" : "";
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(" + ")} → ${r.result} [${r.difficulty}]${mark}`);
          }
          lines.push("\n/craft <recipe_id> to craft | /craft suggest <item1> <item2> for ideas");
          return lines.join("\n");
        }

        if (subcommand === "suggest") {
          const item1 = parts[2] ?? "";
          const item2 = parts[3] ?? "";
          if (!item1 || !item2) return lang.crafterSuggestion("item1", "item2");
          const worldRules = this._entityStore.allNodes()
            .filter((n) => n.entityType === "WorldRule")
            .map((n) => n.profile.summary)
            .join("; ");
          const suggestion = await this.crafter.suggestRecipe(item1, item2, worldRules);
          return suggestion;
        }

        if (subcommand) {
          const result = this.crafter.craft(subcommand, this.activeCharacter);
          if (result.success) {
            await this.chronicler.logEvent(
              `${this.activeCharacter} crafted ${result.result}`,
              this.currentTime,
              "crafting",
            );
            return lang.crafterCrafted(result.result ?? subcommand, subcommand);
          }
          return result.message;
        }

        // No subcommand — show what can be crafted
        const inv = this.crafter.scanInventory(this.activeCharacter);
        const craftable = this.crafter.findCraftable(inv);
        const almost = this.crafter.findAlmostCraftable(inv);
        const lines: string[] = [];

        if (craftable.length > 0) {
          lines.push("Can craft now:");
          for (const r of craftable) {
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(" + ")} → ${r.result}`);
          }
        }

        if (almost.length > 0) {
          lines.push("\nAlmost ready (need 1 more ingredient):");
          for (const { recipe, missing } of almost) {
            lines.push(`  ${recipe.id}: ${recipe.name} — need: ${missing.join(", ")}`);
          }
        }

        if (craftable.length === 0 && almost.length === 0) {
          return lang.crafterNothingToCraft;
        }

        lines.push("\n/craft <recipe_id> to craft");
        return lines.join("\n");
      }
      case "status": {
        return `Location: ${this.currentLocation}\nCharacter: ${this.activeCharacter ?? "none"}\nTime: ${this.currentTime.toISOString()}`;
      }
      case "quests":
        return lang.noQuests;
      case "time":
        return `Story time: ${this.currentTime.toISOString()}`;
      case "save":
        return lang.sessionSaved;
      case "quit":
        return lang.goodbye;
      case "party": {
        if (!this._userAgent) return "Party system not available.";
        const subcmd = parts.slice(1);
        return this._userAgent.handlePartyCommand(subcmd);
      }
      case "attack": {
        if (!this._userAgent) return "Attack system not available.";
        const target = parts[1];
        if (!target) return "Usage: /attack <target>";
        return this._userAgent.handleAttack(target, this.activeCharacter, this.currentLocation, this.currentTime);
      }
      default:
        return lang.unknownCommand(verb);
    }
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
