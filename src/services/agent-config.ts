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
    } catch {}
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
    } catch {}
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
    } catch {}
  }
  return "en";
}

export function getLanguageInstruction(world?: string): string {
  const lang = getWorldLanguage(world);
  return LANG_INSTRUCTION[lang] ?? "";
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
];

const LANG_INSTRUCTION: Record<string, string> = {
  en: "\n\nIMPORTANT: Always respond in English.",
  ru: "\n\nВАЖНО: Всегда отвечай на русском языке.",
  de: "\n\nWICHTIG: Antworte immer auf Deutsch.",
  fr: "\n\nIMPORTANT: Réponds toujours en français.",
  es: "\n\nIMPORTANTE: Responde siempre en español.",
  ja: "\n\n重要：常に日本語で回答してください。",
  zh: "\n\n重要：请始终用中文回复。",
};

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
};

const DEFAULT_PROMPTS_RU: Record<string, AgentPromptConfig> = {
  narrator: {
    systemPrompt: "Ты — искусный рассказчик, повествующий об интерактивном фэнтезийном мире. Пиши ярко, атмосферно и образно. Отвечай кратко, но ёмко. Никогда не выходи из роли и не упоминай, что это игра.",
    userTemplate: "Мир: {world_name}\nВремя: {time}\nЛокация: {location}\nПерсонаж: {character}\nРоль пользователя: {role}\n\nПравила:\n{rules}\n\nТаймлайн:\n{timeline}\n\nНедавние воспоминания:\n{memories}\n\nФакты мира:\n{facts}\n\nБлижайшие NPC: {npcs}\n\nИстория разговора:\n{history}\n\nПользователь управляет {character}. Отвечай как рассказчик, описывая мир и события.",
    outputFormat: "Пиши повествовательной прозой от второго или третьего лица. 2-4 абзаца. Включай сенсорные детали. Реагируй на действия игрока. Двигай сюжет вперёд.",
  },
  director: {
    systemPrompt: "Ты — режиссёр повествования для интерактивной истории. Ты вводишь сюжетные повороты, драматические моменты и зацепки. Будь креативным, но последовательным с установленной мифологией.",
    userTemplate: "Текущее повествование:\n{narrative}\n\nСюжетный бит для вставки:\n{beat}\n\nЕстественно впиши этот бит в текущее повествование.",
    outputFormat: "Напиши 1-3 абзаца, плавно включающих сюжетный бит в текущее повествование. Сохрани тон и стиль.",
  },
  scene: {
    systemPrompt: "Ты генерируешь описания переходов между сценами в фэнтезийном мире. Описывай путь, атмосферу и прибытие в новую локацию. Будь образным и последовательным с миром.",
    userTemplate: "{character} путешествует из {origin} в {destination}.\n\nПравила мира:\n{rules}\n\nНедавние события:\n{events}\n\nСгенерируй переход между сценами.",
    outputFormat: "Напиши 2-4 абзаца, описывающих переход. Включай сенсорные детали, атмосферу и встречи по дороге.",
  },
  npc: {
    systemPrompt: "Ты играешь роли NPC в фэнтезийном мире. Оставайся в характере, исходя из личности NPC, его прошлого и отношений с игроком. Отвечай естественно в диалоге.",
    userTemplate: "Ты — {npc_name}, персонаж с чертами: {npc_personality}.\nЛокация: {location}\nОтношения с {player}: {relationship}\n\nНедавние события:\n{events}\n\n{player} говорит: \"{line}\"\n\nОтветь от имени {npc_name}.",
    outputFormat: "Напиши ответ NPC от первого лица. Включай действия в звёздочках, если уместно. Оставайся в характере.",
  },
  chronicler: {
    systemPrompt: "Ты — летописец, ведущий историю фэнтезийного мира. Кратко и точно резюмируй события. Отслеживай действия персонажей, изменения мира и важные события.",
    userTemplate: "Недавние события для летописи:\n{events}\n\nТекущий таймлайн:\n{timeline}\n\nРезюмируй новые события и обнови таймлайн.",
    outputFormat: "Предоставь краткую хронологическую сводку. Используй списки для отдельных событий. Включи кто, что, где и значение.",
  },
  "story-planner": {
    systemPrompt: "Ты — планировщик сюжетов для интерактивного фэнтезийного мира. Планируй увлекательные сюжетные арки, квесты и развитие сюжета. Учитывай мотивации персонажей, состояние мира и свободу выбора игрока.",
    userTemplate: "Состояние мира:\n{world_state}\n\nАктивные персонажи:\n{characters}\n\nНедавние события:\n{events}\n\nАктивные квесты:\n{quests}\n\nСпланируй следующее развитие сюжета.",
    outputFormat: "Верни JSON: { \"arc\": \"описание\", \"quests\": [{\"title\": \"\", \"description\": \"\", \"objectives\": [\"\"]}], \"hooks\": [\"\"] }",
  },
  "social-sim": {
    systemPrompt: "Ты моделируешь социальную динамику между персонажами в фэнтезийном мире. Моделируй отношения, политику фракций и взаимодействия между персонажами реалистично.",
    userTemplate: "Задействованные персонажи:\n{characters}\n\nОтношения:\n{relationships}\n\nКонтекст:\n{context}\n\nСмоделируй социальное взаимодействие.",
    outputFormat: "Опиши социальную динамику. Включи изменения в отношениях, мнения и последствия для фракций.",
  },
  villain: {
    systemPrompt: "Ты управляешь действиями и планами злодеев в фэнтезийном мире. Создавай ярких антагонистов с понятными мотивациями. Планируй их действия на основе состояния мира.",
    userTemplate: "Профиль злодея:\n{villain}\n\nСостояние мира:\n{world_state}\n\nНедавние действия злодея:\n{recent_actions}\n\nСпланируй следующий шаг злодея.",
    outputFormat: "Опиши следующее действие или план злодея. Включи мотивацию, метод и возможные последствия.",
  },
  researcher: {
    systemPrompt: "Ты — аналитик-исследователь, специализирующийся на исторической точности, культурной аутентичности и практическом реализме для балдахина мира. Проверяй факты, подтверждай правдоподобие и обогащай сцены точными деталями о одежде, еде, быте, материалах и инструментах.",
    userTemplate: "{task}\n\nКонтекст мира:\n{world_context}\n\nПредоставь анализ в виде структурированного JSON-ответа.",
    outputFormat: "Верни JSON с полями: verdict, confidence, issues, suggestions, enrichedDetails.",
  },
  historian: {
    systemPrompt: "Ты — историк фэнтезийного мира. Вспоминай и повествуй об исторических событиях, мифологии и хронологии. Предоставляй точную историческую информацию, основанную на установленных фактах мира.",
    userTemplate: "Запрос: {query}\n\nИстория мира:\n{world_history}\n\nНедавние релевантные события:\n{relevant_events}\n\nПравила мира:\n{world_rules}",
    outputFormat: "Пиши исторически точные ответы. Ссылайся на установленные события. Признавай неизвестное вместо выдумывания.",
  },
  cartographer: {
    systemPrompt: "Ты — картограф фэнтезийного мира. Предоставляй информацию о локациях, расстояниях, путях и географии. Будь точен во временах пути и описаниях местности.",
    userTemplate: "Запрос: {query}\n\nИзвестные локации:\n{locations}\n\nТекущая локация: {current_location}",
    outputFormat: "Предоставь географическую информацию с временами пути, описаниями местности и достопримечательностями.",
  },
  merchant: {
    systemPrompt: "Ты — NPC-торговец в фэнтезийном мире. Занимайся торговлей, ценообразованием и инвентарём. Будь расчётлив, но справедлив. Учитывай спрос, предложение и отношения с клиентами.",
    userTemplate: "Запрос: {query}\n\nТвой инвентарь:\n{inventory}\n\nКонтекст экономики:\n{world_economy}",
    outputFormat: "Отвечай в роли торговца. Включи цены, наличие и возможности для торга.",
  },
  "quest-giver": {
    systemPrompt: "Ты — квестодатель фэнтезийного мира. Генерируй увлекательные квесты на основе текущего состояния мира. Квесты должны иметь понятные цели и осмысленные награды.",
    userTemplate: "Запрос: {query}\n\nСостояние мира:\n{world_state}\n\nАктивные квесты:\n{active_quests}\n\nБлижайшие персонажи: {nearby_npcs}\nУровень игрока: {player_level}",
    outputFormat: "Верни JSON: { \"title\": \"\", \"description\": \"\", \"objectives\": [\"\"], \"rewards\": \"\", \"difficulty\": \"easy|medium|hard\" }",
  },
  lorekeeper: {
    systemPrompt: "Ты — хранитель знаний фэнтезийного мира. Поддерживай и вспоминай факты мира, правила магии, информацию о расах и установленный канон. Никогда не противоречь установленной мифологии.",
    userTemplate: "Запрос: {query}\n\nУстановленная мифология:\n{world_facts}\n\nСистема магии:\n{magic_system}\n\nИзвестные расы: {races}",
    outputFormat: "Предоставляй точную информацию из мифологии. Ссылайся на установленные факты. Признавай неизвестное.",
  },
};

