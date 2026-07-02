/**
 * Settings routes — read/update application configuration.
 */
import { Hono } from "hono";
import { loadSettings, updateSettings, resetSettings, type AppSettings } from "../services/settings";
import { LANGUAGES, setLanguage } from "../i18n";
import { getLogger } from "../utils/logger";
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

function killLlamaServers(): void {
  const config = loadLLMConfig();
  try {
    // Find llama-server PIDs by port using /proc
    const killByPort = (port: number) => {
      try {
        const pids = readdirSync("/proc")
          .filter(d => /^\d+$/.test(d))
          .map(d => {
            try {
              const fdDir = join("/proc", d, "fd");
              const fds = readdirSync(fdDir);
              for (const fd of fds) {
                try {
                  const link = readFileSync(join(fdDir, fd), "utf-8");
                  if (link.includes("socket:") && existsSync(join("/proc", d, "cmdline"))) {
                    const cmdline = readFileSync(join("/proc", d, "cmdline"), "utf-8");
                    if (cmdline.includes("llama-server") && cmdline.includes("--port") && cmdline.includes(String(port))) {
                      return parseInt(d);
                    }
                  }
                } catch {}
              }
            } catch {}
            return null;
          })
          .filter((p): p is number => p !== null);

        for (const pid of pids) {
          try { process.kill(pid, "SIGTERM"); } catch {}
          log.info({ pid, port }, "Killed llama-server");
        }
      } catch {}
    };

    killByPort(config.llmPort);
    killByPort(config.embedPort);
  } catch (e) {
    log.warn({ err: e }, "Failed to kill llama-server processes");
  }
}

function findModel(name: string): string {
  const modelDirs = ["/home/opc/prj/HIBRING/local-models", "/home/opc/koboldcpp/models"];
  for (const dir of modelDirs) {
    try {
      const files = readdirSync(dir);
      // Exact match first
      const exact = files.find(f => f.toLowerCase() === `${name}.gguf`);
      if (exact) return join(dir, exact);
      // Partial match
      const partial = files.find(f => f.toLowerCase().includes(name.toLowerCase()) && f.endsWith(".gguf"));
      if (partial) return join(dir, partial);
    } catch {}
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
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

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
  const body = await c.req.json().catch(() => ({})) as {
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
  const body = await c.req.json().catch(() => ({})) as Partial<LLMConfig>;
  saveLLMConfig(body);
  return c.json({ status: "updated", config: loadLLMConfig() });
});

/**
 * POST /api/server/restart — Restart LLM servers with current config.
 */
settings.post("/server/restart", async (c) => {
  try {
    killLlamaServers();
    // Wait a bit for processes to die
    await new Promise(resolve => setTimeout(resolve, 1000));
    startLlamaServers();
    return c.json({ status: "restarted", message: "LLM servers restarting" });
  } catch (e) {
    log.error({ err: e }, "Failed to restart servers");
    return c.json({ status: "error", message: String(e) }, 500);
  }
});

/**
 * GET /api/server/status — Check LLM server status.
 */
settings.get("/server/status", async (c) => {
  const config = loadLLMConfig();

  const isPortOpen = (port: number): Promise<boolean> => new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(200);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.connect(port, "127.0.0.1");
  });

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
