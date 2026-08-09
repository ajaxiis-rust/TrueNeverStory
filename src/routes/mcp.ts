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
import { getLogger } from "../utils/logger";
import { EconomicDB } from "@/mcp/literary-compiler/economic-schema";
import { EconomicService } from "@/services/economic-service";
import { JubileeManager } from "@/mcp/literary-compiler/jubilee-manager";

const log = getLogger("mcp-route");

export const mcpRouter = new Hono();

// ── DB Paths ──────────────────────────────────────────────────

const BIBLE_DB = join(process.cwd(), "data", "bible", "bible-normalized.db");
const GUTENBERG_DB = join(process.cwd(), "data", "gutenberg", "gutenberg-normalized.db");
const WIKIPEDIA_DB = join(process.cwd(), "data", "mcp", "wikipedia.db");
const LIT_COMP_DB = join(process.cwd(), "data", "literary-compiler", "classics-compiled.db");
const LITERARY_DB = join(process.cwd(), "data", "literary-compiler", "literary.db");
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

interface ScriptProgress {
  phase?: string;
  pct?: number;
  message?: string;
}

function runScriptWithJob(
  command: string[],
  cwd: string = process.cwd(),
): { jobId: string; stream: string } {
  const job = createJob();
  updateJob(job, 5, "Starting...");

  (async () => {
    try {
      const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });

      // Stream stdout line by line for JSON progress
      const decoder = new TextDecoder();
      let buffer = "";
      const reader = proc.stdout.getReader();

      const readLoop = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as ScriptProgress;
              if (typeof msg.pct === "number" && msg.message) {
                updateJob(job, msg.pct, msg.message);
              }
            } catch {
              // non-JSON line — ignore
            }
          }
        }
      };

      await readLoop();
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        completeJob(job, { status: "ok" });
      } else {
        failJob(job, `Exit code: ${exitCode}`);
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
  if (!job) return c.json({ error: "Job not found" }, 200);

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          controller.enqueue(encoder.encode(data));
        };

        send(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
        job.listeners.add(send);

        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* stream closed */ }
        }, 5000);

        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(keepalive);
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
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found", exists: false }, 200);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const verseCount = parser.getVerseCount();
    const books = parser.getBooks();
    const charDB = new CharacterDB(parser);
    let charCount = 0;
    try { charCount = charDB.getAll().length; } catch (err) { log.debug({ err }, 'mcp bible char table query skipped, table may not exist'); }
    return c.json({ exists: true, verses: verseCount, books: books.length, characters: charCount, dbPath: BIBLE_DB });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/search", (c) => {
  const q = c.req.query("q") ?? "";
  const book = c.req.query("book");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 200);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const results = parser.search(q, { limit, book: book ?? undefined });
    return c.json({ results, query: q, book, limit });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/bible/books", (c) => {
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 200);
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
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 200);
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
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 200);
  const parser = new BibleParser({ dbPath: BIBLE_DB });
  try {
    const charDB = new CharacterDB(parser);
    const all = charDB.getAll();
    const character = all.find((ch) => ch.id === id || ch.canonical_name === id);
    if (!character) return c.json({ error: "Character not found" }, 200);
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
  if (!existsSync(BIBLE_DB)) return c.json({ error: "Bible DB not found" }, 200);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", BIBLE_DB, "--dst", BIBLE_DB + ".compact"]);
  return c.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  Gutenberg
// ═══════════════════════════════════════════════════════════════

mcpRouter.get("/gutenberg/stats", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found", exists: false }, 200);
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
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 200);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const results = parser.searchStyles(q, { limit, mood });
    return c.json({ results, query: q, limit });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/gutenberg/styles", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 200);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const styles = parser.getAllStyles();
    return c.json({ styles });
  } finally {
    parser.close();
  }
});

mcpRouter.post("/gutenberg/download", (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/download-gutenberg.ts"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/convert", (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/parquet-to-sqlite.ts"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/compact", (c) => {
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 200);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts"]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/delexify", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!existsSync(GUTENBERG_DB)) return c.json({ error: "Gutenberg DB not found" }, 200);
  const parser = new GutenbergParser({ dbPath: GUTENBERG_DB, extractStyles: true });
  try {
    const result = parser.delexify(text);
    return c.json({ original: text, delexified: result });
  } finally {
    parser.close();
  }
});

mcpRouter.get("/gutenberg/quality-report", (c) => {
  if (!existsSync(LITERARY_DB)) return c.json({ error: "Literary DB not found", exists: false }, 200);
  const db = new Database(LITERARY_DB, { readonly: true });
  try {
    const total = db.prepare('SELECT COUNT(*) as n FROM scene_templates').get() as { n: number };
    const avg = db.prepare('SELECT AVG(quality_score) as avg FROM scene_templates').get() as { avg: number };
    const dist = db.prepare(`SELECT SUM(CASE WHEN quality_score<0.3 THEN 1 ELSE 0 END) as low, SUM(CASE WHEN quality_score>=0.3 AND quality_score<=0.7 THEN 1 ELSE 0 END) as normal, SUM(CASE WHEN quality_score>0.7 THEN 1 ELSE 0 END) as high FROM scene_templates`).get() as { low:number;normal:number;high:number };
    const byBook = db.prepare('SELECT source_book, AVG(quality_score) as avg_score, COUNT(*) as template_count FROM scene_templates GROUP BY source_book ORDER BY avg_score DESC').all();
    const cal = db.prepare('SELECT * FROM quality_calibration').all();
    return c.json({ total_templates: total.n, avg_score: avg.avg, distribution: dist, by_book: byBook, calibration_summary: cal });
  } finally {
    db.close();
  }
});

