import type { NPCRuntime } from "./npc-runtime";
import type { SocialGraph } from "./social-graph";
import type { MemoryEngine } from "./memory-engine";
import { getWorldLanguage } from "./agent-config";

const FACTIONS = ["guards", "thieves", "merchants", "nobles", "peasants"];

const LANG_HINT: Record<string, string> = {
  en: "Always respond in English.",
  ru: "Всегда отвечай на русском языке.",
  de: "Antworte immer auf Deutsch.",
  fr: "Réponds toujours en français.",
  es: "Responde siempre en español.",
  ja: "常に日本語で回答してください。",
  zh: "请始终用中文回复。",
};

export class DialogueContext {
  private _runtime: NPCRuntime;
  private _social: SocialGraph;
  private _memory: MemoryEngine;

  constructor(runtime: NPCRuntime, social: SocialGraph, memory: MemoryEngine) {
    this._runtime = runtime;
    this._social = social;
    this._memory = memory;
  }

  async buildContext(npcName: string, playerOrNpc: string, line: string): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "";

    const parts: string[] = [];

    parts.push(`You are ${npcName}.`);
    parts.push(`Current mood: ${profile.mood}`);
    parts.push(`Location: ${profile.location}`);

    const rel = this._social.getRelationship(npcName, playerOrNpc);
    if (rel) {
      parts.push(`Relationship with ${playerOrNpc}: ${rel.type} (strength: ${rel.strength.toFixed(2)})`);
    }

    const faction = this._findFaction(npcName);
    if (faction) {
      parts.push(`Faction: ${faction}`);
      const details = this._social.getFactionDetails(faction);
      if (details?.leader) parts.push(`Faction leader: ${details.leader}`);
    }

    const lord = this._social.getFeudalLord(npcName);
    if (lord) {
      parts.push(`Your lord: ${lord}`);
    }

    const vassals = this._social.getFeudalVassals(npcName);
    if (vassals.length > 0) {
      parts.push(`Your vassals: ${vassals.join(", ")}`);
    }

    if (faction) {
      const allies = this._social.getActiveAlliances(faction);
      if (allies.length > 0) {
        const alliedNames = allies.map(a => a.faction1 === faction ? a.faction2 : a.faction1);
        parts.push(`Allied factions: ${alliedNames.join(", ")}`);
      }
      const summary = this._social.getFactionSummary(faction);
      if (summary.enemies.length > 0) {
        parts.push(`Enemy factions: ${summary.enemies.join(", ")}`);
      }
    }

    const recentMemories = await this._memory.search(npcName, playerOrNpc);
    if (recentMemories.length > 0) {
      parts.push(`Recent memories with ${playerOrNpc}:`);
      for (const mem of recentMemories.slice(0, 3)) {
        parts.push(`- ${mem.description}`);
      }
    }

    if (profile.goals.length > 0) {
      parts.push(`Current goals: ${profile.goals.join(", ")}`);
    }

    if (profile.inventory.length > 0) {
      parts.push(`Has: ${profile.inventory.join(", ")}`);
    }

    parts.push(`\n${playerOrNpc} says: "${line}"`);
    parts.push(`\nRespond as ${npcName}.`);

    const lang = getWorldLanguage();
    if (LANG_HINT[lang]) parts.push(`\n${LANG_HINT[lang]}`);

    return parts.join("\n");
  }

  private _findFaction(name: string): string | null {
    for (const faction of FACTIONS) {
      const members = this._social.getFactionMembers(faction);
      if (members.includes(name)) return faction;
    }
    return null;
  }

  async generateSystemPrompt(npcName: string): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "You are an NPC.";

    const parts: string[] = [];
    parts.push(`You are roleplaying as ${npcName}.`);
    parts.push(`Personality based on mood: ${profile.mood}.`);
    parts.push(`Location: ${profile.location}.`);

    const rels = this._social.getRelationships(npcName);
    if (rels.length > 0) {
      parts.push(`Known relationships:`);
      for (const rel of rels.slice(0, 5)) {
        parts.push(`- ${rel.target}: ${rel.type}`);
      }
    }

    const lord = this._social.getFeudalLord(npcName);
    const vassals = this._social.getFeudalVassals(npcName);
    if (lord || vassals.length > 0) {
      parts.push(`Feudal ties:`);
      if (lord) parts.push(`- Sworn to: ${lord}`);
      if (vassals.length > 0) parts.push(`- Vassals: ${vassals.join(", ")}`);
    }

    const faction = this._findFaction(npcName);
    if (faction) {
      const summary = this._social.getFactionSummary(faction);
      parts.push(`Faction: ${faction} (${summary.type}, influence: ${summary.influence})`);
      if (summary.leader) parts.push(`Your faction leader: ${summary.leader}`);
      if (summary.allies.length > 0) parts.push(`Allied with: ${summary.allies.join(", ")}`);
      if (summary.enemies.length > 0) parts.push(`At war with: ${summary.enemies.join(", ")}`);
    }

    const memories = await this._memory.getRecentContext(npcName, 3);
    if (memories) {
      parts.push(`Recent experiences:\n${memories}`);
    }

    if (profile.goals.length > 0) {
      parts.push(`Goals: ${profile.goals.join(", ")}`);
    }

    parts.push(`\nStay in character. Respond naturally in first person.`);
    parts.push(`Include actions in asterisks if appropriate.`);

    const lang = getWorldLanguage();
    if (LANG_HINT[lang]) parts.push(`\n${LANG_HINT[lang]}`);

    return parts.join("\n");
  }

  async getConversationContext(npcName: string, history: string[]): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "";

    const parts: string[] = [];
    parts.push(`Context for ${npcName}:`);
    parts.push(`Mood: ${profile.mood}`);
    parts.push(`Health: ${profile.health}%`);

    if (history.length > 0) {
      parts.push(`Recent conversation:`);
      for (const msg of history.slice(-3)) {
        parts.push(`- ${msg}`);
      }
    }

    return parts.join("\n");
  }
}
