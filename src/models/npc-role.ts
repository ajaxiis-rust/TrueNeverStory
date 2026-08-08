/**
 * NPC Economy System — NPC Roles
 */

import { getPRNG } from "../lib/prng";

export interface NPCRoleConfig {
  name: string;
  weight: number;
  unique: boolean;
  contexts: string[];
  description: string;
}

export type ContextType = "court" | "market" | "temple" | "wild" | "military" | "sea";

export const CONTEXT_GROUPS: Record<ContextType, string[]> = {
  court: ["noble", "baronet", "baron", "spy", "sage"],
  market: ["merchant", "craftsman", "rogue", "moneylender"],
  temple: ["cleric", "healer", "sage", "scholar"],
  wild: ["farmer", "wanderer", "rogue", "assassin"],
  military: ["guard", "knight", "warlord", "spy"],
  sea: ["sailor", "fisherman", "pirate", "captain", "smuggler"],
};

export const CONTEXT_MULTIPLIER = 2;

export const DEFAULT_NPC_ROLES: NPCRoleConfig[] = [
  { name: "farmer", weight: 10, unique: false, contexts: ["wild"], description: "Земледелец" },
  { name: "fisherman", weight: 8, unique: false, contexts: ["wild", "sea"], description: "Рыбак" },
  { name: "craftsman", weight: 8, unique: false, contexts: ["market"], description: "Ремесленник" },
  { name: "sailor", weight: 6, unique: false, contexts: ["sea", "market"], description: "Моряк" },
  { name: "merchant", weight: 6, unique: false, contexts: ["market"], description: "Торговец" },
  { name: "guard", weight: 5, unique: false, contexts: ["court", "military"], description: "Стражник" },
  { name: "wanderer", weight: 4, unique: false, contexts: ["wild", "market"], description: "Странник" },
  { name: "pirate", weight: 3, unique: false, contexts: ["sea", "wild"], description: "Пират" },
  { name: "sage", weight: 3, unique: false, contexts: ["temple", "court"], description: "Учёный" },
  { name: "rogue", weight: 2, unique: false, contexts: ["wild", "market"], description: "Вор" },
  { name: "cleric", weight: 2, unique: false, contexts: ["temple"], description: "Жрец" },
  { name: "healer", weight: 2, unique: false, contexts: ["temple"], description: "Лекарь" },
  { name: "noble", weight: 1, unique: false, contexts: ["court"], description: "Дворянин" },
  { name: "baronet", weight: 0.5, unique: false, contexts: ["court"], description: "Баронет" },
  { name: "baron", weight: 0.3, unique: false, contexts: ["court"], description: "Барон" },
  { name: "knight", weight: 0.8, unique: false, contexts: ["military"], description: "Рыцарь" },
  { name: "spy", weight: 0.2, unique: false, contexts: ["court", "military"], description: "Шпион" },
  { name: "assassin", weight: 0.1, unique: false, contexts: ["wild"], description: "Убийца" },
  { name: "scholar", weight: 0.5, unique: false, contexts: ["temple"], description: "Мудрец" },
  { name: "moneylender", weight: 0.4, unique: false, contexts: ["market"], description: "Меняла" },
  { name: "captain", weight: 0.6, unique: false, contexts: ["sea", "military"], description: "Капитан" },
  { name: "smuggler", weight: 0.3, unique: false, contexts: ["sea", "market"], description: "Контрабандист" },
];

export const UNIQUE_NPC_ROLES: NPCRoleConfig[] = [
  { name: "emperor", weight: 0.01, unique: true, contexts: ["court"], description: "Император" },
  { name: "king", weight: 0.05, unique: true, contexts: ["court"], description: "Король" },
  { name: "duke", weight: 0.1, unique: true, contexts: ["court"], description: "Герцог" },
  { name: "archduke", weight: 0.15, unique: true, contexts: ["court"], description: "Эрцгерцог" },
  { name: "prince", weight: 0.2, unique: true, contexts: ["court"], description: "Принц" },
  { name: "high_priest", weight: 0.2, unique: true, contexts: ["temple"], description: "Верховный жрец" },
  { name: "warlord", weight: 0.3, unique: true, contexts: ["military"], description: "Полководец" },
  { name: "pirate_lord", weight: 0.3, unique: true, contexts: ["sea"], description: "Пиратский лорд" },
  { name: "admiral", weight: 0.4, unique: true, contexts: ["sea", "military"], description: "Адмирал" },
  { name: "master_assassin", weight: 0.3, unique: true, contexts: ["wild"], description: "Мастер-убийца" },
  { name: "legendary_merchant", weight: 0.4, unique: true, contexts: ["market"], description: "Легендарный торговец" },
  { name: "dragon_rider", weight: 0.1, unique: true, contexts: ["wild"], description: "Верхом на драконе" },
];

export const ALL_NPC_ROLES = [...DEFAULT_NPC_ROLES, ...UNIQUE_NPC_ROLES];

export function selectNPCRole(
  roles: NPCRoleConfig[],
  context?: string,
  existingNPCs: string[] = [],
): string {
  let filtered = roles;

  if (context) {
    const ctxLower = context.toLowerCase();
    filtered = roles.filter(
      (a) => a.contexts.some((c) => c.toLowerCase() === ctxLower) || a.contexts.length === 0,
    );
    if (filtered.length === 0) filtered = roles;
  }

  filtered = filtered.filter((a) => {
    if (!a.unique) return true;
    return !existingNPCs.includes(a.name);
  });

  if (filtered.length === 0) return "commoner";

  const totalWeight = filtered.reduce((sum, a) => sum + a.weight, 0);
  let random = Math.random() * totalWeight;
  for (const role of filtered) {
    random -= role.weight;
    if (random <= 0) return role.name;
  }
  return filtered[filtered.length - 1]?.name ?? "commoner";
}

export function getNPCRoleByName(name: string): NPCRoleConfig | undefined {
  return ALL_NPC_ROLES.find((a) => a.name === name);
}