mcpRouter.post("/gutenberg/process", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phase = (body as { phase?: string }).phase ?? "all";

  const importResult = runScriptWithJob(["bun", "run", "scripts/import-gutenberg-texts.ts"]);

  let v1Result = null, v2Result = null;

  if (phase === "v1" || phase === "all") {
    v1Result = runScriptWithJob(["bun", "run", "scripts/process-gutenberg.ts", "--phase", "v1"]);
  }

  if (phase === "v2" || phase === "all") {
    v2Result = runScriptWithJob(["bun", "run", "scripts/process-gutenberg.ts", "--phase", "v2"]);
  }

  return c.json({
    importJob: importResult.jobId,
    v1Job: v1Result?.jobId ?? null,
    v2Job: v2Result?.jobId ?? null,
  });
});

// ═══════════════════════════════════════════════════════════════
//  Gutenberg Catalog (Selective Download)
// ═══════════════════════════════════════════════════════════════

import { GutenbergCatalog } from '@/mcp/gutenberg/catalog';

const GUTENBERG_CATALOG_DB = join(process.cwd(), 'data', 'mcp', 'gutenberg-catalog.db');

mcpRouter.post("/gutenberg/catalog/build", async (c) => {
  const { authors, topic, limit } = await c.req.json<{ authors?: string[]; topic?: string; limit?: number }>();
  const args = ['bun', 'run', 'scripts/build-gutenberg-catalog.ts'];
  if (authors && authors.length > 0) {
    args.push('--authors', authors.join(','));
  }
  if (topic) {
    args.push('--topic', topic);
  }
  if (limit) {
    args.push('--limit', String(limit));
  }
  const result = runScriptWithJob(args);
  return c.json(result);
});

mcpRouter.get("/gutenberg/catalog/stats", (c) => {
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    const stats = catalog.getStats();
    return c.json(stats);
  } finally {
    catalog.close();
  }
});

mcpRouter.get("/gutenberg/catalog", (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const sort = c.req.query('sort') || 'download_count';
  const order = c.req.query('order') || 'desc';
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    const result = catalog.getPage(page, limit, sort, order);
    return c.json(result);
  } finally {
    catalog.close();
  }
});

mcpRouter.get("/gutenberg/catalog/search", (c) => {
  const q = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    const results = catalog.search(q, limit);
    return c.json({ results, query: q, limit });
  } finally {
    catalog.close();
  }
});

mcpRouter.get("/gutenberg/catalog/filter", (c) => {
  const opts = {
    author: c.req.query('author') || undefined,
    year_from: c.req.query('year_from') ? parseInt(c.req.query('year_from')!, 10) : undefined,
    year_to: c.req.query('year_to') ? parseInt(c.req.query('year_to')!, 10) : undefined,
    min_downloads: c.req.query('min_downloads') ? parseInt(c.req.query('min_downloads')!, 10) : undefined,
    subject: c.req.query('subject') || undefined,
  };
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    const results = catalog.filter(opts);
    return c.json({ results, filter: opts });
  } finally {
    catalog.close();
  }
});

mcpRouter.post("/gutenberg/download-selected", async (c) => {
  const { etextnos } = await c.req.json<{ etextnos: number[] }>();
  if (!etextnos || etextnos.length === 0) {
    return c.json({ error: 'No etextnos provided' }, 400);
  }
  const result = runScriptWithJob(['bun', 'run', 'scripts/download-gutenberg-selected.ts', '--etextnos', etextnos.join(',')]);
  return c.json(result);
});

mcpRouter.post("/gutenberg/catalog/select-all", async (c) => {
  const { filter } = await c.req.json<{ filter?: { author?: string; year_from?: number; year_to?: number } }>();
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    const count = catalog.selectAll(filter);
    return c.json({ selected: count });
  } finally {
    catalog.close();
  }
});

mcpRouter.post("/gutenberg/catalog/deselect-all", (c) => {
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    catalog.deselectAll();
    return c.json({ ok: true });
  } finally {
    catalog.close();
  }
});

mcpRouter.post("/gutenberg/catalog/select", async (c) => {
  const { etextnos, selected } = await c.req.json<{ etextnos: number[]; selected: boolean }>();
  if (!etextnos || etextnos.length === 0) {
    return c.json({ error: 'No etextnos provided' }, 400);
  }
  const catalog = new GutenbergCatalog(GUTENBERG_CATALOG_DB);
  try {
    if (selected) {
      catalog.select(etextnos);
    } else {
      catalog.deselect(etextnos);
    }
    return c.json({ ok: true, changed: etextnos.length });
  } finally {
    catalog.close();
  }
});

