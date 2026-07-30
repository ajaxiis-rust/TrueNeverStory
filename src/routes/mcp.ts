/**
 * MCP Console REST API — database management endpoints.
 * Active only when TNS_MCP_MODE=1.
 */
import { Hono } from "hono";
import { BibleParser } from "@/mcp/bible/parser";
import { CharacterDB } from "@/mcp/bible/characters";
import { GutenbergParser } from "@/mcp/gutenberg/parser";
import { WikipediaMCPTools } from "@/mcp/tools/wikipedia";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { Database } from "bun:sqlite";

export const mcpRouter = new Hono();

// ── DB Paths ──────────────────────────────────────────────────

const BIBLE_DB = join(process.cwd(), "data", "bible", "bible.db");
const GUTENBERG_DB = join(process.cwd(), "data", "mcp", "gutenberg-bookcorpus.db");
const WIKIPEDIA_DB = join(process.cwd(), "data", "mcp", "wikipedia.db");
const LIT_COMP_DB = join(process.cwd(), "data", "literary-compiler", "classics-compiled.db");
const ECON_DB = join(process.cwd(), "data", "literary-compiler", "economic.db");

// ── SSE Progress Tracking ─────────────────────────────────────

interface Job {
  id: string;
  status: "running" | "done" | "error";
  progress: number;
  message: string;
  result?: unknown;
  listeners: Set<(data: string) => void>;
}

const jobs = new Map<string, Job>();

function createJob(): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    status: "running",
    progress: 0,
    message: "Starting...",
    listeners: new Set(),
  };
  jobs.set(id, job);
  return job;
}

function updateJob(job: Job, progress: number, message: string) {
  job.progress = progress;
  job.message = message;
  const data = JSON.stringify({ progress, message, status: job.status });
  for (const listener of job.listeners) {
    listener(`data: ${data}\n\n`);
  }
}

function completeJob(job: Job, result: unknown) {
  job.status = "done";
  job.progress = 100;
  job.message = "Done";
  job.result = result;
  const data = JSON.stringify({ progress: 100, message: "Done", status: "done", result });
  for (const listener of job.listeners) {
    listener(`data: ${data}\n\n`);
  }
  setTimeout(() => jobs.delete(job.id), 5 * 60 * 1000);
}

function failJob(job: Job, error: string) {
  job.status = "error";
  job.message = error;
  const data = JSON.stringify({ progress: job.progress, message: error, status: "error" });
  for (const listener of job.listeners) {
    listener(`data: ${data}\n\n`);
  }
  setTimeout(() => jobs.delete(job.id), 5 * 60 * 1000);
}

// ── Helper: run script with job tracking ──────────────────────

function runScriptWithJob(
  command: string[],
  cwd: string = process.cwd(),
): { jobId: string; stream: string } {
  const job = createJob();
  updateJob(job, 5, "Starting...");

  (async () => {
    try {
      const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
      updateJob(job, 50, "Running...");
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        completeJob(job, { stdout, stderr });
      } else {
        failJob(job, `Exit code: ${exitCode}${stderr ? "\n" + stderr : ""}`);
      }
    } catch (err) {
      failJob(job, String(err));
    }
  })();

  return { jobId: job.id, stream: `/mcp/stream/${job.id}` };
}

// ═══════════════════════════════════════════════════════════════
//  SSE Stream
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/stream/:jobId", (c) => {
  const jobId = c.req.param("jobId");
  const job = jobs.get(jobId);
  if (!job) return c.json({ error: "Job not found" }, 404);

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          controller.enqueue(encoder.encode(data));
        };

        send(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
        job.listeners.add(send);

        c.req.raw.signal.addEventListener("abort", () => {
          job.listeners.delete(send);
          controller.close();
        });
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
});

// ═══════════════════════════════════════════════════════════════
//  Bible
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/bible/stats", (c) => {
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found", exists: false }, 404);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const verseCount = parser.getVerseCount();
    const books = parser.getBooks();
    const charDB = new CharacterDB(parser);
    let charCount = 0;
    try { charCount = charDB.getAll().length; } catch { /* no char table */ }
    return c.json({ exists: true, verses: verseCount, books: books.length, characters: charCount, dbPath: BIBLE_DB });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/search", (c) => {
  const q = c.req.query("q") ?? "";
  const book = c.req.query("book");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 404);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const results = parser.search(q, { limit, book: book ?? undefined });
    return c.json({ results, query: q, book, limit });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/books", (c) => {
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 404);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const books = parser.getBooks();
    return c.json({ books });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/characters", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 404);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const charDB = new CharacterDB(parser);
    const results = charDB.search(q, limit);
    return c.json({ results, query: q });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/character/:id", (c) => {
  const id = c.req.param("id");
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 404);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const charDB = new CharacterDB(parser);
    const all = charDB.getAll();
    const character = all.find((ch) => ch.id === id || ch.canonical_name === id);
    if (!character) return c.json({ error: "Character not found" }, 404);
    return c.json({ character });
  } finally {
    parser.close();
  }
});

mcpRouter.post("/bible/bootstrap", async (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/bootstrap-bible-db.ts"]);
  return c.json(result);
});

