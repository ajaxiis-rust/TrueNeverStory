import { Database } from 'bun:sqlite';

export interface TurnMetrics {
  turnId: string;
  retrievalMs?: number;
  fillMs?: number;
  stylistMs?: number;
  censorMs?: number;
  totalMs?: number;
  templateUsedId?: string;
  archetype?: string;
}

export class RuntimeMetrics {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id TEXT,
        retrieval_ms REAL,
        fill_ms REAL,
        stylist_ms REAL,
        censor_ms REAL,
        total_ms REAL,
        template_used_id TEXT,
        archetype TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  recordTurn(m: TurnMetrics): void {
    this.db.prepare(`
      INSERT INTO runtime_metrics
      (turn_id, retrieval_ms, fill_ms, stylist_ms, censor_ms, total_ms,
       template_used_id, archetype)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      m.turnId, m.retrievalMs ?? null, m.fillMs ?? null,
      m.stylistMs ?? null, m.censorMs ?? null, m.totalMs ?? null,
      m.templateUsedId ?? null, m.archetype ?? null,
    );
  }

  getRecent(limit = 10): TurnMetrics[] {
    return this.db.prepare(
      'SELECT * FROM runtime_metrics ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as TurnMetrics[];
  }

  getAverages(): { avgStylistMs: number; avgTotalMs: number; avgRetrievalMs: number } {
    const row = this.db.prepare(`
      SELECT
        AVG(stylist_ms) as avgStylistMs,
        AVG(total_ms) as avgTotalMs,
        AVG(retrieval_ms) as avgRetrievalMs
      FROM runtime_metrics
    `).get() as Record<string, number>;
    return {
      avgStylistMs: row.avgStylistMs ?? 0,
      avgTotalMs: row.avgTotalMs ?? 0,
      avgRetrievalMs: row.avgRetrievalMs ?? 0,
    };
  }
}
