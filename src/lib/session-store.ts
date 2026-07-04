/**
 * SQLite-backed session store.
 * Replaces in-memory Map so sessions survive server restarts.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every hour

let db: Database | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function getDb(): Database {
  if (db) return db;
  const dbPath = join(process.cwd(), "worlds", "_sessions");
  mkdirSync(dbPath, { recursive: true });
  db = new Database(join(dbPath, "sessions.db"));
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `);
  return db;
}

export function createSession(): string {
  const d = getDb();
  const token = randomBytes(32).toString("hex");
  d.run("INSERT INTO sessions (token, created_at) VALUES (?, ?)", [token, Date.now()]);
  return token;
}

export function isSessionValid(token: string): boolean {
  const d = getDb();
  const row = d.query("SELECT created_at FROM sessions WHERE token = ?").get(token) as { created_at: number } | undefined;
  if (!row) return false;
  if (Date.now() - row.created_at > SESSION_TTL_MS) {
    d.run("DELETE FROM sessions WHERE token = ?", [token]);
    return false;
  }
  return true;
}

export function deleteSession(token: string): void {
  const d = getDb();
  d.run("DELETE FROM sessions WHERE token = ?", [token]);
}

export function cleanupSessions(): number {
  const d = getDb();
  const cutoff = Date.now() - SESSION_TTL_MS;
  const result = d.run("DELETE FROM sessions WHERE created_at < ?", [cutoff]);
  return result.changes;
}

export function startSessionCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const removed = cleanupSessions();
    if (removed > 0) console.log(`[session-store] Cleaned up ${removed} expired sessions`);
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}
