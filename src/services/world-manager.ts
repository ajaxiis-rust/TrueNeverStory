/**
 * World Manager — multi-world CRUD and management.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { getConfig } from "../config/env";
import { getLogger } from "../utils/logger";
import { getSettings, updateSettings } from "./settings";
import { RulesEngine } from "../rules/rules-engine";

const log = getLogger("world-manager");

export interface WorldSummary {
  name: string;
  title: string;
  description: string;
  genre: string;
  language: string;
  hasFrame: boolean;
  entityCount: number;
  sessionCount: number;
  path: string;
}

export interface WorldCreateParams {
  name: string;
  title: string;
  description: string;
  genre?: string;
  genres?: string[];
  language: string;
  worldRules: string[];
  magicSystem: string;
  primaryRule?: string;
  ruleModifiers?: string[];
}

function slugify(name: string): string {
  // Transliterate common Cyrillic to Latin, then sanitize
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const lower = name.toLowerCase();
  let result = "";
  for (const ch of lower) {
    result += translit[ch] ?? ch;
  }
  return result
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getWorldsRoot(): string {
  return getConfig().WORLDS_ROOT;
}

function getWorldPath(name: string): string {
  return join(getWorldsRoot(), slugify(name));
}

function countJsonlLines(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const content = readFileSync(path, "utf-8");
    return content.split("\n").filter((l: string) => l.trim()).length;
  } catch {
    return 0;
  }
}

export function listWorlds(): WorldSummary[] {
  const root = getWorldsRoot();
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => summarizeWorld(d.name))
    .filter((w) => w !== null) as WorldSummary[];
}

export function summarizeWorld(name: string): WorldSummary | null {
  const path = getWorldPath(name);
  if (!existsSync(path)) return null;

  const framePath = join(path, "world_frame.json");
  const hasFrame = existsSync(framePath);
  let frame: Record<string, any> = {};
  if (hasFrame) {
    frame = readJsonFileSync<Record<string, any>>(framePath) ?? {};
  }

  const entitiesPath = join(path, "entities.json");
  let entityCount = 0;
  if (existsSync(entitiesPath)) {
    try {
      const entities = readJsonFileSync<any[]>(entitiesPath);
      entityCount = Array.isArray(entities) ? entities.length : 0;
    } catch (err) {
      log.debug({ err, path: entitiesPath }, "Failed to count entities");
    }
  }

  const sessionDir = join(path, "session_history");
  let sessionCount = 0;
  if (existsSync(sessionDir)) {
    sessionCount = readdirSync(sessionDir).filter((f) => f.endsWith(".json")).length;
  }

  return {
    name,
    title: frame.title ?? frame.world_name ?? name,
    description: frame.description ?? "",
    genre: frame.genre ?? "",
    language: frame.language ?? "en",
    hasFrame,
    entityCount,
    sessionCount,
    path,
  };
}

export function getWorldFrame(worldName: string): Record<string, unknown> | null {
  const path = join(getWorldPath(worldName), "world_frame.json");
  if (!existsSync(path)) return null;
  return readJsonFileSync<Record<string, unknown>>(path);
}

export async function createWorld(params: WorldCreateParams): Promise<WorldSummary> {
  const name = slugify(params.name);
  const path = getWorldPath(name);

  if (existsSync(path)) {
    throw new Error(`World "${name}" already exists`);
  }

  mkdirSync(path, { recursive: true });
  mkdirSync(join(path, "session_history"), { recursive: true });
  mkdirSync(join(path, "chapters"), { recursive: true });

  const frame: Record<string, unknown> = {
    world_name: params.title,
    title: params.title,
    description: params.description,
    genre: params.genres?.join(", ") ?? params.genre ?? "fantasy",
    genres: params.genres ?? [params.genre ?? "fantasy"],
    language: params.language,
    world_rules: params.worldRules.map((r) => ({
      name: r.split(":")[0]?.trim() ?? r,
      description: r,
      category: "social_norm",
    })),
    magic_system: params.magicSystem ? {
      name: "Magic",
      rules: params.magicSystem,
      cost: "varies",
    } : undefined,
    calendar_era: { name: "Unknown Era", year_zero_event: "World creation" },
    races: [],
    factions: [],
    characters: [],
    locations: [],
    items: [],
    historical_events: [],
  };

  if (params.primaryRule) {
    try {
      const engine = new RulesEngine({
        primary: params.primaryRule,
        modifiers: params.ruleModifiers,
      });
      const merged = engine.getRules();
      frame.social_system = {
        primary: params.primaryRule,
        modifiers: params.ruleModifiers ?? [],
        hierarchy: merged.social.hierarchy,
        mobility: merged.social.mobility,
        education: merged.social.education,
        economy: merged.economy,
        politics: merged.politics,
        enforced_rules: merged.enforced_rules,
      };
    } catch (err) {
      log.warn({ err, rule: params.primaryRule }, "Failed to load social system, skipping");
    }
  }

  await atomicWriteJson(join(path, "world_frame.json"), frame);

  log.info({ name, path }, "World created");
  return summarizeWorld(name)!;
}

export async function updateWorldFrame(
  worldName: string,
  data: Partial<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const path = join(getWorldPath(worldName), "world_frame.json");
  const current = existsSync(path)
    ? (readJsonFileSync<Record<string, unknown>>(path) ?? {})
    : {};
  const updated = { ...current, ...data };
  await atomicWriteJson(path, updated);
  return updated;
}

export async function deleteWorld(name: string): Promise<void> {
  const path = getWorldPath(name);
  if (!existsSync(path)) throw new Error(`World "${name}" not found`);

  // Don't delete if it's the active world
  const settings = getSettings();
  if (settings.activeWorld === name) {
    throw new Error("Cannot delete the active world");
  }

  rmSync(path, { recursive: true, force: true });
  log.info({ name }, "World deleted");
}

export function setActiveWorld(name: string): void {
  const path = getWorldPath(name);
  if (!existsSync(path)) throw new Error(`World "${name}" not found`);
  updateSettings({ activeWorld: name });
  log.info({ name }, "Active world switched");
}

export function getActiveWorld(): string {
  return getSettings().activeWorld;
}

export function resolveDbPath(): string {
  return join(getWorldsRoot(), getActiveWorld());
}
