#!/usr/bin/env bun
/**
 * Copy rows from large un-compacted DB to a fresh compact DB.
 * Usage: bun scripts/compact-db.ts [--src path] [--dst path]
 */

import { Database } from "bun:sqlite";

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const SRC = flag("--src", "/tmp/test-gutenberg.db");
const DST = flag("--dst", "data/mcp/gutenberg-bookcorpus.db");
const BATCH = 5000;

console.log(`Compacting: ${SRC} → ${DST}`);

const src = new Database(SRC, { readonly: true });
const total = src.query("SELECT COUNT(*) as n FROM gutenberg").get() as any;
console.log(`Source: ${total.n.toLocaleString()} rows`);

// Create fresh DB with fast-write PRAGMAs
const dst = new Database(DST);
dst.exec("PRAGMA journal_mode = OFF");
dst.exec("PRAGMA synchronous = OFF");
dst.exec("PRAGMA cache_size = -64000");
dst.exec("PRAGMA temp_store = MEMORY");
dst.exec("DROP TABLE IF EXISTS gutenberg");
dst.exec(`
  CREATE TABLE gutenberg (
    etextno INTEGER,
    book_title TEXT,
    author TEXT,
    issued TEXT,
    context TEXT
  )
`);

const insert = dst.prepare(
  "INSERT INTO gutenberg (etextno, book_title, author, issued, context) VALUES (?, ?, ?, ?, ?)"
);
const readBatch = src.prepare(
  "SELECT etextno, book_title, author, issued, context FROM gutenberg LIMIT ? OFFSET ?"
);

const t0 = performance.now();
let copied = 0;
let lastLineLen = 0;

while (copied < total.n) {
  const rows = readBatch.all(BATCH, copied) as any[];
  if (rows.length === 0) break;

  const batchInsert = dst.transaction((rows: any[]) => {
    for (const r of rows) {
      insert.run(r.etextno, r.book_title, r.author, r.issued, r.context);
    }
  });
  batchInsert(rows);
  copied += rows.length;

  // Progress
  const pct = (copied / total.n) * 100;
  const elapsed = (performance.now() - t0) / 1000;
  const speed = copied / elapsed;
  const eta = (total.n - copied) / speed;
  const bar = "█".repeat(Math.round(pct / 2.5)) + "░".repeat(40 - Math.round(pct / 2.5));
  const etaStr = eta > 60 ? `${Math.floor(eta/60)}m${Math.round(eta%60)}s` : `${Math.round(eta)}s`;
  const line = `[${bar}] ${pct.toFixed(1)}% | ${copied.toLocaleString()}/${total.n.toLocaleString()} | ${Math.round(speed).toLocaleString()} rows/s | ETA ${etaStr}`;
  const pad = Math.max(0, lastLineLen - line.length);
  process.stdout.write("\r" + line + " ".repeat(pad));
  lastLineLen = line.length;
}

// Create index
console.log("\nCreating index...");
dst.exec("CREATE INDEX idx_etextno ON gutenberg(etextno)");

// VACUUM (now small enough)
console.log("VACUUM...");
dst.exec("VACUUM");

const elapsed = (performance.now() - t0) / 1000;
process.stdout.write("\r" + " ".repeat(lastLineLen + 2) + "\r");

const finalSize = require("fs").statSync(DST).size;
console.log(`Done: ${total.n.toLocaleString()} rows in ${elapsed.toFixed(1)}s`);
console.log(`Output: ${DST} (${(finalSize / 1e9).toFixed(2)} GB)`);

// Verify
const verifyCount = dst.query("SELECT COUNT(*) as n FROM gutenberg").get() as any;
console.log(`Verified: ${verifyCount.n.toLocaleString()} rows`);

src.close();
dst.close();
