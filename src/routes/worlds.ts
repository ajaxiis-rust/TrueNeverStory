/**
 * World management routes — CRUD, switching, LLM generation, chapters.
 */
import { Hono } from "hono";
import {
  listWorlds,
  createWorld,
  deleteWorld,
  getWorldFrame,
  updateWorldFrame,
  setActiveWorld,
  getActiveWorld,
  resolveDbPath,
  type WorldCreateParams,
} from "../services/world-manager";
import { getSettings } from "../services/settings";
import { getLogger } from "../utils/logger";
import { join } from "node:path";
import { existsSync, readdirSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { getConfig } from "../config/env";

const log = getLogger("worlds-route");
const worlds = new Hono();

function isValidWorldName(name: string): boolean {
  return /^[a-zA-Z0-9_\-]+$/.test(name) && name.length > 0 && name.length <= 64;
}

let _narrativeCtx: { reset: (dbPath: string, worldFrame: Record<string, unknown>) => Promise<void> } | null = null;
let _engine: { reset: (dbPath: string) => void } | null = null;

export function setWorldServices(
  narrativeCtx: { reset: (dbPath: string, worldFrame: Record<string, unknown>) => Promise<void> },
  engine: { reset: (dbPath: string) => void },
): void {
  _narrativeCtx = narrativeCtx;
  _engine = engine;
}

/**
 * GET /worlds — List all worlds.
 */
worlds.get("/worlds", async (c) => {
  const active = getActiveWorld();
  const list = listWorlds();
  return c.json({ worlds: list, active });
});

/**
 * GET /worlds/active — Get active world name (lightweight, for topbar).
 */
worlds.get("/worlds/active", async (c) => {
  return c.json({ active: getActiveWorld() });
});

/**
 * GET /worlds/:name — Get world details + frame.
 */
worlds.get("/worlds/:name", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  const frame = getWorldFrame(name);
  if (!frame) return c.json({ error: "World not found" }, 404);
  return c.json({ name, frame });
});

/**
 * POST /worlds — Create a new world.
 */
worlds.post("/worlds", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Partial<WorldCreateParams>;
  const name = body.name ?? "";
  if (!name.trim()) return c.json({ error: "World name is required" }, 400);

  try {
    const world = await createWorld({
      name,
      title: body.title ?? name,
      description: body.description ?? "",
      genre: body.genre ?? "fantasy",
      language: body.language ?? "en",
      worldRules: body.worldRules ?? [],
      magicSystem: body.magicSystem ?? "",
    });
    return c.json({ status: "created", world });
  } catch (err) {
    log.error({ err }, "Failed to create world");
    return c.json({ error: "Failed to create world" }, 409);
  }
});

/**
 * PUT /worlds/:name — Update world frame.
 */
worlds.put("/worlds/:name", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  const body = await c.req.json().catch(() => ({}));
  try {
    const frame = await updateWorldFrame(name, body);
    return c.json({ status: "updated", frame });
  } catch (err) {
    log.error({ err }, "Failed to update world");
    return c.json({ error: "World not found" }, 404);
  }
});

/**
 * DELETE /worlds/:name — Delete a world.
 */
worlds.delete("/worlds/:name", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  try {
    await deleteWorld(name);
    return c.json({ status: "deleted" });
  } catch (err) {
    log.error({ err }, "Failed to delete world");
    return c.json({ error: "Failed to delete world" }, 400);
  }
});

/**
 * POST /worlds/:name/switch — Switch active world.
 */
worlds.post("/worlds/:name/switch", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  try {
    setActiveWorld(name);

    if (_narrativeCtx && _engine) {
      const dbPath = join(getConfig().WORLDS_ROOT, name);
      const worldFramePath = join(dbPath, "world_frame.json");
      let worldFrame: Record<string, unknown> = {};
      if (existsSync(worldFramePath)) {
        try { worldFrame = JSON.parse(readFileSync(worldFramePath, "utf-8")); } catch {}
      }
      await _narrativeCtx.reset(dbPath, worldFrame);
      _engine.reset(dbPath);
      log.info({ world: name }, "Soft reset completed");
    }

    return c.json({ status: "switched", active: name });
  } catch (err) {
    log.error({ err }, "Failed to switch world");
    return c.json({ error: "Failed to switch world" }, 400);
  }
});

/**
 * POST /worlds/:name/chapters/generate — Generate literary chapter from sessions.
 */
