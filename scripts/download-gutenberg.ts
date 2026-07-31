#!/usr/bin/env bun
/**
 * Download Gutenberg BookCorpus from HuggingFace → SQLite.
 *
 * Uses direct HTTP (bypasses xet/2FA) — public repos only.
 * Outputs JSON progress lines to stdout for SSE integration.
 *
 * Usage: bun scripts/download-gutenberg.ts [--dir path] [--db path] [--workers N]
 */

import { readParquet } from "parquet-wasm";
import { tableFromIPC, type Table } from "apache-arrow";
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PARQUET_DIR = flag("--dir", "data/mcp/gutenberg-bookcorpus");
const DB_PATH = flag("--db", "data/mcp/gutenberg-bookcorpus.db");
const MAX_WORKERS = parseInt(flag("--workers", "4"), 10);
const BATCH_SIZE = 5000;
const RETRY = 3;

const DATASET_ID = "incredible45/Gutenberg-BookCorpus-Cleaned-Data-English";

// ── Progress: JSON lines to stdout ────────────────────────────

interface ProgressMsg {
  phase: string;
  pct: number;
  message: string;
}

function emit(phase: string, pct: number, message: string) {
  const msg: ProgressMsg = { phase, pct: Math.round(pct), message };
  console.log(JSON.stringify(msg));
}

// ── Step 1: List parquet files from HF API ────────────────────

async function listParquetFiles(): Promise<string[]> {
  const url = `https://huggingface.co/api/datasets/${DATASET_ID}/tree/main/data`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HF API error: ${res.status} ${res.statusText}`);
  const files = (await res.json()) as Array<{ path: string }>;
  return files.filter((f) => f.path.endsWith(".parquet")).map((f) => f.path);
}

// ── Step 2: Download with concurrency ─────────────────────────

async function downloadOne(filename: string, dest: string): Promise<void> {
  const url = `https://huggingface.co/datasets/${DATASET_ID}/resolve/main/${filename}`;

  for (let attempt = 0; attempt < RETRY; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      await Bun.write(dest, buf);
      return;
    } catch (err) {
      if (attempt < RETRY - 1) {
        await Bun.sleep(1000 * 2 ** attempt);
      } else {
        throw err;
      }
    }
  }
}

async function downloadAll(files: string[]): Promise<number> {
  mkdirSync(PARQUET_DIR, { recursive: true });

  const tasks: Array<{ name: string; dest: string }> = [];
  let skipped = 0;

  for (const fname of files) {
    const dest = join(PARQUET_DIR, basename(fname));
    if (existsSync(dest) && statSync(dest).size > 10000) {
      skipped++;
      continue;
    }
    tasks.push({ name: fname, dest });
  }

  if (tasks.length === 0) {
    emit("download", 100, `All ${skipped} files already cached`);
    return skipped;
  }

  emit("download", 0, `${skipped} cached, ${tasks.length} to download (${MAX_WORKERS} workers)`);

  let done = 0;
  const total = tasks.length;

  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = downloadOne(task.name, task.dest).then(() => {
      executing.delete(p);
      done++;
      const mb = statSync(task.dest).size / 1048576;
      emit("download", (done / total) * 100, `${done}/${total} ${basename(task.name)} (${mb.toFixed(0)}MB)`);
    });
    executing.add(p);

    if (executing.size >= MAX_WORKERS) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  emit("download", 100, `${done} downloaded + ${skipped} cached = ${done + skipped} files`);
  return done + skipped;
}

// ── Step 3: Parquet → SQLite ──────────────────────────────────

function convertToSqlite(): void {
  const files = readdirSync(PARQUET_DIR)
    .filter((f) => f.endsWith(".parquet"))
    .sort()
    .map((f) => join(PARQUET_DIR, f));

  if (files.length === 0) {
    throw new Error(`No parquet files in ${PARQUET_DIR}`);
  }

  emit("convert", 0, `Converting ${files.length} parquets → ${basename(DB_PATH)}`);

  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = OFF");
  db.exec("PRAGMA synchronous = OFF");
  db.exec("PRAGMA cache_size = -64000");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("DROP TABLE IF EXISTS gutenberg");
  db.exec(`
    CREATE TABLE gutenberg (
      etextno INTEGER,
      book_title TEXT,
      author TEXT,
      issued TEXT,
      context TEXT
    )
  `);

  const insert = db.prepare(
    "INSERT INTO gutenberg (etextno, book_title, author, issued, context) VALUES (?, ?, ?, ?, ?)",
  );

  let totalRows = 0;
  const t0 = performance.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parquetBytes = readFileSync(file);
    const arrowTable = readParquet(parquetBytes);
    const ipc = arrowTable.intoIPCStream();
    const table: Table = tableFromIPC(ipc);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchInsert = db.transaction((rows: any[][]) => {
      for (const row of rows) {
        insert.run(...row);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let batch: any[][] = [];
    for (let r = 0; r < table.numRows; r++) {
      const row = table.get(r);
      batch.push([
        Number(row.etextno),
        String(row.book_title),
        String(row.author),
        String(row.issued),
        String(row.context),
      ]);
      if (batch.length >= BATCH_SIZE) {
        batchInsert(batch);
        totalRows += batch.length;
        batch = [];
        const pct = ((i + r / table.numRows) / files.length) * 100;
        emit("convert", pct, `File ${i + 1}/${files.length} | ${totalRows.toLocaleString()} rows`);
      }
    }
    if (batch.length > 0) {
      batchInsert(batch);
      totalRows += batch.length;
    }
  }

  emit("index", 95, "Creating index...");
  db.exec("CREATE INDEX idx_etextno ON gutenberg(etextno)");
  emit("compact", 98, "Compacting (VACUUM)...");
  db.exec("VACUUM");

  const elapsed = (performance.now() - t0) / 1000;
  const count = db.query("SELECT COUNT(*) as n FROM gutenberg").get() as { n: number };
  emit("done", 100, `${count.n.toLocaleString()} rows in ${elapsed.toFixed(1)}s → ${DB_PATH}`);
  db.close();
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  emit("init", 0, "Listing parquet files...");
  const files = await listParquetFiles();
  emit("init", 5, `Found ${files.length} parquet files`);

  await downloadAll(files);
  convertToSqlite();
}

main().catch((err) => {
  emit("error", 0, String(err));
  process.exit(1);
});
