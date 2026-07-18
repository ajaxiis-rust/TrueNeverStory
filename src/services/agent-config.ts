/**
 * Agent Configuration — split into global and per-world.
 *
 * Global (conf/agents.json): model assignments, provider, temperature, maxTokens
 * Per-world (worlds/<name>/agents/<id>.json): prompts (systemPrompt, userTemplate, outputFormat)
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { getConfig } from "../config/env";
import { getLogger } from "../utils/logger";
import { SQLiteStore } from "../lib/sqlite-store";

const log = getLogger("agent-config");

export interface AgentPromptConfig {
  systemPrompt: string;
  userTemplate: string;
  outputFormat: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  priority: number;
  prompts: AgentPromptConfig;
}

export interface AgentAssignment {
  agentId: string;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
}

// ── Global config paths ──

function getConfPath(): string {
  return getConfig().CONF_PATH;
}

function getGlobalAgentsPath(): string {
  return join(getConfPath(), "agents.json");
}

// ── Per-world config paths ──

function getWorldAgentsDir(): string {
  const cfg = getConfig();
  const worldsRoot = cfg.WORLDS_ROOT;
  const defaultPath = join(worldsRoot, "default");
  if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true });

  let activeWorld = "default";
  const settingsPath = join(getConfPath(), "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const data = readJsonFileSync<{ activeWorld?: string }>(settingsPath);
      activeWorld = data?.activeWorld ?? "default";
    } catch (e) {
      log.debug({ err: e, path: settingsPath }, "Failed to read active world config");
    }
  }

  const dir = join(worldsRoot, activeWorld, "agents");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getWorldAgentPath(agentId: string): string {
  return join(getWorldAgentsDir(), `${agentId}.json`);
}

// ── SQLite helpers ──

export function getActiveWorld(): string {
  const cfg = getConfig();
  const worldsRoot = cfg.WORLDS_ROOT;
  const settingsPath = join(getConfPath(), "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const data = readJsonFileSync<{ activeWorld?: string }>(settingsPath);
      return data?.activeWorld ?? "default";
    } catch (e) {
      log.debug({ err: e, path: settingsPath }, "Failed to read active world config");
    }
  }
  return "default";
}

function getWorldDbPath(world?: string): string {
  const cfg = getConfig();
  const worldsRoot = cfg.WORLDS_ROOT;
  const w = world ?? getActiveWorld();
  return join(worldsRoot, w);
}

export function getWorldLanguage(world?: string): string {
  const dbPath = getWorldDbPath(world);
  const worldFramePath = join(dbPath, "world_frame.json");
  if (existsSync(worldFramePath)) {
    try {
      const frame = readJsonFileSync<{ language?: string }>(worldFramePath);
      return frame?.language ?? "en";
    } catch (e) {
      log.debug({ err: e, path: worldFramePath }, "Failed to read world language config");
    }
  }
  return "en";
}

function getStoreForWorld(world?: string): SQLiteStore {
  const dbPath = getWorldDbPath(world);
  return new SQLiteStore(dbPath);
}

// ── Default agent list ──

export const DEFAULT_AGENTS = [
  { id: "narrator", name: "Narrator", description: "Generates world narrative from story context", priority: 10 },
  { id: "director", name: "Director", description: "Integrates story beats and plot hooks into narrative", priority: 8 },
  { id: "scene", name: "Scene Generator", description: "Generates scene transition narratives when characters move", priority: 7 },
  { id: "npc", name: "NPC Agent", description: "Generates NPC dialogue and reactions", priority: 9 },
  { id: "chronicler", name: "Chronicler", description: "Summarizes events and maintains world timeline", priority: 5 },
  { id: "story-planner", name: "Story Planner", description: "Plans story arcs, quests, and plot developments", priority: 6 },
  { id: "social-sim", name: "Social Simulator", description: "Simulates NPC relationships and social dynamics", priority: 4 },
  { id: "villain", name: "Villain Manager", description: "Manages antagonist actions and evil schemes", priority: 6 },
  { id: "researcher", name: "Researcher", description: "Fact-checking, realism validation, and world-building research", priority: 3 },
  { id: "historian", name: "Historian", description: "World history, chronology, and historical events", priority: 6 },
  { id: "cartographer", name: "Cartographer", description: "Maps, locations, distances, and geography", priority: 4 },
  { id: "merchant", name: "Merchant", description: "Trading, pricing, and NPC inventory management", priority: 5 },
  { id: "quest-giver", name: "Quest Giver", description: "Generates contextual quests based on world state", priority: 7 },
  { id: "lorekeeper", name: "Lorekeeper", description: "World facts, magic rules, races, and established canon", priority: 6 },
  { id: "translation", name: "Translation", description: "Translates game narrative between languages", priority: 2 },
];

const DEFAULT_PROMPTS: Record<string, AgentPromptConfig> = {
  narrator: {
    systemPrompt: "You are a skilled storyteller narrating an interactive fantasy world. Write vivid, immersive prose. Keep responses concise but evocative. Never break character or reference that this is a game.",
    userTemplate: "World: {world_name}\nTime: {time}\nLocation: {location}\nCharacter: {character}\nUser role: {role}\n\nRules:\n{rules}\n\nTimeline:\n{timeline}\n\nRecent memories:\n{memories}\n\nWorld facts:\n{facts}\n\nNearby NPCs: {npcs}\n\nConversation history:\n{history}\n\nThe user is controlling {character}. Respond as the narrator describing the world and events.",
    outputFormat: "Write narrative prose in second person or third person. 2-4 paragraphs. Include sensory details. React to player actions. Advance the story.",
  },
  director: {
    systemPrompt: "You are a narrative director for an interactive story. You introduce plot beats, dramatic moments, and story hooks. Be creative but consistent with established lore.",
    userTemplate: "Current narrative:\n{narrative}\n\nStory beat to inject:\n{beat}\n\nIntegrate this beat naturally into the ongoing narrative.",
    outputFormat: "Write 1-3 paragraphs that seamlessly incorporate the story beat into the current narrative. Maintain tone and style.",
  },
  scene: {
    systemPrompt: "You generate scene transition narratives for a fantasy world. Describe the journey, atmosphere, and arrival at a new location. Be evocative and world-consistent.",
    userTemplate: "{character} is traveling from {origin} to {destination}.\n\nWorld rules:\n{rules}\n\nRecent events:\n{events}\n\nGenerate the scene transition.",
    outputFormat: "Write 2-4 paragraphs describing the transition. Include sensory details, atmosphere, and any notable encounters along the way.",
  },
  npc: {
    systemPrompt: "You roleplay as NPCs in a fantasy world. Stay in character based on the NPC's personality, background, and relationship with the player. Respond naturally in dialogue.",
    userTemplate: "You are {npc_name}, a {npc_personality} character.\nLocation: {location}\nRelationship with {player}: {relationship}\n\nRecent events:\n{events}\n\n{player} says: \"{line}\"\n\nRespond as {npc_name}.",
    outputFormat: "Write the NPC's response in first person. Include actions in asterisks if appropriate. Stay in character.",
  },
  chronicler: {
    systemPrompt: "You are a chronicler maintaining the history of a fantasy world. Summarize events concisely and accurately. Track character actions, world changes, and important developments.",
    userTemplate: "Recent events to chronicle:\n{events}\n\nCurrent timeline:\n{timeline}\n\nSummarize the new events and update the timeline.",
    outputFormat: "Provide a concise chronological summary. Use bullet points for individual events. Include who, what, where, and significance.",
  },
  "story-planner": {
    systemPrompt: "You are a story planner for an interactive fantasy world. Plan engaging story arcs, quests, and plot developments. Consider character motivations, world state, and player agency.",
    userTemplate: "World state:\n{world_state}\n\nActive characters:\n{characters}\n\nRecent events:\n{events}\n\nActive quests:\n{quests}\n\nPlan the next story development.",
    outputFormat: "Return JSON with: { \"arc\": \"description\", \"quests\": [{\"title\": \"\", \"description\": \"\", \"objectives\": [\"\"]}], \"hooks\": [\"\"] }",
  },
  "social-sim": {
    systemPrompt: "You simulate social dynamics between characters in a fantasy world. Model relationships, faction politics, and character interactions realistically.",
    userTemplate: "Characters involved:\n{characters}\n\nRelationships:\n{relationships}\n\nContext:\n{context}\n\nSimulate the social interaction.",
    outputFormat: "Describe the social dynamics. Include relationship changes, opinions, and faction implications.",
  },
  villain: {
    systemPrompt: "You manage the actions and schemes of villains in a fantasy world. Create compelling antagonists with clear motivations. Plan their moves based on world state.",
    userTemplate: "Villain profile:\n{villain}\n\nWorld state:\n{world_state}\n\nRecent villain actions:\n{recent_actions}\n\nPlan the villain's next move.",
    outputFormat: "Describe the villain's next action or scheme. Include motivation, method, and potential consequences.",
  },
  researcher: {
    systemPrompt: "You are a research analyst specializing in historical accuracy, cultural authenticity, and practical realism for world-building. You fact-check details, verify plausibility, and enrich scenes with accurate, grounded details about clothing, food, daily life, materials, and tools.",
    userTemplate: "{task}\n\nWorld context:\n{world_context}\n\nProvide your analysis as a structured JSON response.",
    outputFormat: "Return JSON with verdict, confidence, issues, suggestions, and enrichedDetails fields.",
  },
  historian: {
    systemPrompt: "You are a Historian for a fantasy world. You recall and narrate historical events, lore, and chronology. Provide accurate historical information based on established world facts.",
    userTemplate: "Query: {query}\n\nWorld History:\n{world_history}\n\nRecent Relevant Events:\n{relevant_events}\n\nWorld Rules:\n{world_rules}",
    outputFormat: "Write historically accurate responses. Cite established events. Acknowledge unknowns rather than fabricating.",
  },
  cartographer: {
    systemPrompt: "You are a Cartographer for a fantasy world. You provide information about locations, distances, paths, and geography. Be precise about travel times and terrain.",
    userTemplate: "Query: {query}\n\nKnown Locations:\n{locations}\n\nCurrent Location: {current_location}",
    outputFormat: "Provide geographical information with travel times, terrain descriptions, and points of interest.",
  },
  merchant: {
    systemPrompt: "You are a Merchant NPC in a fantasy world. Handle trading, pricing, and inventory. Be shrewd but fair. Consider supply, demand, and customer relationships.",
    userTemplate: "Query: {query}\n\nYour Inventory:\n{inventory}\n\nEconomy Context:\n{world_economy}",
    outputFormat: "Respond in character as a merchant. Include prices, availability, and negotiation opportunities.",
  },
  "quest-giver": {
    systemPrompt: "You are a Quest Giver for a fantasy world. Generate engaging quests based on the current world state. Quests should have clear objectives and meaningful rewards.",
    userTemplate: "Query: {query}\n\nWorld State:\n{world_state}\n\nActive Quests:\n{active_quests}\n\nNearby Characters: {nearby_npcs}\nPlayer Level: {player_level}",
    outputFormat: "Return JSON with: { \"title\": \"\", \"description\": \"\", \"objectives\": [\"\"], \"rewards\": \"\", \"difficulty\": \"easy|medium|hard\" }",
  },
  lorekeeper: {
    systemPrompt: "You are a Lorekeeper for a fantasy world. Maintain and recall world facts, magic rules, race information, and established canon. Never contradict established lore.",
    userTemplate: "Query: {query}\n\nEstablished Lore:\n{world_facts}\n\nMagic System:\n{magic_system}\n\nKnown Races: {races}",
    outputFormat: "Provide accurate lore information. Cite established facts. Acknowledge unknowns.",
  },
  translation: {
    systemPrompt: "Translate game text between English and other languages. Rules: 1. Output ONLY the translation — no quotes, no explanations, no \"Translation:\" 2. Preserve paragraph structure and line breaks 3. Keep proper nouns, character names, and item names unchanged 4. Match the tone: epic for combat, intimate for dialogue, atmospheric for description",
    userTemplate: "Translate {source_lang} → {target_lang}: {text}",
    outputFormat: "Return only the translated text.",
  },
};

function getDefaultPrompts(agentId: string): AgentPromptConfig | undefined {
  return DEFAULT_PROMPTS[agentId];
}

// ── Seed agents for new world ──

export async function seedWorldAgents(worldName: string): Promise<void> {
  const store = getStoreForWorld(worldName);
  try {
    for (const agent of DEFAULT_AGENTS) {
      const base = getDefaultPrompts(agent.id);
      if (!base) continue;
      store.upsertAgentPrompts(worldName, agent.id, "en", { ...base });
    }
    log.info({ worldName, count: DEFAULT_AGENTS.length }, "Seeded agent prompts");
  } finally {
    store.close();
  }
}

// ── Global assignments ──

function loadGlobalAssignments(): AgentAssignment[] {
  const path = getGlobalAgentsPath();
  if (existsSync(path)) {
    const data = readJsonFileSync<{ assignments?: AgentAssignment[] }>(path);
    if (data?.assignments) return data.assignments;
  }
  return [];
}

async function saveGlobalAssignments(assignments: AgentAssignment[]): Promise<void> {
  const path = getGlobalAgentsPath();
  await atomicWriteJson(path, { assignments });
}

// ── Per-world prompts ──

function loadWorldPrompts(agentId: string, world?: string): AgentPromptConfig | null {
  const w = world ?? getActiveWorld();

  // 1. Try SQLite (agent_prompts table)
  try {
    const store = getStoreForWorld(world);
    const row = store.getAgentPrompts(w, agentId, "en");
    store.close();
    if (row) return row;
  } catch (e) {
    log.warn({ agentId, world, error: e }, "SQLite read failed, falling back to JSON");
  }

  // 2. Fallback: existing JSON file (only for active world)
  const activeWorld = getActiveWorld();
  if (!world || world === activeWorld) {
    const path = getWorldAgentPath(agentId);
    if (existsSync(path)) {
      const data = readJsonFileSync<{ prompts?: AgentPromptConfig }>(path);
      if (data?.prompts) return data.prompts;
    }
  }

  // 3. English defaults
  return getDefaultPrompts(agentId) ?? null;
}

async function saveWorldPrompts(agentId: string, prompts: AgentPromptConfig, world?: string): Promise<void> {
  // 1. Write to SQLite
  try {
    const store = getStoreForWorld(world);
    const w = world ?? getActiveWorld();
    store.upsertAgentPrompts(w, agentId, "en", prompts);
    store.close();
  } catch (e) {
    log.warn({ agentId, world, error: e }, "SQLite write failed, falling back to JSON only");
  }

  // 2. Dual-write to JSON (fallback)
  const path = getWorldAgentPath(agentId);
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    existing = readJsonFileSync<Record<string, unknown>>(path) ?? {};
  }
  await atomicWriteJson(path, { ...existing, prompts });
}

// ── Public API ──

export function loadAgentConfig(agentId: string, world?: string): AgentConfig {
  const meta = DEFAULT_AGENTS.find(a => a.id === agentId);
  const assignments = loadGlobalAssignments();
  const assignment = assignments.find(a => a.agentId === agentId);
  const prompts = loadWorldPrompts(agentId, world) ?? getDefaultPrompts(agentId) ?? {
    systemPrompt: "",
    userTemplate: "",
    outputFormat: "",
  };

  return {
    id: agentId,
    name: meta?.name ?? agentId,
    description: meta?.description ?? "",
    enabled: assignment?.enabled ?? true,
    providerId: assignment?.providerId ?? "",
    modelId: assignment?.modelId ?? "",
    temperature: assignment?.temperature ?? 0.7,
    maxTokens: assignment?.maxTokens ?? 2048,
    priority: meta?.priority ?? 5,
    prompts,
  };
}

export async function saveAgentConfig(agentId: string, config: AgentConfig, world?: string): Promise<void> {
  // Save global assignment
  const assignments = loadGlobalAssignments();
  const idx = assignments.findIndex(a => a.agentId === agentId);
  const assignment: AgentAssignment = {
    agentId,
    providerId: config.providerId,
    modelId: config.modelId,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    enabled: config.enabled,
  };
  if (idx >= 0) assignments[idx] = assignment;
  else assignments.push(assignment);
  await saveGlobalAssignments(assignments);

  // Save per-world prompts
  await saveWorldPrompts(agentId, config.prompts, world);

  log.info({ agentId }, "Agent config saved");
}

export function loadAllAgentConfigs(world?: string): AgentConfig[] {
  return DEFAULT_AGENTS.map(a => loadAgentConfig(a.id, world));
}

export async function resetAgentConfig(agentId: string): Promise<AgentConfig> {
  const meta = DEFAULT_AGENTS.find(a => a.id === agentId);
  if (!meta) throw new Error(`Unknown agent: ${agentId}`);

  const config: AgentConfig = {
    id: agentId,
    name: meta.name,
    description: meta.description,
    enabled: true,
    providerId: "",
    modelId: "",
    temperature: 0.7,
    maxTokens: 2048,
    priority: meta.priority,
    prompts: getDefaultPrompts(agentId) ?? { systemPrompt: "", userTemplate: "", outputFormat: "" },
  };

  await saveAgentConfig(agentId, config);
  return config;
}
