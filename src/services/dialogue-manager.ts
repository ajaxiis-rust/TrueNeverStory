/**
 * DialogueManager — NPC conversation system.
 * Manages dialogue sessions, history, topics, and contextual responses.
 */

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson } from "../lib/atomic-io";
import type { NPCRuntime } from "./npc-runtime";
import type { SocialGraph } from "./social-graph";
import type { DialogueContext } from "./dialogue-context";

export type DialogueState = "greeting" | "active" | "farewell" | "idle";

export type TopicCategory =
  | "personal"
  | "faction"
  | "location"
  | "quest"
  | "rumor"
  | "trade"
  | "weather"
  | "gossip"
  | "feudal"
  | "combat"
  | "crafting";

export interface DialogueMessage {
  role: "player" | "npc";
  content: string;
  timestamp: string;
  topic?: TopicCategory;
  mood?: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  topic: TopicCategory;
  requiredRelationship?: number;
  requiredFaction?: string;
}

export interface DialogueSession {
  id: string;
  npcName: string;
  playerCharacter: string;
  state: DialogueState;
  messages: DialogueMessage[];
  currentTopic: TopicCategory | null;
  turnCount: number;
  startedAt: string;
  lastActivity: string;
}

export interface GreetingTemplate {
  mood: string;
  relationship: string;
  text: string;
}

export interface TopicInfo {
  category: TopicCategory;
  label: string;
  description: string;
  available: boolean;
  reason?: string;
}

const GREETINGS: GreetingTemplate[] = [
  { mood: "happy", relationship: "friend", text: "Ah, {player}! Wonderful to see you again!" },
  { mood: "happy", relationship: "neutral", text: "Greetings, {player}. What brings you here?" },
  { mood: "happy", relationship: "enemy", text: "{player}... I see you've found the courage to show your face." },
  { mood: "neutral", relationship: "friend", text: "Hey {player}, good to see you." },
  { mood: "neutral", relationship: "neutral", text: "Hello there. Can I help you?" },
  { mood: "neutral", relationship: "enemy", text: "{player}. State your business." },
  { mood: "anxious", relationship: "friend", text: "{player}! Thank the gods you're here. I need to talk to you." },
  { mood: "anxious", relationship: "neutral", text: "Oh... {player}. Now is not a good time." },
  { mood: "anxious", relationship: "enemy", text: "You again? I have nothing to say to you." },
  { mood: "determined", relationship: "friend", text: "{player}, perfect timing. We have work to do." },
  { mood: "determined", relationship: "neutral", text: "{player}. I'm busy, but I'll hear you out." },
  { mood: "determined", relationship: "enemy", text: "{player}. Whatever you want, make it quick." },
];

const FAREWELLS: GreetingTemplate[] = [
  { mood: "happy", relationship: "friend", text: "Until next time, {player}! Stay safe out there." },
  { mood: "happy", relationship: "neutral", text: "Farewell, {player}. May your path be clear." },
  { mood: "happy", relationship: "enemy", text: "Leave now, {player}. While you still can." },
  { mood: "neutral", relationship: "friend", text: "Take care, {player}. I'll be here." },
  { mood: "neutral", relationship: "neutral", text: "Goodbye. Come again if you need anything." },
  { mood: "neutral", relationship: "enemy", text: "Don't come back, {player}." },
  { mood: "anxious", relationship: "friend", text: "{player}... be careful out there. I fear what's coming." },
  { mood: "anxious", relationship: "neutral", text: "I need to be alone. Goodbye." },
  { mood: "anxious", relationship: "enemy", text: "Just go. Please." },
  { mood: "determined", relationship: "friend", text: "We'll speak again, {player}. There's much to discuss." },
  { mood: "determined", relationship: "neutral", text: "I have matters to attend to. Farewell." },
  { mood: "determined", relationship: "enemy", text: "Next time we meet, {player}, things will be different." },
];

const TOPIC_LABELS: Record<TopicCategory, string> = {
  personal: "About yourself",
  faction: "Faction matters",
  location: "This place",
  quest: "I need your help",
  rumor: "Have you heard?",
  trade: "Business",
  weather: "The weather",
  gossip: "Gossip",
  feudal: "Feudal affairs",
  combat: "Fighting",
  crafting: "Crafting",
};

export class DialogueManager {
  private _statePath: string;
  private _runtime: NPCRuntime;
  private _social: SocialGraph;
  private _context: DialogueContext;
  private _sessions: Map<string, DialogueSession> = new Map();

  constructor(statePath: string, runtime: NPCRuntime, social: SocialGraph, context: DialogueContext) {
    this._statePath = statePath;
    this._runtime = runtime;
    this._social = social;
    this._context = context;

    const dir = join(statePath, "dialogue");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
  }

  private _sessionKey(npc: string, player: string): string {
    return `${npc}::${player}`;
  }

