import { describe, it, expect, beforeEach } from "bun:test";
import { UserAgent } from "./user-agent";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode, LayeredProfile } from "../models/entity";
import { NPCRuntime } from "./npc-runtime";
import { Chronicler } from "./chronicler";
import { WorldValidator } from "./world-validator";
import { LLMQueue } from "../lib/llm-queue";
import { LLMClient } from "../lib/llm-client";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-ua-test-${Date.now()}`);

function makeNode(name: string): EntityNode {
  return new EntityNode({
    uid: `Character:${name}`,
    name,
    entity_type: "Character",
    profile: new LayeredProfile(
      { name, type: "Character", group: "characters", summary: name, tags: [], relationships: [] },
      { personality: "friendly", current_location: "Village" },
      {},
    ).toDict(),
    group_id: "characters",
  });
}

describe("UserAgent", () => {
  let ua: UserAgent;
  let store: UnifiedEntityStore;
  let npcRuntime: NPCRuntime;
  let chronicler: Chronicler;
  let validator: WorldValidator;

  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    store = new UnifiedEntityStore(join(TMP, "entities.json"));
    store.add(makeNode("Alice"));
    store.add(makeNode("Bob"));

    npcRuntime = new NPCRuntime(TMP, store, null as unknown as LLMQueue, null);
    chronicler = new Chronicler(join(TMP, "timeline.jsonl"));
    validator = new WorldValidator(store, {});
    ua = new UserAgent(store, null as unknown as LLMQueue, npcRuntime, chronicler, validator);
  });

  it("shows empty party", () => {
    expect(ua.handlePartyCommand([])).toBe("Your party is empty.");
  });

  it("adds member to party", () => {
    const result = ua.handlePartyCommand(["add", "Alice"]);
    expect(result).toBe("Alice joined the party.");
    expect(ua.party).toContain("Alice");
  });

  it("rejects duplicate party add", () => {
    ua.handlePartyCommand(["add", "Alice"]);
    const result = ua.handlePartyCommand(["add", "Alice"]);
    expect(result).toContain("already in the party");
  });

  it("rejects unknown character", () => {
    const result = ua.handlePartyCommand(["add", "Unknown"]);
    expect(result).toContain("Unknown character");
  });

  it("removes member from party", () => {
    ua.handlePartyCommand(["add", "Alice"]);
    const result = ua.handlePartyCommand(["remove", "Alice"]);
    expect(result).toBe("Alice left the party.");
    expect(ua.party).not.toContain("Alice");
  });

  it("rejects remove of non-member", () => {
    const result = ua.handlePartyCommand(["remove", "Alice"]);
    expect(result).toContain("not in party");
  });

  it("shows party with status", () => {
    ua.handlePartyCommand(["add", "Alice"]);
    const result = ua.handlePartyCommand([]);
    expect(result).toContain("Alice");
    expect(result).toContain("Party members:");
  });

  it("handles unknown subcommand", () => {
    const result = ua.handlePartyCommand(["dance"]);
    expect(result).toContain("Unknown party command");
  });

  it("extracts facts from text", () => {
    const facts = ua.extractFacts("Alice knows the secret. Bob has the key.");
    expect(facts).toContain("Alice knows about secret");
    expect(facts).toContain("Bob knows about key");
  });

  it("extracts no facts from empty text", () => {
    expect(ua.extractFacts("")).toHaveLength(0);
  });
});
