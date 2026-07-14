import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { FactionLaborRules } from '../../src/mcp/literary-compiler/faction-labor-rules';
import { EconomicDB } from '../../src/mcp/literary-compiler/economic-schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('FactionLaborRules', () => {
  let db: EconomicDB;
  let rules: FactionLaborRules;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'labor-test-'));
    db = new EconomicDB(join(tempDir, 'economic.db'));
    rules = new FactionLaborRules(db);
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should set and get labor rules', () => {
    rules.setRule('Farmers', true, 100, 0.1);

    const rule = rules.getRule('Farmers');
    expect(rule).toBeDefined();
    expect(rule!.fixed_wages).toBe(true);
    expect(rule!.wage_amount).toBe(100);
    expect(rule!.loyalty_modifier).toBe(0.1);
  });

  it('should get all rules', () => {
    rules.setRule('Merchants', false, 150, -0.1);

    const allRules = rules.getAllRules();
    expect(allRules.length).toBeGreaterThanOrEqual(2);
  });

  it('should delete rules', () => {
    rules.deleteRule('Merchants');
    const rule = rules.getRule('Merchants');
    expect(rule).toBeNull();
  });

  it('should calculate fixed wage', () => {
    rules.setRule('Guild', true, 200, 0);

    const result = rules.calculateWage('Guild', 50, 8, 1.0);

    expect(result.wage).toBe(200);
    expect(result.is_fixed).toBe(true);
  });

  it('should calculate proportional wage', () => {
    rules.setRule('Crafters', false, 25, 0);

    const result = rules.calculateWage('Crafters', 50, 8, 1.0);

    expect(result.wage).toBe(200); // 25 * 8 * 1.0
    expect(result.is_fixed).toBe(false);
  });

  it('should use default rules when no rule exists', () => {
    const result = rules.calculateWage('Unknown', 50, 8, 1.0);

    expect(result.wage).toBe(400); // 50 * 8 * 1.0
    expect(result.is_fixed).toBe(false);
  });

  it('should detect loyalty conflicts', () => {
    rules.setRule('TestFaction', true, 100, 0);

    const workers = [
      { name: 'Worker1', faction: 'TestFaction', hours_worked: 8 },
      { name: 'Worker2', faction: 'TestFaction', hours_worked: 16 },
      { name: 'Worker3', faction: 'TestFaction', hours_worked: 4 },
    ];

    const conflicts = rules.checkLoyaltyConflict(workers);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some(c => c.worker === 'Worker2')).toBe(true);
  });
});
