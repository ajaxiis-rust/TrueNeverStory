import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { EconomicDB } from '../../src/mcp/literary-compiler/economic-schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('EconomicDB', () => {
  let db: EconomicDB;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'economic-test-'));
    db = new EconomicDB(join(tempDir, 'economic.db'));
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Jubilee Events ──────────────────────────────────────────────────────

  it('should insert and retrieve jubilee events', () => {
    db.insertJubileeEvent({
      id: 'jubilee_1',
      world_id: 'world1',
      year: 50,
      debts_reset: 10,
      lands_returned: 5,
      loyalty_boost: 0.3,
    });

    const events = db.getJubileeEvents('world1');
    expect(events.length).toBe(1);
    expect(events[0]!.debts_reset).toBe(10);
  });

  it('should get last jubilee year', () => {
    db.insertJubileeEvent({
      id: 'jubilee_2',
      world_id: 'world1',
      year: 100,
      debts_reset: 15,
      lands_returned: 8,
      loyalty_boost: 0.4,
    });

    const lastYear = db.getLastJubileeYear('world1');
    expect(lastYear).toBe(100);
  });

  // ─── Faction Labor Rules ─────────────────────────────────────────────────

  it('should insert and retrieve labor rules', () => {
    db.insertLaborRule({
      faction: 'Farmers',
      fixed_wages: true,
      wage_amount: 100,
      loyalty_modifier: 0.1,
    });

    const rule = db.getLaborRule('Farmers');
    expect(rule).toBeDefined();
    expect(rule!.fixed_wages).toBe(true);
    expect(rule!.wage_amount).toBe(100);
  });

  it('should get all labor rules', () => {
    db.insertLaborRule({
      faction: 'Merchants',
      fixed_wages: false,
      wage_amount: 150,
      loyalty_modifier: -0.1,
    });

    const rules = db.getAllLaborRules();
    expect(rules.length).toBeGreaterThanOrEqual(2);
  });

  it('should delete labor rules', () => {
    db.deleteLaborRule('Merchants');
    const rule = db.getLaborRule('Merchants');
    expect(rule).toBeNull();
  });

  // ─── Economic Cycles ─────────────────────────────────────────────────────

  it('should insert and retrieve economic cycles', () => {
    const now = Math.floor(Date.now() / 1000);
    db.insertCycle({
      id: 'cycle_1',
      world_id: 'world1',
      phase: 'abundance',
      reserve: 1000,
      price_modifier: 1.0,
      started_at: now,
      ends_at: now + 30 * 24 * 60 * 60, // 30 days
    });

    const cycles = db.getCycles('world1');
    expect(cycles.length).toBe(1);
    expect(cycles[0]!.phase).toBe('abundance');
  });

  it('should get active cycle', () => {
    const cycle = db.getActiveCycle('world1');
    expect(cycle).toBeDefined();
    expect(cycle!.phase).toBe('abundance');
  });

  it('should update cycle phase', () => {
    db.updateCyclePhase('cycle_1', 'famine', 2.0);
    const cycle = db.getActiveCycle('world1');
    expect(cycle!.phase).toBe('famine');
    expect(cycle!.price_modifier).toBe(2.0);
  });

  // ─── Faction Dilemmas ────────────────────────────────────────────────────

  it('should insert and retrieve dilemmas', () => {
    db.insertDilemma({
      id: 'dilemma_1',
      world_id: 'world1',
      faction_a: 'Nobles',
      faction_b: 'Peasants',
      tax_amount: 500,
      player_choice: null,
      resolved_at: null,
    });

    const dilemma = db.getDilemma('dilemma_1');
    expect(dilemma).toBeDefined();
    expect(dilemma!.faction_a).toBe('Nobles');
    expect(dilemma!.player_choice).toBeNull();
  });

  it('should get unresolved dilemmas', () => {
    const unresolved = db.getUnresolvedDilemmas('world1');
    expect(unresolved.length).toBeGreaterThanOrEqual(1);
  });

  it('should resolve dilemmas', () => {
    db.resolveDilemma('dilemma_1', 'pay_a');
    const dilemma = db.getDilemma('dilemma_1');
    expect(dilemma!.player_choice).toBe('pay_a');
    expect(dilemma!.resolved_at).toBeGreaterThan(0);
  });

  it('should get dilemma history', () => {
    const history = db.getDilemmaHistory('world1');
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});