// ═══════════════════════════════════════════════════════════════
//  Wikipedia
// ═══════════════════════════════════════════════════════════════

const wikipediaTools = new WikipediaMCPTools();

mcpRouter.get("/wikipedia/stats", (c) => {
  if (!existsSync(WIKIPEDIA_DB)) return c.json({ error: "Wikipedia DB not found", exists: false }, 200);
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
  return c.json({ message: "Wikipedia download requires the wikiextractor tool. Run: pip install wikiextractor && scripts/download-sources.sh", status: "pending" });
});

mcpRouter.post("/wikipedia/convert", (c) => {
  return c.json({ message: "Wikipedia conversion requires scripts/convert-wikipedia.ts (not yet implemented). Run scripts/download-sources.sh first.", status: "pending" });
});

mcpRouter.post("/wikipedia/compact", (c) => {
  if (!existsSync(WIKIPEDIA_DB)) return c.json({ error: "Wikipedia DB not found" }, 200);
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
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found", exists: false }, 200);
  const stat = statSync(LIT_COMP_DB);
  let templates = 0;
  try {
    const db = new Database(LIT_COMP_DB, { readonly: true });
    const row = db.query("SELECT COUNT(*) as n FROM scene_templates").get() as { n: number } | null;
    templates = row?.n ?? 0;
    db.close();
  } catch (err) { log.debug({ err }, 'mcp literary stats table query skipped, table may not exist'); }
  return c.json({ exists: true, templates, size: stat.size, dbPath: LIT_COMP_DB });
});

mcpRouter.get("/literary/templates", (c) => {
  const q = c.req.query("q") ?? "";
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found" }, 200);
  let templates: unknown[] = [];
  try {
    const db = new Database(LIT_COMP_DB, { readonly: true });
    templates = db.query("SELECT * FROM scene_templates WHERE name LIKE ? OR description LIKE ? LIMIT 50")
      .all(`%${q}%`, `%${q}%`) as unknown[];
    db.close();
  } catch (err) { log.debug({ err }, 'mcp literary templates query skipped, table may not exist'); }
  return c.json({ templates, query: q });
});

mcpRouter.post("/literary/compile", (c) => {
  const result = runScriptWithJob(["bun", "run", "scripts/compile-classics.ts"]);
  return c.json(result);
});

mcpRouter.post("/literary/compact", (c) => {
  if (!existsSync(LIT_COMP_DB)) return c.json({ error: "LiteraryCompiler DB not found" }, 200);
  const result = runScriptWithJob(["bun", "run", "scripts/compact-db.ts", "--src", LIT_COMP_DB, "--dst", LIT_COMP_DB + ".compact"]);
  return c.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  Economics
// ═══════════════════════════════════════════════════════════════

let _economicService: EconomicService | null = null;

function getEconomicService(): EconomicService {
  if (!_economicService) {
    const db = new EconomicDB(ECON_DB);
    _economicService = new EconomicService(db);
  }
  return _economicService;
}

function getWorldId(c: { req: { query: (key: string) => string | undefined } }): string {
  return c.req.query("worldId") ?? "default";
}

mcpRouter.get("/economics/stats", (c) => {
  if (!existsSync(ECON_DB)) return c.json({ error: "Economics DB not found", exists: false }, 200);
  const stat = statSync(ECON_DB);
  return c.json({ exists: true, size: stat.size, dbPath: ECON_DB });
});

mcpRouter.get("/economics/phase", (c) => {
  if (!existsSync(ECON_DB)) return c.json({ error: "Economics DB not found", exists: false }, 200);
  const worldId = getWorldId(c);
  const service = getEconomicService();
  const cycle = service.getCurrentPhase(worldId);
  if (!cycle) {
    return c.json({ phase: null, reserve: 0, price_modifier: 1.0, message: "No active economic cycle" });
  }
  return c.json({
    phase: cycle.phase,
    reserve: cycle.reserve,
    price_modifier: cycle.price_modifier,
    ends_at: cycle.ends_at,
  });
});

mcpRouter.get("/economics/jubilee", (c) => {
  if (!existsSync(ECON_DB)) return c.json({ error: "Economics DB not found", exists: false }, 200);
  const worldId = getWorldId(c);
  const currentYear = parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);
  const service = getEconomicService();
  const info = service.getNextJubileeInfo(worldId, currentYear);
  return c.json({
    years_until: info.years_until,
    next_year: info.next_year,
    last_year: info.last_year,
    should_trigger: service.checkJubilee(worldId, currentYear),
  });
});

mcpRouter.get("/economics/dilemma", (c) => {
  return c.json({
    generated: false,
    message: "Dilemmas are generated by the game engine. Use in-game chat commands to interact with the economy.",
  });
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
  return c.json({ message: "Index rebuild requires SQLiteStore (FTS5 + vector). Run bun run scripts/compact-db.ts for DB compaction instead.", status: "pending" });
});

mcpRouter.post("/clean-orphans", (c) => {
  return c.json({ message: "Orphan cleanup requires access to embeddings DB and entity store. Run bun run scripts/compact-db.ts to reclaim space.", status: "pending" });
});
