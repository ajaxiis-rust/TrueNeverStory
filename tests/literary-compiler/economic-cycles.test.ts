import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { EconomicCycles } from '../../src/mcp/literary-compiler/economic-cycles';
import { EconomicDB } from '../../src/mcp/literary-compiler/economic-schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('EconomicCycles', () => {
  let db: EconomicDB;
  let cycles: EconomicCycles;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cycles-test-'));
    db = new EconomicDB(join(tempDir, 'economic.db'));
    cycles = new EconomicCycles(db, {
      abundance_duration_days: 30,
      transition_duration_days: 10,
      famine_duration_days: 20,
      event_triggers: ['drought', 'plague'],
      price_modifiers: {
        abundance: 0.8,
        transition: 1.0,
        famine: 2.0,
      },
    });
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should start a new cycle', () => {
    const cycle = cycles.startCycle('world1', 1000);

    expect(cycle.phase).toBe('abundance');
    expect(cycle.reserve).toBe(1000);
    expect(cycle.price_modifier).toBe(0.8);
  });

  it('should get current phase', () => {
    const phase = cycles.getCurrentPhase('world1');

    expect(phase).toBeDefined();
    expect(phase!.phase).toBe('abundance');
  });

  it('should get price modifier', () => {
    const modifier = cycles.getPriceModifier('world1');

    expect(modifier).toBe(0.8);
  });

  it('should calculate price with modifier', () => {
    const price = cycles.calculatePrice('world1', 100);

    expect(price).toBe(80); // 100 * 0.8
  });

  it('should add to reserve', () => {
    cycles.addToReserve('world1', 500);

    const phase = cycles.getCurrentPhase('world1');
    expect(phase!.reserve).toBe(1500);
  });

  it('should withdraw from reserve', () => {
    const success = cycles.withdrawFromReserve('world1', 300);

    expect(success).toBe(true);
    const phase = cycles.getCurrentPhase('world1');
    expect(phase!.reserve).toBe(1200);
  });

  it('should fail to withdraw insufficient funds', () => {
    const success = cycles.withdrawFromReserve('world1', 5000);

    expect(success).toBe(false);
  });

  it('should return default price modifier when no cycle', () => {
    const modifier = cycles.getPriceModifier('nonexistent');

    expect(modifier).toBe(1.0);
  });
});
