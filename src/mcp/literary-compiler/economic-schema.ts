import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getLogger } from '@/utils/logger';

const logger = getLogger('EconomicDB');

/**
 * Юбилейное событие
 */
export interface JubileeEvent {
  id: string;
  world_id: string;
  year: number;
  debts_reset: number;
  lands_returned: number;
  loyalty_boost: number;
  created_at: number;
}

/**
 * Правила труда фракции
 */
export interface FactionLaborRule {
  faction: string;
  fixed_wages: boolean;
  wage_amount: number;
  loyalty_modifier: number;
  created_at: number;
}

/**
 * Экономический цикл (модель Иосифа)
 */
export interface EconomicCycle {
  id: string;
  world_id: string;
  phase: 'abundance' | 'transition' | 'famine';
  reserve: number;
  price_modifier: number;
  started_at: number;
  ends_at: number;
}

/**
 * Дилемма фракций
 */
export interface FactionDilemma {
  id: string;
  world_id: string;
  faction_a: string;
  faction_b: string;
  tax_amount: number;
  player_choice: 'pay_a' | 'pay_b' | 'refuse' | null;
  resolved_at: number | null;
  created_at: number;
}

export class EconomicDB {
  private db: Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      -- Юбилейные события (Debt Reset)
      CREATE TABLE IF NOT EXISTS jubilee_events (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        debts_reset INTEGER DEFAULT 0,
        lands_returned INTEGER DEFAULT 0,
        loyalty_boost REAL DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );

      -- Правила труда per-faction
      CREATE TABLE IF NOT EXISTS faction_labor_rules (
        faction TEXT PRIMARY KEY,
        fixed_wages INTEGER DEFAULT 0,
        wage_amount REAL DEFAULT 0,
        loyalty_modifier REAL DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );

      -- Экономические циклы (модель Иосифа)
      CREATE TABLE IF NOT EXISTS economic_cycles (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'abundance',
        reserve REAL DEFAULT 0,
        price_modifier REAL DEFAULT 1.0,
        started_at INTEGER DEFAULT (unixepoch()),
        ends_at INTEGER
      );

      -- Дилеммы фракций (история)
      CREATE TABLE IF NOT EXISTS faction_dilemmas (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        faction_a TEXT NOT NULL,
        faction_b TEXT NOT NULL,
        tax_amount REAL DEFAULT 0,
        player_choice TEXT,
        resolved_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);
  }

  // ─── Jubilee Events ──────────────────────────────────────────────────────

  insertJubileeEvent(event: Omit<JubileeEvent, 'created_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO jubilee_events (id, world_id, year, debts_reset, lands_returned, loyalty_boost)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.id, event.world_id, event.year, event.debts_reset, event.lands_returned, event.loyalty_boost);
  }

  getJubileeEvents(worldId: string): JubileeEvent[] {
    return this.db.prepare('SELECT * FROM jubilee_events WHERE world_id = ? ORDER BY year DESC')
      .all(worldId) as JubileeEvent[];
  }

  getLastJubileeYear(worldId: string): number | null {
    const result = this.db.prepare('SELECT MAX(year) as year FROM jubilee_events WHERE world_id = ?')
      .get(worldId) as { year: number | null };
    return result?.year ?? null;
  }

  // ─── Faction Labor Rules ─────────────────────────────────────────────────

  insertLaborRule(rule: Omit<FactionLaborRule, 'created_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO faction_labor_rules (faction, fixed_wages, wage_amount, loyalty_modifier)
      VALUES (?, ?, ?, ?)
    `).run(rule.faction, rule.fixed_wages ? 1 : 0, rule.wage_amount, rule.loyalty_modifier);
  }

  getLaborRule(faction: string): FactionLaborRule | null {
    const row = this.db.prepare('SELECT * FROM faction_labor_rules WHERE faction = ?')
      .get(faction) as any;
    return row ? { ...row, fixed_wages: row.fixed_wages === 1 } : null;
  }

  getAllLaborRules(): FactionLaborRule[] {
    return this.db.prepare('SELECT * FROM faction_labor_rules')
      .all().map((row: any) => ({ ...row, fixed_wages: row.fixed_wages === 1 })) as FactionLaborRule[];
  }

  deleteLaborRule(faction: string): void {
    this.db.prepare('DELETE FROM faction_labor_rules WHERE faction = ?').run(faction);
  }

  // ─── Economic Cycles ─────────────────────────────────────────────────────

  insertCycle(cycle: Omit<EconomicCycle, 'created_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO economic_cycles (id, world_id, phase, reserve, price_modifier, started_at, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cycle.id, cycle.world_id, cycle.phase, cycle.reserve, cycle.price_modifier, cycle.started_at, cycle.ends_at);
  }

  getActiveCycle(worldId: string): EconomicCycle | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db.prepare(
      'SELECT * FROM economic_cycles WHERE world_id = ? AND ends_at > ? ORDER BY started_at DESC LIMIT 1',
    ).get(worldId, now) as EconomicCycle | undefined;
    return row ?? null;
  }

  getCycles(worldId: string): EconomicCycle[] {
    return this.db.prepare('SELECT * FROM economic_cycles WHERE world_id = ? ORDER BY started_at DESC')
      .all(worldId) as EconomicCycle[];
  }

  updateCyclePhase(cycleId: string, phase: EconomicCycle['phase'], priceModifier: number): void {
    this.db.prepare('UPDATE economic_cycles SET phase = ?, price_modifier = ? WHERE id = ?')
      .run(phase, priceModifier, cycleId);
  }

  // ─── Faction Dilemmas ────────────────────────────────────────────────────

  insertDilemma(dilemma: Omit<FactionDilemma, 'created_at'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO faction_dilemmas (id, world_id, faction_a, faction_b, tax_amount, player_choice, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(dilemma.id, dilemma.world_id, dilemma.faction_a, dilemma.faction_b, dilemma.tax_amount, dilemma.player_choice, dilemma.resolved_at);
  }

  getDilemma(id: string): FactionDilemma | null {
    return this.db.prepare('SELECT * FROM faction_dilemmas WHERE id = ?').get(id) as FactionDilemma | null;
  }

  getUnresolvedDilemmas(worldId: string): FactionDilemma[] {
    return this.db.prepare('SELECT * FROM faction_dilemmas WHERE world_id = ? AND player_choice IS NULL')
      .all(worldId) as FactionDilemma[];
  }

  resolveDilemma(id: string, choice: 'pay_a' | 'pay_b' | 'refuse'): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare('UPDATE faction_dilemmas SET player_choice = ?, resolved_at = ? WHERE id = ?')
      .run(choice, now, id);
  }

  getDilemmaHistory(worldId: string): FactionDilemma[] {
    return this.db.prepare('SELECT * FROM faction_dilemmas WHERE world_id = ? ORDER BY created_at DESC')
      .all(worldId) as FactionDilemma[];
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
