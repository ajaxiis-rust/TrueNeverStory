/**
 * Settings routes — read/update application configuration.
 */
import { Hono } from "hono";
import { loadSettings, updateSettings, resetSettings, type AppSettings } from "../services/settings";
import { LANGUAGES, setLanguage } from "../i18n";
import { getLogger } from "../utils/logger";
import { safeJsonBody } from "../utils/safe-request";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

const log = getLogger("settings-route");
const settings = new Hono();

const LLM_CONFIG_PATH = join(process.cwd(), "conf", "llm-config.json");

interface LLMConfig {
  llmPort: number;
  llmModel: string;
  llmThreads: number;
  llmParallel: number;
  llmCtxSize: number;
  embedPort: number;
  embedModel: string;
  embedThreads: number;
  embedCtxSize: number;
}

function loadLLMConfig(): LLMConfig {
  if (existsSync(LLM_CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(LLM_CONFIG_PATH, "utf-8"));
    } catch (e) {
      log.warn({ err: e }, "Failed to parse llm-config.json");
    }
  }
  return {
    llmPort: 5001,
    llmModel: "Gemma 3 1B (Q4_K_M)",
    llmThreads: 2,
    llmParallel: 2,
    llmCtxSize: 8192,
    embedPort: 5002,
    embedModel: "BGE M3",
    embedThreads: 1,
    embedCtxSize: 8192,
  };
}

function saveLLMConfig(config: Partial<LLMConfig>): void {
  const current = loadLLMConfig();
  const updated = { ...current, ...config };
  writeFileSync(LLM_CONFIG_PATH, JSON.stringify(updated, null, 2));
  log.info({ config: updated }, "LLM config saved");
}

function killLlamaServers(): number[] {
  const config = loadLLMConfig();
  const killed: number[] = [];
  try {
    // Find llama-server PIDs by port via /proc/*/cmdline (never read fd symlinks — readFileSync on a pipe fd blocks the event loop)
    const killByPort = (port: number) => {
      try {
        for (const d of readdirSync("/proc")) {
          if (!/^\d+$/.test(d)) continue;
          try {
            const cmdline = readFileSync(join("/proc", d, "cmdline"), "utf-8");
            if (cmdline.includes("llama-server") && cmdline.includes("--port") && cmdline.includes(String(port))) {
              const pid = parseInt(d);
              try { process.kill(pid, "SIGTERM"); killed.push(pid); } catch (e) { log.debug({ err: e, pid }, "Failed to kill process"); }
              log.info({ pid, port }, "Killed llama-server");
            }
          } catch { /* process gone or unreadable */ }
        }
      } catch (e) { log.debug({ err: e, port }, "Failed to scan /proc for port"); }
    };

    killByPort(config.llmPort);
    killByPort(config.embedPort);
  } catch (e) {
    log.warn({ err: e }, "Failed to kill llama-server processes");
  }
  return killed;
}

function findModel(name: string): string {
  const modelDirs = [join(process.cwd(), "local-models")];
  for (const dir of modelDirs) {
    try {
      const files = readdirSync(dir);
      // Exact match first
      const exact = files.find(f => f.toLowerCase() === `${name}.gguf`);
      if (exact) return join(dir, exact);
      // Partial match
      const partial = files.find(f => f.toLowerCase().includes(name.toLowerCase()) && f.endsWith(".gguf"));
      if (partial) return join(dir, partial);
      // Slug-normalized match ("BGE M3" → "bge-m3")
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const slugged = slug ? files.find(f => f.toLowerCase().includes(slug) && f.endsWith(".gguf")) : undefined;
      if (slugged) return join(dir, slugged);
    } catch (e) { log.debug({ err: e, dir, name }, "Failed to scan model directory"); }
  }
  return "";
}

function startLlamaServers(): void {
  const config = loadLLMConfig();
  const llamaBin = `dist/${process.arch === "arm64" ? "linux-arm64" : "linux-x64"}/llama-server`;

  const llmModelPath = findModel(config.llmModel);
  const embedModelPath = findModel(config.embedModel);

  if (llmModelPath) {
    const args = [
      "--model", llmModelPath,
      "--host", "127.0.0.1",
      "--port", String(config.llmPort),
      "--ctx-size", String(config.llmCtxSize),
      "--threads", String(config.llmThreads),
      "--parallel", String(config.llmParallel),
    ];
    const child = spawn(llamaBin, args, { detached: true, stdio: "ignore" });
    child.unref();
    log.info({ port: config.llmPort, model: config.llmModel, pid: child.pid }, "Started LLM server");
  } else {
    log.warn({ model: config.llmModel }, "LLM model not found");
  }

  if (embedModelPath) {
    const args = [
      "--model", embedModelPath,
      "--host", "127.0.0.1",
      "--port", String(config.embedPort),
      "--ctx-size", String(config.embedCtxSize),
      "--threads", String(config.embedThreads),
      "--embedding",
      "--pooling", "mean",
    ];
    const child = spawn(llamaBin, args, { detached: true, stdio: "ignore" });
    child.unref();
    log.info({ port: config.embedPort, model: config.embedModel, pid: child.pid }, "Started embedding server");
  } else {
    log.warn({ model: config.embedModel }, "Embedding model not found");
  }
}

/**
 * GET /api/settings — Get current settings (masks API keys).
 */
settings.get("/settings", async (c) => {
  const s = loadSettings();
  setLanguage(s.language);
  return c.json({
    ...s,
    llmApiKey: s.llmApiKey ? "••••••••" : "",
    embeddingApiKey: s.embeddingApiKey ? "••••••••" : "",
    authPassword: s.authPassword ? "••••••••" : "",
  });
});

