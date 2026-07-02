/**
 * Model management routes — download, list, remove GGUF models.
 */
import { Hono } from "hono";
import {
  listModels,
  installModel,
  removeModel,
  getDownloadProgress,
  getOllamaStatus,
  getBackendsStatus,
  POPULAR_MODELS,
  browseDirectory,
  importLocalModel,
} from "../services/model-manager";
import { updateSettings } from "../services/settings";
import { getLogger } from "../utils/logger";
import { existsSync } from "node:fs";
import { join } from "node:path";

const log = getLogger("models-route");
const models = new Hono();

/**
 * GET /api/models — List all installed and available models.
 */
models.get("/models", async (c) => {
  const list = await listModels();
  const ollamaStatus = await getOllamaStatus();
  return c.json({
    models: list,
    ollama: ollamaStatus,
    catalog: POPULAR_MODELS,
  });
});

/**
 * GET /api/models/status — Ollama status check.
 */
models.get("/models/status", async (c) => {
  const status = await getOllamaStatus();
  return c.json(status);
});

/**
 * GET /api/backends — Which backends are available.
 */
models.get("/backends", async (c) => {
  const status = await getBackendsStatus();
  return c.json(status);
});

/**
 * POST /api/backends/:name/install — Install a backend via script.
 */
models.post("/backends/:name/install", async (c) => {
  const name = c.req.param("name");
  if (name !== "ollama" && name !== "llamacpp") {
    return c.json({ error: "Unknown backend: " + name }, 400);
  }

  const scriptPath = join(process.cwd(), "scripts", `install-${name}.sh`);
  if (!existsSync(scriptPath)) {
    return c.json({ error: "Install script not found" }, 404);
  }

  log.info({ backend: name }, "Starting backend install");

  try {
    const { execSync } = await import("node:child_process");
    const output = execSync(`bash "${scriptPath}"`, {
      timeout: 300000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    log.info({ backend: name, output: output.slice(-500) }, "Backend install complete");
    const status = await getBackendsStatus();
    return c.json({ status: "installed", backend: name, backends: status, output });
  } catch (err) {
    log.error({ err, backend: name }, "Backend install failed");
    return c.json({ error: err instanceof Error ? err.message : "Install failed" }, 500);
  }
});

/**
 * GET /api/models/progress — Active download progress.
 */
models.get("/models/progress", async (c) => {
  return c.json({ downloads: getDownloadProgress() });
});

/**
 * POST /api/models/install — Install a model.
 * Body: { source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }
 */
models.post("/models/install", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const source = (body.source as string) ?? (body.url as string) ?? "ollama";
  const name = body.name as string;
  const backend = (body.backend as "ollama" | "llamacpp") ?? "ollama";

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  log.info({ name, backend, source }, "Installing model (background)");

  installModel(source, name, backend, (progress) => {
    log.info({ model: name, percent: progress.percent }, "Download progress");
  }).catch((err) => {
    log.error({ err, name }, "Background install failed");
  });

  return c.json({ status: "downloading", name, backend });
});

/**
 * DELETE /api/models/:id — Remove a model.
 */
models.delete("/models/:id", async (c) => {
  const id = c.req.param("id");
  const success = await removeModel(id);
  if (!success) return c.json({ error: "Model not found" }, 404);
  return c.json({ status: "removed", id });
});

/**
 * GET /api/models/browse?path=/some/dir — Browse filesystem directory.
 */
models.get("/models/browse", async (c) => {
  const dirPath = c.req.query("path") ?? "/";
  const result = browseDirectory(dirPath);
  return c.json(result);
});

/**
 * POST /api/models/import — Import a local model file by path.
 * Body: { path: string }
 */
models.post("/models/import", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const filePath = body.path as string;

  if (!filePath) {
    return c.json({ error: "path is required" }, 400);
  }

  try {
    const model = await importLocalModel(filePath);
    if (!model) {
      return c.json({ error: "File not found or invalid" }, 404);
    }
    return c.json({ status: "imported", model });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * POST /api/models/apply — Apply a model to settings.
 * Body: { id: string }
 */
models.post("/models/apply", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const modelId = body.id as string;

  if (!modelId) {
    return c.json({ error: "id is required" }, 400);
  }

  const models = await listModels();
  const model = models.find((m) => m.id === modelId);
  if (!model) return c.json({ error: "Model not found" }, 404);

  const updates: Record<string, unknown> = {};

  if (model.backend === "ollama") {
    updates.llmBaseUrl = "http://localhost:11434/v1";
    updates.llmModel = model.name;
  } else if (model.backend === "llamacpp" && model.path) {
    updates.llmBaseUrl = "http://localhost:5001/v1";
    updates.llmModel = model.name;
  }

  await updateSettings(updates);
  return c.json({ status: "applied", model: model.name, settings: updates });
});

export { models as modelsRouter };