worlds.post("/worlds/:name/chapters/generate", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  const body = await c.req.json().catch(() => ({})) as { sessionId?: string; prompt?: string };
  const worldPath = join(getSettings().dbPath.replace(/world_db$/, ""), name);

  // Resolve path through worlds root
  const { getConfig } = await import("../config/env");
  const actualWorldPath = join(getConfig().WORLDS_ROOT, name);
  if (!existsSync(actualWorldPath)) {
    return c.json({ error: "World not found" }, 404);
  }

  // Collect session turns
  const sessionDir = join(actualWorldPath, "session_history");
  let turns: Array<{ role: string; content: string }> = [];

  if (body.sessionId) {
    const sessionPath = join(sessionDir, `${body.sessionId}.json`);
    if (existsSync(sessionPath)) {
      const data = JSON.parse(readFileSync(sessionPath, "utf-8"));
      turns = data.turns ?? [];
    }
  } else {
    // Collect from all sessions
    if (existsSync(sessionDir)) {
      const files = readdirSync(sessionDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .slice(-5); // last 5 sessions
      for (const file of files) {
        const data = JSON.parse(readFileSync(join(sessionDir, file), "utf-8"));
        turns.push(...(data.turns ?? []));
      }
    }
  }

  if (turns.length === 0) {
    return c.json({ error: "No session data found to generate chapter from" }, 400);
  }

  // Build prompt for LLM
  const frame = getWorldFrame(name) ?? {};
  const dialogueText = turns
    .slice(-100)
    .map((t) => `${t.role === "user" ? "Player" : "Narrator"}: ${t.content}`)
    .join("\n\n");

  const chapterPrompt = `You are a skilled literary author. Transform the following roleplay dialogue into a polished, literary chapter of a novel.

World: ${frame.title ?? name}
Genre: ${frame.genre ?? "fantasy"}
${frame.description ? `Setting: ${frame.description}` : ""}

${body.prompt ? `Additional instructions: ${body.prompt}` : ""}

Dialogue to transform:
${dialogueText}

Write a cohesive literary chapter (1000-2000 words). Use第三人称叙事, rich descriptions, character development, and atmospheric prose. Maintain the story's events but elevate the language to literary quality. Do NOT include dialogue tags like "Player:" or "Narrator:" — weave everything into narrative prose.`;

  // Call LLM
  const { LLMClient } = await import("../lib/llm-client");
  const llm = new LLMClient();
  const chapter = await llm.generateText(chapterPrompt, { temperature: 0.8, maxTokens: 4096 });

  // Save chapter
  const chaptersDir = join(actualWorldPath, "chapters");
  if (!existsSync(chaptersDir)) mkdirSync(chaptersDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `chapter_${timestamp}.md`;
  const chapterPath = join(chaptersDir, filename);

  const mdContent = `# Chapter — ${new Date().toLocaleDateString()}\n\n${chapter.trim()}\n`;
  await writeFile(chapterPath, mdContent, "utf-8");

  log.info({ world: name, filename }, "Chapter generated");
  return c.json({ status: "generated", filename, content: mdContent });
});

/**
 * GET /worlds/:name/chapters — List generated chapters.
 */
worlds.get("/worlds/:name/chapters", async (c) => {
  const name = c.req.param("name");
  if (!isValidWorldName(name)) return c.json({ error: "Invalid world name" }, 400);
  const { getConfig } = await import("../config/env");
  const worldPath = join(getConfig().WORLDS_ROOT, name);
  const chaptersDir = join(worldPath, "chapters");

  if (!existsSync(chaptersDir)) {
    return c.json({ chapters: [] });
  }

  const files = readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const chapters = files.map((f) => ({
    filename: f,
    size: statSync(join(chaptersDir, f)).size,
    modified: statSync(join(chaptersDir, f)).mtime.toISOString(),
  }));

  return c.json({ chapters });
});

/**
 * GET /worlds/:name/chapters/:filename — Get chapter content.
 */
worlds.get("/worlds/:name/chapters/:filename", async (c) => {
  const name = c.req.param("name");
  const filename = c.req.param("filename");
  if (!/^[a-zA-Z0-9_\-]+\.md$/.test(filename)) {
    return c.json({ error: "Invalid filename" }, 400);
  }
  const { getConfig } = await import("../config/env");
  const chapterPath = join(getConfig().WORLDS_ROOT, name, "chapters", filename);

  if (!existsSync(chapterPath)) {
    return c.json({ error: "Chapter not found" }, 404);
  }

  const content = await readFile(chapterPath, "utf-8");
  return c.json({ filename, content });
});

export { worlds as worldsRouter };