/**
 * GET /api/languages — List available languages.
 */
settings.get("/languages", async (c) => {
  return c.json({ languages: LANGUAGES });
});

/**
 * PUT /api/settings — Update settings.
 */
settings.put("/settings", async (c) => {
  const body = await safeJsonBody(c) as Record<string, unknown>;

  const allowed = { ...body };
  if (allowed.llmApiKey === "••••••••") delete allowed.llmApiKey;
  if (allowed.embeddingApiKey === "••••••••") delete allowed.embeddingApiKey;
  if (allowed.authPassword === "••••••••") delete allowed.authPassword;

  // Hash password if changed
  if (allowed.authPassword && typeof allowed.authPassword === "string") {
    const { randomBytes, pbkdf2Sync } = await import("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(allowed.authPassword, salt, 100_000, 64, "sha512").toString("hex");
    allowed.authPassword = `${salt}:${hash}`;
    log.info("Password hash generated for new password");
  }

  const updated = await updateSettings(allowed as Partial<AppSettings>);
  return c.json({
    status: "updated",
    settings: {
      ...updated,
      llmApiKey: updated.llmApiKey ? "••••••••" : "",
      embeddingApiKey: updated.embeddingApiKey ? "••••••••" : "",
      authPassword: updated.authPassword ? "••••••••" : "",
    },
  });
});

/**
 * POST /api/settings/reset — Reset to defaults.
 */
settings.post("/settings/reset", async (c) => {
  const s = resetSettings();
  return c.json({ status: "reset", settings: s });
});

/**
 * GET /api/agents/:id/config — Get agent config.
 */
settings.get("/agents/:id/config", async (c) => {
  const agentId = c.req.param("id");
  const { loadAgentConfig } = await import("../services/agent-config");
  const config = loadAgentConfig(agentId);
  return c.json({ agentId, config });
});

/**
 * PUT /api/agents/:id/config — Update agent config.
 */
settings.put("/agents/:id/config", async (c) => {
  const agentId = c.req.param("id");
  const body = await safeJsonBody(c) as {
    providerId?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    enabled?: boolean;
  };

  const { loadAgentConfig, saveAgentConfig } = await import("../services/agent-config");
  const current = loadAgentConfig(agentId);

  const updated = {
    ...current,
    ...body,
    id: agentId,
  };

  saveAgentConfig(agentId, updated);
  log.info({ agentId, updates: body }, "Agent config updated");
  return c.json({ status: "updated", agentId, config: updated });
});

/**
 * GET /api/llm-config — Get LLM server configuration.
 */
settings.get("/llm-config", async (c) => {
  return c.json(loadLLMConfig());
});

/**
 * PUT /api/llm-config — Update LLM server configuration.
 */
settings.put("/llm-config", async (c) => {
  const body = await safeJsonBody(c) as Partial<LLMConfig>;
  saveLLMConfig(body);
  return c.json({ status: "updated", config: loadLLMConfig() });
});

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(200);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.connect(port, "127.0.0.1");
  });
}

/** Wait until nothing accepts connections on the port (llama-server needs seconds to release it). */
async function waitPortFree(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Wait until the server's /health returns 200 — llama-server binds the socket early but answers 200 only after the model is loaded. */
async function waitServerHealthy(port: number, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Guard against overlapping restarts — two concurrent restarts multiply RAM usage (old process dying + new one loading). */
let _restartInProgress = false;

/**
 * POST /api/server/restart — Restart LLM servers with current config.
 * Held (bounded) until servers are back up; concurrent calls get 409.
 */
settings.post("/server/restart", async (c) => {
  if (_restartInProgress) {
    return c.json({ status: "error", message: "Restart already in progress" }, 409);
  }
  _restartInProgress = true;
  try {
    const config = loadLLMConfig();
    const killed = killLlamaServers();
    // Wait until ports are actually released — spawning earlier makes the new server die on bind
    await Promise.all([waitPortFree(config.llmPort), waitPortFree(config.embedPort)]);
    // SIGTERM is unreliable while llama-server is loading — escalate so the dying
    // process cannot hold RAM alongside the freshly spawned one (double-restart OOM)
    for (const pid of killed) {
      try {
        process.kill(pid, 0);
        try { process.kill(pid, "SIGKILL"); log.info({ pid }, "SIGKILL to lingering llama-server"); } catch { /* raced exit */ }
      } catch { /* already gone */ }
    }
    startLlamaServers();
    // Hold the guard until servers are actually healthy so a concurrent restart cannot overlap
    const [llmUp, embedUp] = await Promise.all([waitServerHealthy(config.llmPort), waitServerHealthy(config.embedPort)]);
    return c.json({
      status: "restarted",
      message: llmUp && embedUp ? "LLM servers up" : "Servers spawned but not healthy yet (still loading)",
    });
  } catch (e) {
    log.error({ err: e }, "Failed to restart servers");
    return c.json({ status: "error", message: String(e) }, 500);
  } finally {
    _restartInProgress = false;
  }
});

/**
 * GET /api/server/status — Check LLM server status.
 */
settings.get("/server/status", async (c) => {
  const config = loadLLMConfig();

  const llmRunning = await isPortOpen(config.llmPort);
  const embedRunning = await isPortOpen(config.embedPort);

  return c.json({
    llmPort: config.llmPort,
    llmRunning,
    embedPort: config.embedPort,
    embedRunning,
  });
});

export { settings as settingsRouter };
