/**
 * Model manager — downloads, lists, and manages GGUF models.
 * Integrates with Ollama for local model serving.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "../config/env";
import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { getLogger } from "../utils/logger";

const log = getLogger("model-manager");
const execAsync = promisify(exec);

interface ModelInfo {
  id: string;
  name: string;
  size: number;
  sizeHuman: string;
  source: string;
  status: "installed" | "downloading" | "available";
  path: string;
  format: string;
  downloadedAt?: string;
  lastUsed?: string;
  backend: "ollama" | "llamacpp" | "unknown";
}

interface DownloadProgress {
  modelId: string;
  percent: number;
  downloaded: number;
  total: number;
  speed: string;
  eta: string;
  _startTime?: number;
  _lastBytes?: number;
  _lastTime?: number;
  _smoothPercent?: number;
}

const MODELS_DB = "models.json";

let _modelsPath: string;
let _ggufDir: string;
let _activeDownloads: Map<string, DownloadProgress> = new Map();

function getModelsPath(): string {
  if (!_modelsPath) {
    const cfg = getConfig();
    _modelsPath = join(cfg.LOCAL_MODELS_PATH, MODELS_DB);
  }
  return _modelsPath;
}

function getGgufDir(): string {
  if (!_ggufDir) {
    const cfg = getConfig();
    _ggufDir = cfg.LOCAL_MODELS_PATH;
    if (!existsSync(_ggufDir)) mkdirSync(_ggufDir, { recursive: true });
  }
  return _ggufDir;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function loadModels(): ModelInfo[] {
  const path = getModelsPath();
  if (existsSync(path)) {
    const data = readJsonFileSync<ModelInfo[]>(path);
    if (data) return data;
  }
  return [];
}

async function saveModels(models: ModelInfo[]): Promise<void> {
  await atomicWriteJson(getModelsPath(), models);
}

// ── Ollama Integration ──

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getOllamaModels(): Promise<Array<{ name: string; size: number; modified: string }>> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name?: string; size?: number; modified_at?: string }> };
    return (data.models ?? []).map((m) => ({
      name: m.name ?? "",
      size: m.size ?? 0,
      modified: m.modified_at ?? "",
    }));
  } catch {
    return [];
  }
}

async function pullOllamaModel(name: string, onProgress?: (p: DownloadProgress) => void): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
    });

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (onProgress) {
            onProgress({
              modelId: name,
              percent: data.completed ? Math.round((data.completed / (data.total ?? 1)) * 100) : 0,
              downloaded: data.completed ?? 0,
              total: data.total ?? 0,
              speed: data.speed ?? "",
              eta: data.eta ?? "",
            });
          }
        } catch {
          // Skip malformed JSON line
        }
      }
    }
    return true;
  } catch (err) {
    log.error({ err, model: name }, "Ollama pull failed");
    return false;
  }
}

async function deleteOllamaModel(name: string): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── GGUF Direct Download ──

async function downloadGguf(url: string, filename: string, onProgress?: (p: DownloadProgress) => void): Promise<string | null> {
  const dir = getGgufDir();
  const filePath = join(dir, filename);
  let downloaded = 0;

  const now = Date.now();
  _activeDownloads.set(filename, {
    modelId: filename,
    percent: 0,
    downloaded: 0,
    total: 0,
    speed: "",
    eta: "",
    _startTime: now,
    _lastBytes: 0,
    _lastTime: now,
    _smoothPercent: 0,
  });

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3600000) });
    if (!res.ok || !res.body) {
      log.error({ status: res.status, url }, "GGUF download HTTP error");
      _activeDownloads.delete(filename);
      return null;
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body.getReader();
    const { createWriteStream } = await import("node:fs");
    const fileStream = createWriteStream(filePath);

    let lastReport = Date.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(value);
      downloaded += value.length;

      const now = Date.now();
      if (now - lastReport < 1000) continue;
      lastReport = now;

      const entry = _activeDownloads.get(filename);
      if (!entry) break;

      const elapsed = (now - (entry._startTime ?? now)) / 1000;
      const instantSpeed = ((downloaded - (entry._lastBytes ?? 0)) / ((now - (entry._lastTime ?? now)) / 1000));
      entry._lastBytes = downloaded;
      entry._lastTime = now;

      const avgSpeed = elapsed > 0 ? downloaded / elapsed : 0;
      const smoothSpeed = avgSpeed * 0.3 + instantSpeed * 0.7;

      const rawPercent = contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
      entry._smoothPercent = (entry._smoothPercent ?? 0) * 0.6 + rawPercent * 0.4;
      entry.percent = Math.round(entry._smoothPercent);
      entry.downloaded = downloaded;
      entry.total = contentLength;
      entry.speed = formatBytes(smoothSpeed) + "/s";

      if (contentLength > 0 && smoothSpeed > 0) {
        const remaining = (contentLength - downloaded) / smoothSpeed;
        entry.eta = formatTime(remaining);
      }
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    const finalEntry = _activeDownloads.get(filename);
    if (finalEntry) {
      finalEntry.percent = 100;
      finalEntry._smoothPercent = 100;
    }

    _activeDownloads.delete(filename);
    log.info({ filePath, size: downloaded }, "GGUF download complete");
    return filePath;
  } catch (err) {
    _activeDownloads.delete(filename);
    const errDetail = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "unknown";
    log.error({ errName, errDetail, url, downloaded }, "GGUF download failed");
    return null;
  }
}

// ── Public API ──

export async function listModels(): Promise<ModelInfo[]> {
  const models = loadModels();

  // Sync with Ollama — always run so models persist when offline
  const ollamaRunning = await isOllamaRunning();
  if (ollamaRunning) {
    const ollamaModels = await getOllamaModels();
    const ollamaNames = new Set(ollamaModels.map((m) => m.name));

    for (const om of ollamaModels) {
      if (!models.find((m) => m.id === om.name && m.backend === "ollama")) {
        models.push({
          id: om.name,
          name: om.name,
          size: om.size,
          sizeHuman: formatSize(om.size),
          source: "ollama",
          status: "installed",
          path: "",
          format: "gguf",
          backend: "ollama",
        });
      }
    }

    for (const m of models) {
      if (m.backend === "ollama") {
        m.status = ollamaNames.has(m.id) ? "installed" : "available";
        const ollamaModel = ollamaModels.find((om) => om.name === m.id);
        if (ollamaModel) {
          m.size = ollamaModel.size;
          m.sizeHuman = formatSize(ollamaModel.size);
        }
      }
    }
  }

  saveModels(models);

  // Scan local GGUF files
  const dir = getGgufDir();
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".gguf"));
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      const existing = models.find((m) => m.path === filePath);
      if (existing) {
        existing.size = stat.size;
        existing.sizeHuman = formatSize(stat.size);
        if (existing.status !== "installed") existing.status = "installed";
      } else {
        models.push({
          id: `local:${file}`,
          name: file.replace(".gguf", ""),
          size: stat.size,
          sizeHuman: formatSize(stat.size),
          source: "local",
          status: "installed",
          path: filePath,
          format: "gguf",
          downloadedAt: stat.mtime.toISOString(),
          backend: "llamacpp",
        });
      }
    }
  }

  // Scan Kobold.cpp models directory
  const koboldDir = join(process.env.HOME ?? "/home/opc", "koboldcpp", "models");
  if (existsSync(koboldDir)) {
    const files = readdirSync(koboldDir).filter((f) => f.endsWith(".gguf"));
    for (const file of files) {
      const filePath = join(koboldDir, file);
      const stat = statSync(filePath);
      const existing = models.find((m) => m.path === filePath);
      if (existing) {
        existing.size = stat.size;
        existing.sizeHuman = formatSize(stat.size);
        if (existing.status !== "installed") existing.status = "installed";
      } else {
        models.push({
          id: `local:${file}`,
          name: file.replace(".gguf", ""),
          size: stat.size,
          sizeHuman: formatSize(stat.size),
          source: "koboldcpp",
          status: "installed",
          path: filePath,
          format: "gguf",
          downloadedAt: stat.mtime.toISOString(),
          backend: "llamacpp",
        });
      }
    }
  }

  await saveModels(models);

  // Deduplicate by ID
  const seen = new Set<string>();
  const deduped = models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return deduped;
}

export async function installModel(
  source: string,
  name: string,
  backend: "ollama" | "llamacpp" = "ollama",
  onProgress?: (p: DownloadProgress) => void,
): Promise<ModelInfo> {
  const models = loadModels();

  if (backend === "ollama") {
    // Use Ollama pull
    const existing = models.find((m) => m.id === name);
    if (existing) {
      existing.status = "downloading";
      await saveModels(models);
    }

    const success = await pullOllamaModel(name, onProgress);

    const model: ModelInfo = {
      id: name,
      name,
      size: 0,
      sizeHuman: "?",
      source,
      status: success ? "installed" : "available",
      path: "",
      format: "gguf",
      downloadedAt: success ? new Date().toISOString() : undefined,
      backend: "ollama",
    };

    const idx = models.findIndex((m) => m.id === name && m.backend === "ollama");
    if (idx >= 0) models[idx] = model;
    else models.push(model);

    await saveModels(models);
    return model;
  } else {
    // Direct GGUF download
    const filename = name.endsWith(".gguf") ? name : `${name}.gguf`;
    const filePath = await downloadGguf(source, filename, onProgress);

    const model: ModelInfo = {
      id: `local:${filename}`,
      name: filename.replace(".gguf", ""),
      size: 0,
      sizeHuman: "?",
      source,
      status: filePath ? "installed" : "available",
      path: filePath ?? "",
      format: "gguf",
      downloadedAt: filePath ? new Date().toISOString() : undefined,
      backend: "llamacpp",
    };

    models.push(model);
    await saveModels(models);
    return model;
  }
}

export async function removeModel(modelId: string): Promise<boolean> {
  const models = loadModels();
  const idx = models.findIndex((m) => m.id === modelId);
  if (idx < 0) return false;

  const model = models[idx]!;

  if (model.backend === "ollama") {
    await deleteOllamaModel(model.id);
  }

  if (model.path && existsSync(model.path)) {
    unlinkSync(model.path);
  }

  models.splice(idx, 1);
  await saveModels(models);
  return true;
}

export function getDownloadProgress(): DownloadProgress[] {
  return Array.from(_activeDownloads.values());
}

// ── Filesystem Browser ──

interface BrowseEntry {
  name: string;
  isDir: boolean;
  size: number;
  sizeHuman: string;
}

export function browseDirectory(dirPath: string): { path: string; entries: BrowseEntry[]; parent: string | null } {
  const resolved = dirPath || "/";
  if (!existsSync(resolved)) return { path: resolved, entries: [], parent: null };

  const stat = statSync(resolved);
  if (!stat.isDirectory()) return { path: resolved, entries: [], parent: null };

  const parent = resolved !== "/" ? resolved.replace(/\/[^/]+\/?$/, "") || "/" : null;

  const items = readdirSync(resolved);
  const entries: BrowseEntry[] = [];

  for (const name of items) {
    if (name.startsWith(".")) continue;
    try {
      const full = join(resolved, name);
      const s = statSync(full);
      entries.push({
        name,
        isDir: s.isDirectory(),
        size: s.isFile() ? s.size : 0,
        sizeHuman: s.isFile() ? formatSize(s.size) : "",
      });
    } catch {
      // Skip inaccessible file
    }
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { path: resolved, entries, parent };
}

export async function importLocalModel(filePath: string): Promise<ModelInfo | null> {
  if (!existsSync(filePath)) return null;

  const stat = statSync(filePath);
  if (!stat.isFile()) return null;

  const models = loadModels();
  const existing = models.find((m) => m.path === filePath);
  if (existing) return existing;

  const filename = filePath.split("/").pop() ?? filePath;
  const model: ModelInfo = {
    id: `local:${filename}`,
    name: filename.replace(/\.(gguf|safetensors|bin|pt|pth)$/i, ""),
    size: stat.size,
    sizeHuman: formatSize(stat.size),
    source: "local",
    status: "installed",
    path: filePath,
    format: filename.split(".").pop() ?? "unknown",
    downloadedAt: stat.mtime.toISOString(),
    backend: "llamacpp",
  };

  models.push(model);
  await saveModels(models);
  return model;
}

export async function getOllamaStatus(): Promise<{ running: boolean; models: number }> {
  const running = await isOllamaRunning();
  const models = running ? (await getOllamaModels()).length : 0;
  return { running, models };
}

async function isLlamacppAvailable(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:5001/health", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBackendsStatus(): Promise<{ ollama: boolean; llamacpp: boolean }> {
  const [ollama, llamacpp] = await Promise.all([isOllamaRunning(), isLlamacppAvailable()]);
  return { ollama, llamacpp };
}

// ── Popular Models Catalog ──

export const POPULAR_MODELS = [
  { id: "gemma3-4b-q4_k_m", name: "Gemma 3 4B (Q4_K_M)", size: "~2.3 GB", description: "Google's latest, great quality/speed ratio", backend: "llamacpp" as const, url: "https://huggingface.co/MaziyarPanahi/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it.Q4_K_M.gguf" },
  { id: "gemma3-4b-q5_k_m", name: "Gemma 3 4B (Q5_K_M)", size: "~2.6 GB", description: "Higher quality quantization", backend: "llamacpp" as const, url: "https://huggingface.co/MaziyarPanahi/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it.Q5_K_M.gguf" },
  { id: "gemma3-4b-q8_0", name: "Gemma 3 4B (Q8_0)", size: "~3.8 GB", description: "Near-lossless quantization", backend: "llamacpp" as const, url: "https://huggingface.co/MaziyarPanahi/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it.Q8_0.gguf" },
  { id: "gemma3-1b-q4_k_m", name: "Gemma 3 1B (Q4_K_M)", size: "~760 MB", description: "Tiny Google model, 140+ languages, great for edge devices", backend: "llamacpp" as const, url: "https://huggingface.co/MaziyarPanahi/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it.Q4_K_M.gguf" },
  { id: "qwen2.5-3b-q4_k_m", name: "Qwen 2.5 3B (Q4_K_M)", size: "~2 GB", description: "Alibaba's small multilingual, 29+ languages, fast", backend: "llamacpp" as const, url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf" },
  { id: "qwen2.5-7b-q4_k_m", name: "Qwen 2.5 7B (Q4_K_M)", size: "~4.4 GB", description: "Strong multilingual, 29+ languages, code & reasoning", backend: "llamacpp" as const, url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf" },
  { id: "minicpm3-4b-q4_k_m", name: "MiniCPM 3 4B (Q4_K_M)", size: "~2.5 GB", description: "Tsinghua's compact multilingual, strong reasoning", backend: "llamacpp" as const, url: "https://huggingface.co/slm-org/MiniCPM3-4B-GGUF/resolve/main/MiniCPM3-4B-Q4_K_M.gguf" },
  { id: "smollm2-1.7b-q4_k_m", name: "SmolLM2 1.7B (Q4_K_M)", size: "~1 GB", description: "HuggingFace's tiny multilingual, 7 languages", backend: "llamacpp" as const, url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf" },
  { id: "yandexgpt-5-lite-8b-q4_k_m", name: "YandexGPT 5 Lite 8B (Q4_K_M)", size: "~4.9 GB", description: "Yandex's Russian/English instruct model, great for RU text", backend: "llamacpp" as const, url: "https://huggingface.co/yandex/YandexGPT-5-Lite-8B-instruct-GGUF/resolve/main/YandexGPT-5-Lite-8B-instruct-Q4_K_M.gguf" },
  { id: "gigachat3.1-10b-a1.8b-q4_k_m", name: "GigaChat 3.1 10B-A1.8B (Q4_K_M)", size: "~6.5 GB", description: "Sber's MoE model, only 1.8B active params, RU/EN, fast & smart", backend: "llamacpp" as const, url: "https://huggingface.co/ai-sage/GigaChat3.1-10B-A1.8B-GGUF/resolve/main/GigaChat3.1-10B-A1.8B-q4_K_M.gguf" },
  { id: "gigachat-20b-a3b-q4_k_m", name: "GigaChat 20B-A3B (Q4_K_M)", size: "~12.5 GB", description: "Sber's older MoE, 3B active params, RU/EN, strong quality", backend: "llamacpp" as const, url: "https://huggingface.co/ai-sage/GigaChat-20B-A3B-instruct-GGUF/resolve/main/GigaChat-20B-A3B-instruct-q4_K_M.gguf" },
  { id: "llama3.2:3b", name: "LLaMA 3.2 3B", size: "~2 GB", description: "Fast, small, good for roleplay", backend: "ollama" as const },
  { id: "llama3.2:8b", name: "LLaMA 3.2 8B", size: "~5 GB", description: "Balanced quality and speed", backend: "ollama" as const },
  { id: "llama3.1:8b", name: "LLaMA 3.1 8B", size: "~5 GB", description: "Excellent for narrative generation", backend: "ollama" as const },
  { id: "mistral:7b", name: "Mistral 7B", size: "~4 GB", description: "Fast, creative, great for dialogue", backend: "ollama" as const },
  { id: "mixtral:8x7b", name: "Mixtral 8x7B", size: "~26 GB", description: "High quality, MoE architecture", backend: "ollama" as const },
  { id: "phi3:3.8b", name: "Phi-3 3.8B", size: "~2 GB", description: "Microsoft's small but capable model", backend: "ollama" as const },
  { id: "gemma2:9b", name: "Gemma 2 9B", size: "~6 GB", description: "Google's high-quality model", backend: "ollama" as const },
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", size: "~4 GB", description: "Strong multilingual capabilities", backend: "ollama" as const },
  { id: "codellama:7b", name: "Code Llama 7B", size: "~4 GB", description: "Specialized for code generation", backend: "ollama" as const },
  { id: "nous-hermes2:7b", name: "Nous Hermes 2 7B", size: "~4 GB", description: "Fine-tuned for instruction following", backend: "ollama" as const },
  // ── Embedding Models ──
  { id: "bge-m3-f16", name: "BGE M3 (F16)", size: "~1.2 GB", description: "BAAI flagship: 100+ languages, 8192 ctx, dense+sparse+reranker — full precision", backend: "llamacpp" as const, url: "https://huggingface.co/gpustack/bge-m3-GGUF/resolve/main/bge-m3-FP16.gguf" },
  { id: "bge-m3-q8_0", name: "BGE M3 (Q8_0)", size: "~635 MB", description: "BAAI flagship multilingual embedding, near-lossless, 8192 ctx", backend: "llamacpp" as const, url: "https://huggingface.co/gpustack/bge-m3-GGUF/resolve/main/bge-m3-Q8_0.gguf" },
  { id: "bge-m3-q4_k_m", name: "BGE M3 (Q4_K_M)", size: "~438 MB", description: "BAAI flagship multilingual embedding, best size/quality ratio", backend: "llamacpp" as const, url: "https://huggingface.co/gpustack/bge-m3-GGUF/resolve/main/bge-m3-Q4_K_M.gguf" },
  { id: "embedding-gemma-300m-q8_0", name: "Embedding Gemma 300M (Q8_0)", size: "~329 MB", description: "Google Gemma-based embedding, compact & efficient", backend: "llamacpp" as const, url: "https://huggingface.co/stratalab-org/embedding-gemma-300M-GGUF/resolve/main/embedding-gemma-300M-Q8_0.gguf" },
  { id: "kalm-embedding-gemma3-12b-q4_k_m", name: "KaLM Embedding Gemma3 12B (Q4_K_M)", size: "~7.3 GB", description: "Tencent KaLM embedding on Gemma3, multilingual, top-tier quality", backend: "llamacpp" as const, url: "https://huggingface.co/mradermacher/KaLM-Embedding-Gemma3-12B-2511-GGUF/resolve/main/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf" },
  { id: "kalm-embedding-gemma3-12b-q8_0", name: "KaLM Embedding Gemma3 12B (Q8_0)", size: "~12.5 GB", description: "Near-lossless KaLM Gemma3 embedding, best Gemma embedding quality", backend: "llamacpp" as const, url: "https://huggingface.co/mradermacher/KaLM-Embedding-Gemma3-12B-2511-GGUF/resolve/main/KaLM-Embedding-Gemma3-12B-2511.Q8_0.gguf" },
  { id: "qwen3-embedding-0.6b-q8_0", name: "Qwen3 Embedding 0.6B (Q8_0)", size: "~639 MB", description: "Best size/quality ratio, modern multilingual embedding", backend: "llamacpp" as const, url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf" },
];
