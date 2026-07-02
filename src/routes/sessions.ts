/**
 * Session history routes — full implementation.
 * Replaces api.py session endpoints.
 */
import { Hono } from "hono";
import { join } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { HistoryManager } from "../lib/history-manager";
import { getConfig } from "../config/env";

const sessions = new Hono();

let _historyMgr: HistoryManager | null = null;

export function initSessions(historyMgr: HistoryManager): void {
  _historyMgr = historyMgr;
}

/**
 * GET /sessions — List all session histories.
 */
sessions.get("/sessions", async (c) => {
  if (!_historyMgr) return c.json([]);
  return c.json(_historyMgr.listSessions());
});

/**
 * GET /sessions/list — List available game sessions.
 */
sessions.get("/sessions/list", async (c) => {
  if (!_historyMgr) return c.json({ sessions: [], count: 0 });
  const list = _historyMgr.listSessions();
  return c.json({ sessions: list, count: list.length });
});

/**
 * GET /sessions/:sessionId/history — Get conversation history.
 */
sessions.get("/sessions/:sessionId/history", async (c) => {
  const sessionId = c.req.param("sessionId");
  if (!_historyMgr) return c.json({ session_id: sessionId, turns: [] });

  const turns = _historyMgr.getHistory(sessionId);
  return c.json({ session_id: sessionId, turns });
});

/**
 * GET /sessions/:sessionId/summarize — Summarize a session.
 */
sessions.get("/sessions/:sessionId/summarize", async (c) => {
  const sessionId = c.req.param("sessionId");
  if (!_historyMgr) return c.json({ session_id: sessionId, summary: "No conversation history found." });

  const turns = _historyMgr.getLastN(sessionId, 30);
  if (!turns.length) {
    return c.json({ session_id: sessionId, summary: "No conversation history found." });
  }

  const convText = turns.map((t) => `${t.role}: ${t.content}`).join("\n");
  return c.json({
    session_id: sessionId,
    summary: `Session has ${turns.length} turns. Summary requires LLM integration.`,
    turn_count: turns.length,
  });
});

/**
 * POST /sessions/export — Export session to a markdown file.
 * Body: { session_id?: string, messages: Array<{role, content, timestamp?}> }
 */
sessions.post("/sessions/export", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = (body.session_id as string) || `session_${Math.floor(Date.now() / 1000)}`;
  const messages = (body.messages as Array<{ role: string; content: string; timestamp?: string }>) ?? [];

  if (!messages.length) {
    return c.json({ error: "No messages to export" }, 400);
  }

  const cfg = getConfig();
  const exportsDir = join(cfg.WORLD_DB_PATH, "exports");
  if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });

  const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${sessionId}_${date}.md`;
  const filePath = join(exportsDir, filename);

  let md = `# Session: ${sessionId}\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    const ts = msg.timestamp ? ` _(${msg.timestamp})_` : "";
    if (msg.role === "user") {
      md += `### You${ts}\n\n${msg.content}\n\n`;
    } else if (msg.role === "narrative" || msg.role === "assistant") {
      md += `### Narrator${ts}\n\n${msg.content}\n\n`;
    } else if (msg.role === "system") {
      md += `> **System:** ${msg.content}\n\n`;
    } else {
      md += `### ${msg.role}${ts}\n\n${msg.content}\n\n`;
    }
  }

  md += `---\n\n_Exported by TrueNeverStory Engine_\n`;

  await writeFile(filePath, md, "utf-8");

  return c.json({ status: "saved", path: filePath, filename });
});

/**
 * GET /sessions/exports — List all exported markdown files.
 */
sessions.get("/sessions/exports", async (c) => {
  const cfg = getConfig();
  const exportsDir = join(cfg.WORLD_DB_PATH, "exports");
  if (!existsSync(exportsDir)) return c.json({ files: [] });

  const files = readdirSync(exportsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ filename: f }))
    .sort((a, b) => b.filename.localeCompare(a.filename));

  return c.json({ files });
});

/**
 * GET /sessions/exports/:filename — Load an exported markdown file.
 */
sessions.get("/sessions/exports/:filename", async (c) => {
  const filename = c.req.param("filename");
  const cfg = getConfig();
  const filePath = join(cfg.WORLD_DB_PATH, "exports", filename);

  if (!existsSync(filePath)) return c.json({ error: "File not found" }, 404);

  const content = await readFile(filePath, "utf-8");
  const messages: Array<{ role: string; content: string }> = [];

  const blocks = content.split(/^### /m).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0] ?? "";
    const body = lines.slice(1).join("\n").trim();

    if (!body) continue;

    if (header.startsWith("You")) {
      messages.push({ role: "user", content: body });
    } else if (header.startsWith("Narrator")) {
      messages.push({ role: "narrative", content: body });
    } else {
      messages.push({ role: header.replace(/\s*\(.*\)$/, "").trim(), content: body });
    }
  }

  return c.json({ filename, messages });
});

export { sessions as sessionsRouter };
