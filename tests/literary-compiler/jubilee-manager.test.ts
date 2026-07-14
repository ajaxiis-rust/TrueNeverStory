import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { JubileeManager } from '../../src/mcp/literary-compiler/jubilee-manager';
import { EconomicDB } from '../../src/mcp/literary-compiler/economic-schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('JubileeManager', () => {
  let db: EconomicDB;
  let manager: JubileeManager;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jubilee-test-'));
    db = new EconomicDB(join(tempDir, 'economic.db'));
    manager = new JubileeManager(db, {
      cycle_years: 50,
      reset_debts: true,
      return_land: true,
      loyalty_boost: 0.3,
      loyalty_duration_days: 10,
    });
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should trigger jubilee after 50 years', () => {
    expect(manager.shouldTriggerJubilee('world1', 50)).toBe(true);
    expect(manager.shouldTriggerJubilee('world1', 49)).toBe(false);
  });

  it('should not trigger jubilee before cycle', () => {
    expect(manager.shouldTriggerJubilee('world2', 10)).toBe(false);
  });

  it('should trigger jubilee every 50 years', () => {
    // First jubilee at year 50
    expect(manager.shouldTriggerJubilee('world3', 50)).toBe(true);

    // After triggering, next at year 100
    const worldState = {
      debts: new Map([['npc1', 100], ['npc2', 200]]),
      lands: new Map([['farm1', 'npc1']]),
      npcs: ['npc1', 'npc2'],
    };
    manager.triggerJubilee('world3', 50, worldState);

    expect(manager.shouldTriggerJubilee('world3', 99)).toBe(false);
    expect(manager.shouldTriggerJubilee('world3', 100)).toBe(true);
  });

  it('should reset debts and lands', () => {
    const worldState = {
      debts: new Map([['npc1', 100], ['npc2', 200], ['npc3', 50]]),
      lands: new Map([['farm1', 'npc1'], ['farm2', 'npc2']]),
      npcs: ['npc1', 'npc2', 'npc3'],
    };

    const result = manager.triggerJubilee('world4', 50, worldState);

    expect(result.event.debts_reset).toBe(3);
    expect(result.event.lands_returned).toBe(2);
    expect(result.event.loyalty_boost).toBe(0.3);
    expect(worldState.debts.size).toBe(0);
    expect(worldState.lands.size).toBe(0);
  });

  it('should generate jubilee message', () => {
    const worldState = {
      debts: new Map([['npc1', 100]]),
      lands: new Map([['farm1', 'npc1']]),
      npcs: ['npc1'],
    };

    const result = manager.triggerJubilee('world5', 50, worldState);

    expect(result.message).toContain('Jubilee year has arrived');
    expect(result.message).toContain('1 debts have been forgiven');
    expect(result.message).toContain('1 lands have been returned');
  });

  it('should get next jubilee info', () => {
    const info = manager.getNextJubileeInfo('world6', 30);

    expect(info.years_until).toBe(20);
    expect(info.next_year).toBe(50);
    expect(info.last_year).toBeNull();
  });

  it('should get next jubilee info after first jubilee', () => {
    const worldState = {
      debts: new Map(),
      lands: new Map(),
      npcs: [],
    };
    manager.triggerJubilee('world7', 50, worldState);

    const info = manager.getNextJubileeInfo('world7', 75);

    expect(info.years_until).toBe(25);
    expect(info.next_year).toBe(100);
    expect(info.last_year).toBe(50);
  });
});