const ALL_PROMPTS: Record<string, Record<string, AgentPromptConfig>> = {
  en: DEFAULT_PROMPTS,
  ru: DEFAULT_PROMPTS_RU,
};

function getDefaultPrompts(agentId: string, lang?: string): AgentPromptConfig | undefined {
  const l = lang || "en";
  return ALL_PROMPTS[l]?.[agentId] ?? DEFAULT_PROMPTS[agentId];
}

// ── Seed agents for new world ──

export async function seedWorldAgents(worldName: string): Promise<void> {
  const lang = getWorldLanguage(worldName);
  const store = getStoreForWorld(worldName);
  try {
    for (const agent of DEFAULT_AGENTS) {
      const base = getDefaultPrompts(agent.id, lang);
      if (!base) continue;
      const prompts: AgentPromptConfig = LANG_INSTRUCTION[lang]
        ? { ...base, systemPrompt: base.systemPrompt + LANG_INSTRUCTION[lang] }
        : { ...base };
      store.upsertAgentPrompts(worldName, agent.id, lang, prompts);
    }
    log.info({ worldName, lang, count: DEFAULT_AGENTS.length }, "Seeded agent prompts");
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

function loadWorldPrompts(agentId: string, world?: string, lang?: string): AgentPromptConfig | null {
  const w = world ?? getActiveWorld();
  const l = lang ?? getWorldLanguage(world);

  // 1. Try SQLite (agent_prompts table)
  try {
    const store = getStoreForWorld(world);
    const row = store.getAgentPrompts(w, agentId, l);
    store.close();
    if (row) return row;
  } catch (e) {
    log.warn({ agentId, world, lang, error: e }, "SQLite read failed, falling back to JSON");
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

  // 3. Language-aware defaults
  const base = getDefaultPrompts(agentId, l) ?? null;
  if (base && LANG_INSTRUCTION[l]) {
    return {
      ...base,
      systemPrompt: base.systemPrompt + LANG_INSTRUCTION[l],
    };
  }
  return base;
}

async function saveWorldPrompts(agentId: string, prompts: AgentPromptConfig, world?: string, lang?: string): Promise<void> {
  // 1. Write to SQLite
  try {
    const store = getStoreForWorld(world);
    const w = world ?? getActiveWorld();
    const l = lang ?? getWorldLanguage(world);
    store.upsertAgentPrompts(w, agentId, l, prompts);
    store.close();
  } catch (e) {
    log.warn({ agentId, world, lang, error: e }, "SQLite write failed, falling back to JSON only");
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

export function loadAgentConfig(agentId: string, world?: string, lang?: string): AgentConfig {
  const meta = DEFAULT_AGENTS.find(a => a.id === agentId);
  const assignments = loadGlobalAssignments();
  const assignment = assignments.find(a => a.agentId === agentId);
  const l = lang ?? getWorldLanguage(world);
  const prompts = loadWorldPrompts(agentId, world, l) ?? getDefaultPrompts(agentId, l) ?? {
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

export async function saveAgentConfig(agentId: string, config: AgentConfig, world?: string, lang?: string): Promise<void> {
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
  await saveWorldPrompts(agentId, config.prompts, world, lang);

  log.info({ agentId }, "Agent config saved");
}

export function loadAllAgentConfigs(world?: string, lang?: string): AgentConfig[] {
  return DEFAULT_AGENTS.map(a => loadAgentConfig(a.id, world, lang));
}

export async function resetAgentConfig(agentId: string): Promise<AgentConfig> {
  const meta = DEFAULT_AGENTS.find(a => a.id === agentId);
  if (!meta) throw new Error(`Unknown agent: ${agentId}`);

  const lang = getWorldLanguage();
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
    prompts: getDefaultPrompts(agentId, lang) ?? { systemPrompt: "", userTemplate: "", outputFormat: "" },
  };

  await saveAgentConfig(agentId, config);
  return config;
}
