/**
 * UserAgent — party system, combat, and fact extraction.
 * Extracted from world_narrative/user_agent.py (party + attack + _extract_facts).
 *
 * Integrates with RoleplayEngine as extension commands.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import type { LLMQueue } from "../lib/llm-queue";
import type { NPCRuntime } from "./npc-runtime";
import type { Chronicler } from "./chronicler";
import type { WorldValidator } from "./world-validator";
import { getLogger } from "../utils/logger";

const log = getLogger("user-agent");

const FACT_PATTERN = /([A-Z][a-z]+)\s+(?:knows|has|owns|saw|heard)\s+(?:the\s+)?([a-z']+)/g;

export class UserAgent {
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _npcRuntime: NPCRuntime;
  private _chronicler: Chronicler;
  private _validator: WorldValidator;
  private _party: string[] = [];
  private _agentId: string | undefined;

  constructor(
    entityStore: UnifiedEntityStore,
    llmQueue: LLMQueue,
    npcRuntime: NPCRuntime,
    chronicler: Chronicler,
    validator: WorldValidator,
    agentId?: string,
  ) {
    this._entityStore = entityStore;
    this._llmQueue = llmQueue;
    this._npcRuntime = npcRuntime;
    this._chronicler = chronicler;
    this._validator = validator;
    this._agentId = agentId;
  }

  get party(): readonly string[] {
    return this._party;
  }

  handlePartyCommand(parts: string[]): string {
    const subcmd = parts[0]?.toLowerCase();
    if (!subcmd) return this._showParty();
    if (subcmd === "add" && parts[1]) return this._partyAdd(parts[1]);
    if (subcmd === "remove" && parts[1]) return this._partyRemove(parts[1]);
    return `Unknown party command: ${subcmd}. Use /party, /party add <name>, or /party remove <name>`;
  }

  private _showParty(): string {
    if (this._party.length === 0) return "Your party is empty.";
    const lines = ["Party members:"];
    for (const member of this._party) {
      const state = this._npcRuntime.get(member);
      if (state) {
        lines.push(`- ${member}: ${state.location} (HP: ${state.health}, Mood: ${state.mood})`);
      } else {
        lines.push(`- ${member}`);
      }
    }
    return lines.join("\n");
  }

  private _partyAdd(name: string): string {
    const node = this._entityStore.getByNameAndType(name, "Character");
    if (!node) return `Unknown character '${name}'.`;
    if (this._party.includes(name)) return `${name} is already in the party.`;
    this._party.push(name);
    return `${name} joined the party.`;
  }

  private _partyRemove(name: string): string {
    const idx = this._party.indexOf(name);
    if (idx === -1) return `${name} not in party.`;
    this._party.splice(idx, 1);
    return `${name} left the party.`;
  }

  async handleAttack(
    target: string,
    activeCharacter: string | null,
    currentLocation: string,
    currentTime: Date,
  ): Promise<string> {
    const character = activeCharacter ?? "user";

    const { isValid, message } = await this._validator.validateAction(character, "attack", currentLocation);
    if (!isValid) return message;

    const targetNode = this._entityStore.getByNameAndType(target, "Character");
    if (!targetNode) return `No character named '${target}' found here.`;

    const prompt = `Simulate a fight between ${character} and ${target} in location ${currentLocation}.
Consider their abilities, equipment, and the situation.
Provide a brief narrative outcome (2-3 sentences) and indicate if anyone was injured.
Return JSON: {"outcome": "narrative text", "damage_taken": 0, "damage_dealt": 0, "victory": false}`;

    try {
      const result = await this._llmQueue.generateJson(prompt, 1, 0.7, this._agentId) as Record<string, unknown>;
      const outcome = (result.outcome as string) ?? "The fight concluded.";
      const damageTaken = Number(result.damage_taken) || 0;
      const damageDealt = Number(result.damage_dealt) || 0;
      const victory = Boolean(result.victory);

      if (damageTaken > 0 && activeCharacter) {
        await this._npcRuntime.adjustHealth(activeCharacter, -damageTaken);
      }
      if (damageDealt > 0) {
        await this._npcRuntime.adjustHealth(target, -damageDealt);
      }

      await this._chronicler.logEvent(
        `${character} attacked ${target}: ${outcome}`,
        currentTime,
        "combat",
      );

      let msg = outcome;
      if (damageTaken > 0) msg += ` You took ${damageTaken} damage.`;
      if (damageDealt > 0) msg += ` ${target} took ${damageDealt} damage.`;
      msg += victory ? " Victory!" : " Defeat!";
      return msg;
    } catch (err) {
      log.warn({ err }, "Combat generation failed");
      return `The attack on ${target} failed.`;
    }
  }

  extractFacts(text: string): string[] {
    const facts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = FACT_PATTERN.exec(text)) !== null) {
      facts.push(`${match[1]} knows about ${match[2]}`);
    }
    return facts;
  }

  async moveParty(location: string, storyTime: Date): Promise<void> {
    for (const member of this._party) {
      await this._npcRuntime.move(member, location, storyTime);
    }
  }
}