mcpRouter.post("/bible/compact", async (c) => {
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 404);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", BIBLE_DB, "--dst", BIBLE_DB + ".compact"]);
  return c.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  Gutenberg
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/gutenberg/stats", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found", exists: false }, 404);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const styles = parser.getAllStyles();
    const stat = statSync(GUTENBERG_DB);
    return c.json({ exists: true, styles: styles.length, size: stat.size, dbPath: GUTENBERG_DB });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/gutenberg/search", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const mood = c.req.query("mood") ?? undefined;
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 404);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const results = parser.searchStyles(q, { limit, mood });
    return c.json({ results, query: q, limit });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/gutenberg/styles", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 404);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const styles = parser.getAllStyles();
    return c.json({ styles });
  } finally {
    parser.close();
  }
});

mcpRouter.post("/gutenberg/download", (c) => {
  const result = runScriptWithJob(["python3", "scripts/download-gutenberg-corpus.py"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/convert", (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/parquet-to-sqlite.ts"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/compact", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 404);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/delexify", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 404);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const result = parser.delexify(text);
    return c.json({ original: text, delexified: result });
  } finally {
    parser.close();
  }
});

// ═══════════════════════════════════════════════════════════════
//  Wikipedia
// ═══════════════════════════════════════════════════════════════

const wikipediaTools = new WikipediaMCPTools();

mcpRouter.get("/wikipedia/stats", (c) => {
  if (!existsSync(WIKIPEDIA_DB)) return c.json({ error: "Wikipedia DB not found", exists: false }, 404);
  const stat = statSync(WIKIPEDIA_DB);
  return c.json({ exists: true, size: stat.size, dbPath: WIKIPEDIA_DB });
});

mcpRouter.get("/wikipedia/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const result = await wikipediaTools.getContext({ topic: q });
  return c.json({ results: result, query: q });
});

mcpRouter.get("/wikipedia/article/:id", async (c) => {
  const id = c.req.param("id");
  const result = await wikipediaTools.getContext({ topic: id });
  return c.json({ article: result, id });
});

mcpRouter.post("/wikipedia/download", (c) => {
  return c.json({ message: "Wikipedia download not yet implemented", status: "pending" });
});

mcpRouter.post("/wikipedia/convert", (c) => {
  return c.json({ message: "Wikipedia convert not yet implemented", status: "pending" });
});

mcpRouter.post("/wikipedia/compact", (c) => {
  if (!existsSync(WIKIPEDIA_DB)) return c.json({ error: "Wikipedia DB not found" }, 404);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", WIKIPEDIA_DB, "--dst", WIKIPEDIA_DB + ".compact"]);
  return c.json(result);
});

mcpRouter.post("/wikipedia/verify", async (c) => {
  const { claim } = await c.req.json<{ claim: string }>();
  const result = await wikipediaTools.verifyFact({ claim });
  return c.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  LiteraryCompiler
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/literary/stats", (c) => {
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found", exists: false }, 404);
  const stat = statSync(LIT_COMP_DB);
  let templates = 0;
  try {
    const db = new Database(LIT_COMP_DB, { readonly: true });
    const row = db.query("SELECT COUNT(*) as n FROM scene_templates").get() as { n: number } | null;
    templates = row?.n ?? 0;
    db.close();
  } catch { /* table may not exist */ }
  return c.json({ exists: true, templates, size: stat.size, dbPath: LIT_COMP_DB });
});

mcpRouter.get("/literary/templates", (c) => {
  const q = c.req.query("q") ?? "";
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found" }, 404);
  let templates: unknown[] = [];
  try {
    const db = new Database(LIT_COMP_DB, { readonly: true });
    templates = db.query("SELECT * FROM scene_templates WHERE name LIKE ? OR description LIKE ? LIMIT 50")
      .all(`%${q}%`, `%${q}%`) as unknown[];
    db.close();
  } catch { /* table may not exist */ }
  return c.json({ templates, query: q });
});

mcpRouter.post("/literary/compile", (c) => {
  return c.json({ message: "Literary compile not yet implemented as standalone script", status: "pending" });
});

mcpRouter.post("/literary/compact", (c) => {
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found" }, 404);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", LIT_COMP_DB, "--dst", LIT_COMP_DB + ".compact"]);
  return c.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  Economics
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/economics/stats", (c) => {
  if (!existsSync(ECON_DB)) return c.json({ error: "Economics DB not found", exists: false }, 404);
  const stat = statSync(ECON_DB);
  return c.json({ exists: true, size: stat.size, dbPath: ECON_DB });
});

mcpRouter.get("/economics/phase", (c) => {
  return c.json({ phase: "normal", message: "Economic phase query requires EconomicService initialization" });
});

mcpRouter.get("/economics/dilemma", (c) => {
  return c.json({ dilemma: null, message: "Dilemma generation requires EconomicService initialization" });
});

// ═══════════════════════════════════════════════════════════════
//  System
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/status", (c) => {
  const dbs = [
    { name: "bible", path: BIBLE_DB },
    { name: "gutenberg", path: GUTENBERG_DB },
    { name: "wikipedia", path: WIKIPEDIA_DB },
    { name: "literary", path: LIT_COMP_DB },
    { name: "economics", path: ECON_DB },
  ];

  const status = dbs.map((db) => {
    const exists = existsSync(db.path);
    const size = exists ? statSync(db.path).size : 0;
    return { name: db.name, exists, size, path: db.path };
  });

  return c.json({
    databases: status,
    mcpMode: process.env.TNS_MCP_MODE === "1",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

mcpRouter.post("/rebuild-index", (c) => {
  return c.json({ message: "Rebuild index not yet implemented", status: "pending" });
});

mcpRouter.post("/clean-orphans", (c) => {
  return c.json({ message: "Clean orphans not yet implemented", status: "pending" });
});