  private _load(): void {
    const path = join(this._statePath, "dialogue", "sessions.json");
    if (!existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data.sessions) {
        for (const [key, session] of Object.entries(data.sessions)) {
          this._sessions.set(key, session as DialogueSession);
        }
      }
    } catch {
      // ignore corrupt data
    }
  }

  private async _save(): Promise<void> {
    const data = { sessions: Object.fromEntries(this._sessions) };
    await atomicWriteJson(join(this._statePath, "dialogue", "sessions.json"), data);
  }

  private _getRelationship(npc: string, player: string): string {
    const rel = this._social.getRelationship(npc, player);
    if (!rel) return "neutral";
    if (rel.type === "enemy") return "enemy";
    if (rel.strength >= 0.7) return "friend";
    if (rel.strength <= -0.5) return "enemy";
    return "neutral";
  }

  private _getMood(npc: string): string {
    return this._runtime.get(npc)?.mood ?? "neutral";
  }

  private _matchTemplate(
    templates: GreetingTemplate[],
    mood: string,
    relationship: string,
    player: string,
  ): string {
    const exact = templates.find(t => t.mood === mood && t.relationship === relationship);
    if (exact) return exact.text.replace("{player}", player);

    const moodMatch = templates.find(t => t.mood === mood && t.relationship === "neutral");
    if (moodMatch) return moodMatch.text.replace("{player}", player);

    const fallback = templates.find(t => t.mood === "neutral" && t.relationship === relationship);
    if (fallback) return fallback.text.replace("{player}", player);

    return templates.find(t => t.mood === "neutral" && t.relationship === "neutral")!.text.replace("{player}", player);
  }

  startSession(npcName: string, playerCharacter: string): DialogueSession {
    const key = this._sessionKey(npcName, playerCharacter);
    const existing = this._sessions.get(key);
    if (existing && existing.state !== "idle") return existing;

    const session: DialogueSession = {
      id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      npcName,
      playerCharacter,
      state: "greeting",
      messages: [],
      currentTopic: null,
      turnCount: 0,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this._sessions.set(key, session);
    this._save();
    return session;
  }

  async getGreeting(npcName: string, playerCharacter: string): Promise<string> {
    const profile = this._runtime.get(npcName);
    const mood = profile?.mood ?? "neutral";
    const relationship = this._getRelationship(npcName, playerCharacter);

    const session = this.startSession(npcName, playerCharacter);
    const key = this._sessionKey(npcName, playerCharacter);

    let text = this._matchTemplate(GREETINGS, mood, relationship, playerCharacter);

    const vassals = this._social.getFeudalVassals(npcName);
    if (vassals.includes(playerCharacter)) {
      text = `Ah, my loyal vassal ${playerCharacter}. What do you need?`;
    }

    const lord = this._social.getFeudalLord(npcName);
    if (lord === playerCharacter) {
      text = `${playerCharacter}! My lord. I am at your service.`;
    }

    const msg: DialogueMessage = {
      role: "npc",
      content: text,
      timestamp: new Date().toISOString(),
      mood,
    };
    session.messages.push(msg);
    session.state = "active";
    session.lastActivity = new Date().toISOString();
    await this._save();

    return text;
  }

  async getFarewell(npcName: string, playerCharacter: string): Promise<string> {
    const mood = this._getMood(npcName);
    const relationship = this._getRelationship(npcName, playerCharacter);

    let text = this._matchTemplate(FAREWELLS, mood, relationship, playerCharacter);

    const session = this._sessions.get(this._sessionKey(npcName, playerCharacter));
    if (session) {
      const npcMsgs = session.messages.filter(m => m.role === "npc");
      if (npcMsgs.length >= 3) {
        text = `It was a good conversation, ${playerCharacter}. Until we meet again.`;
      }
      session.state = "farewell";
      session.lastActivity = new Date().toISOString();
    }

    return text;
  }

  endSession(npcName: string, playerCharacter: string): void {
    const key = this._sessionKey(npcName, playerCharacter);
    const session = this._sessions.get(key);
    if (session) {
      session.state = "idle";
      this._save();
    }
  }

  getSession(npcName: string, playerCharacter: string): DialogueSession | undefined {
    return this._sessions.get(this._sessionKey(npcName, playerCharacter));
  }

  getHistory(npcName: string, playerCharacter: string, limit = 20): DialogueMessage[] {
    const session = this._sessions.get(this._sessionKey(npcName, playerCharacter));
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  getAvailableTopics(npcName: string, playerCharacter: string): TopicInfo[] {
    const profile = this._runtime.get(npcName);
    const relationship = this._getRelationship(npcName, playerCharacter);
    const faction = this._findFaction(npcName);
    const lord = this._social.getFeudalLord(npcName);

    const topics: TopicInfo[] = [];

    topics.push({
      category: "personal",
      label: TOPIC_LABELS.personal,
      description: `Ask about ${npcName}'s life`,
      available: true,
    });

    topics.push({
      category: "weather",
      label: TOPIC_LABELS.weather,
      description: "Small talk about the weather",
      available: true,
    });

    topics.push({
      category: "location",
      label: TOPIC_LABELS.location,
      description: `Ask about ${profile?.location ?? "this place"}`,
      available: true,
    });

    if (relationship === "friend" || relationship === "neutral") {
      topics.push({
        category: "quest",
        label: TOPIC_LABELS.quest,
        description: "Ask for a task or favor",
        available: true,
      });
    }

    if (faction) {
      topics.push({
        category: "faction",
        label: TOPIC_LABELS.faction,
        description: `Discuss ${faction} matters`,
        available: true,
      });
    }

    if (lord) {
      topics.push({
        category: "feudal",
        label: TOPIC_LABELS.feudal,
        description: `Discuss feudal affairs with ${lord}`,
        available: true,
      });
    }

    if (relationship === "friend" || relationship === "neutral") {
      topics.push({
        category: "rumor",
        label: TOPIC_LABELS.rumor,
        description: "Share or hear rumors",
        available: true,
      });
      topics.push({
        category: "gossip",
        label: TOPIC_LABELS.gossip,
        description: "Talk about other NPCs",
        available: true,
      });
    }

    if (profile?.skills.combat_skill && profile.skills.combat_skill > 0.6) {
      topics.push({
        category: "combat",
        label: TOPIC_LABELS.combat,
        description: "Discuss fighting and training",
        available: true,
      });
    }

    if (profile?.inventory && profile.inventory.length > 0) {
      topics.push({
        category: "trade",
        label: TOPIC_LABELS.trade,
        description: "Buy, sell, or trade items",
        available: true,
      });
    }

    if (relationship === "enemy") {
      topics.push({
        category: "combat",
        label: TOPIC_LABELS.combat,
        description: "Challenge or threaten",
        available: true,
      });
    }

    return topics;
  }

  getChoices(npcName: string, playerCharacter: string): DialogueChoice[] {
    const topics = this.getAvailableTopics(npcName, playerCharacter);
    return topics.map(t => ({
      id: `${t.category}_${Date.now()}`,
      text: t.label,
      topic: t.category,
    }));
  }

  async addMessage(
    npcName: string,
    playerCharacter: string,
    role: "player" | "npc",
    content: string,
    topic?: TopicCategory,
  ): Promise<void> {
    const key = this._sessionKey(npcName, playerCharacter);
    let session = this._sessions.get(key);
    if (!session || session.state === "idle") {
      session = this.startSession(npcName, playerCharacter);
    }

    const msg: DialogueMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
      topic,
      mood: role === "npc" ? this._getMood(npcName) : undefined,
    };

    session.messages.push(msg);
    session.turnCount++;
    session.lastActivity = new Date().toISOString();
    if (topic) session.currentTopic = topic;

    await this._save();
  }

  async buildDialoguePrompt(npcName: string, playerCharacter: string, playerLine: string): Promise<string> {
    return this._context.buildContext(npcName, playerCharacter, playerLine);
  }

  private _findFaction(name: string): string | null {
    const factions = ["guards", "thieves", "merchants", "nobles", "peasants"];
    for (const f of factions) {
      if (this._social.getFactionMembers(f).includes(name)) return f;
    }
    return null;
  }

  async recordDialogueMemory(
    npcName: string,
    playerCharacter: string,
    summary: string,
    importance = 0.5,
  ): Promise<void> {
    const session = this._sessions.get(this._sessionKey(npcName, playerCharacter));
    const topic = session?.currentTopic ?? "personal";
    await this._runtime.addMemory(
      npcName,
      `Conversation with ${playerCharacter} about ${topic}: ${summary}`,
      this._getMood(npcName),
      importance,
      [playerCharacter],
    );
  }

  getSessionStats(npcName: string, playerCharacter: string): {
    totalTurns: number;
    topicsDiscussed: TopicCategory[];
    playerMessages: number;
    npcMessages: number;
    duration: number;
  } | null {
    const session = this._sessions.get(this._sessionKey(npcName, playerCharacter));
    if (!session) return null;

    const playerMsgs = session.messages.filter(m => m.role === "player");
    const npcMsgs = session.messages.filter(m => m.role === "npc");
    const topics = [...new Set(session.messages.map(m => m.topic).filter(Boolean))] as TopicCategory[];

    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.lastActivity).getTime();

    return {
      totalTurns: session.turnCount,
      topicsDiscussed: topics,
      playerMessages: playerMsgs.length,
      npcMessages: npcMsgs.length,
      duration: end - start,
    };
  }
}
