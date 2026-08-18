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

// In-memory cache to avoid re-reading config from disk on every LLM call.
// Invalidated on save/reset.
const _configCache = new Map<string, AgentConfig>();

function cacheKey(agentId: string, world?: string): string {
  return `${world ?? "__global__"}:${agentId}`;
}

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
  translationProviderId?: string;
  translationModelId?: string;
}

export interface AgentAssignment {
  agentId: string;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  translationProviderId?: string;
  translationModelId?: string;
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
      log.warn({ err: e, path: settingsPath }, "Failed to read active world config");
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
      log.warn({ err: e, path: settingsPath }, "Failed to read active world config");
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
      log.warn({ err: e, path: worldFramePath }, "Failed to read world language config");
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
  { id: "director", name: "Director", description: "Integrates story beats and plot hooks into narrative", priority: 8 },
  { id: "chronicler", name: "Chronicler", description: "Summarizes events and maintains world timeline", priority: 5 },
  { id: "story-planner", name: "Story Planner", description: "Plans story arcs, quests, and plot developments", priority: 6 },
  { id: "social-sim", name: "Social Simulator", description: "Simulates NPC relationships and social dynamics", priority: 4 },
  { id: "villain", name: "Villain Manager", description: "Manages antagonist actions and evil schemes", priority: 6 },
  { id: "researcher", name: "Researcher", description: "Fact-checking, realism validation, and world-building research", priority: 3 },
  { id: "translation", name: "Translation", description: "Translates game narrative between languages", priority: 2 },
];

/** @deprecated Static prompts — scheduled for removal after v2-paradigm Vector 2.
 *  Replacement: Big Six computable prompts (stylist.buildMicroPrompt etc.).
 *  See: docs/compose/specs/2026-08-17-v2-paradigm-migration-design.md §S5 */
const DEFAULT_PROMPTS: Record<string, AgentPromptConfig> = {
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
  const key = cacheKey(agentId, world);
  const cached = _configCache.get(key);
  if (cached) return cached;

  const meta = DEFAULT_AGENTS.find(a => a.id === agentId);
  const assignments = loadGlobalAssignments();
  const assignment = assignments.find(a => a.agentId === agentId);
  const prompts = loadWorldPrompts(agentId, world) ?? getDefaultPrompts(agentId) ?? {
    systemPrompt: "",
    userTemplate: "",
    outputFormat: "",
  };

  const config: AgentConfig = {
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
    translationProviderId: assignment?.translationProviderId,
    translationModelId: assignment?.translationModelId,
  };

  _configCache.set(key, config);
  return config;
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
    translationProviderId: config.translationProviderId,
    translationModelId: config.translationModelId,
  };
  if (idx >= 0) assignments[idx] = assignment;
  else assignments.push(assignment);
  await saveGlobalAssignments(assignments);

  // Save per-world prompts
  await saveWorldPrompts(agentId, config.prompts, world);

  // Invalidate cache
  _configCache.delete(cacheKey(agentId, world));
  _configCache.delete(cacheKey(agentId)); // global version too

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
