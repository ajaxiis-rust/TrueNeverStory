/**
 * Settings service — reads/writes app configuration to disk.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { getConfig } from "../config/env";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("settings");

export interface AppSettings {
  // Language
  language: "en" | "ru" | "de" | "fr" | "es" | "ja" | "zh";

  // LLM
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmTimeout: number;
  llmMaxTokens: number;
  llmTemperature: number;
  llmMaxRetries: number;
  llmMaxConcurrent: number;

  // Local Model (MAX / llama.cpp / Ollama)
  modelNumGpuLayers: number;
  modelNumCpuThreads: number;
  modelContextLength: number;
  modelBatchSize: number;
  modelTemperature: number;
  modelTopP: number;
  modelTopK: number;
  modelRepeatPenalty: number;
  modelMirostat: number;
  modelMirostatTau: number;
  modelMirostatEta: number;

  // Embeddings
  embeddingModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;

  // Server
  serverHost: string;
  serverPort: number;

  // Auth
  authPassword: string;

  // Database
  dbPath: string;

  // Memory
  maxMemoryEntries: number;
  embeddingDimension: number;
  similarityThreshold: number;
  halfLifeDays: number;

  // Probability
  globalLuck: number;

  // World
  autoHeal: boolean;

  // Active world
  activeWorld: string;

  // MAX Serve
  maxServeUrl: string;
}

const SETTINGS_FILE = "settings.json";

let _settingsPath: string;
let _cached: AppSettings | null = null;

function getSettingsPath(): string {
  if (!_settingsPath) {
    const cfg = getConfig();
    _settingsPath = join(cfg.CONF_PATH, SETTINGS_FILE);
  }
  return _settingsPath;
}

function defaults(): AppSettings {
  const cfg = getConfig();
  return {
    language: "en",
    llmBaseUrl: cfg.WORLD_LLM_BASE_URL,
    llmApiKey: cfg.WORLD_LLM_API_KEY,
    llmModel: cfg.WORLD_LLM_MODEL,
    llmTimeout: cfg.WORLD_LLM_TIMEOUT,
    llmMaxTokens: cfg.WORLD_LLM_MAX_TOKENS,
    llmTemperature: cfg.WORLD_LLM_TEMPERATURE,
    llmMaxRetries: cfg.WORLD_LLM_MAX_RETRIES,
    llmMaxConcurrent: cfg.WORLD_LLM_MAX_CONCURRENT,
    modelNumGpuLayers: -1,
    modelNumCpuThreads: 3,
    modelContextLength: 4096,
    modelBatchSize: 512,
    modelTemperature: 0.7,
    modelTopP: 0.9,
    modelTopK: 40,
    modelRepeatPenalty: 1.1,
    modelMirostat: 0,
    modelMirostatTau: 5.0,
    modelMirostatEta: 0.1,
    embeddingModel: cfg.WORLD_EMBEDDING_MODEL,
    embeddingBaseUrl: cfg.WORLD_EMBEDDING_BASE_URL,
    embeddingApiKey: cfg.WORLD_EMBEDDING_API_KEY,
    serverHost: cfg.WORLD_SERVER_HOST,
    serverPort: cfg.WORLD_SERVER_PORT,
    authPassword: cfg.AUTH_PASSWORD,
    dbPath: cfg.WORLD_DB_PATH,
    maxMemoryEntries: 10000,
    embeddingDimension: 384,
    similarityThreshold: 0.7,
    halfLifeDays: 7.0,
    globalLuck: 0.5,
    autoHeal: cfg.WORLD_AUTO_HEAL,
    activeWorld: "default",
    maxServeUrl: cfg.MAX_SERVE_URL,
  };
}

export function loadSettings(): AppSettings {
  if (_cached) return _cached;
  const path = getSettingsPath();
  if (existsSync(path)) {
    const file = readJsonFileSync<AppSettings>(path);
    if (file) {
      _cached = { ...defaults(), ...file };
      return _cached;
    }
  }
  _cached = defaults();
  return _cached;
}

export function getSettings(): AppSettings {
  return loadSettings();
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = loadSettings();
  const updated = { ...current, ...partial };
  const path = getSettingsPath();
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await atomicWriteJson(path, updated);
  _cached = updated;
  log.info("Settings updated");
  return updated;
}

export function resetSettings(): AppSettings {
  _cached = null;
  const path = getSettingsPath();
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (err) {
    log.warn({ err }, "Failed to delete settings file");
  }
  return loadSettings();
}
