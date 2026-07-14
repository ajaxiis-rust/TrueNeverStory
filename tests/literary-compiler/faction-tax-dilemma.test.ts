import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { FactionTaxDilemma } from '../../src/mcp/literary-compiler/faction-tax-dilemma';
import { EconomicDB } from '../../src/mcp/literary-compiler/economic-schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('FactionTaxDilemma', () => {
  let db: EconomicDB;
  let dilemma: FactionTaxDilemma;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dilemma-test-'));
    db = new EconomicDB(join(tempDir, 'economic.db'));
    dilemma = new FactionTaxDilemma(db, {
      min_tax: 100,
      max_tax: 500,
      generation_chance: 1.0, // Always generate for tests
      cooldown_days: 0, // No cooldown for tests
    });
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate a dilemma', () => {
    const result = dilemma.generate('world1', 'Nobles', 'Peasants');

    expect(result).not.toBeNull();
    expect(result!.dilemma.faction_a).toBe('Nobles');
    expect(result!.dilemma.faction_b).toBe('Peasants');
    expect(result!.dilemma.tax_amount).toBeGreaterThanOrEqual(100);
    expect(result!.dilemma.tax_amount).toBeLessThanOrEqual(500);
  });

  it('should generate message with faction names', () => {
    const result = dilemma.generate('world2', 'Farmers', 'Merchants');

    expect(result!.message).toContain('Farmers');
    expect(result!.message).toContain('Merchants');
  });

  it('should generate three choices', () => {
    const result = dilemma.generate('world3', 'Guild', 'Church');

    expect(result!.choices.length).toBe(3);
    expect(result!.choices.map(c => c.id)).toContain('pay_a');
    expect(result!.choices.map(c => c.id)).toContain('pay_b');
    expect(result!.choices.map(c => c.id)).toContain('refuse');
  });

  it('should resolve a dilemma', () => {
    const result = dilemma.generate('world4', 'Army', 'Navy');

    dilemma.resolve(result!.dilemma.id, 'pay_a');

    const resolved = db.getDilemma(result!.dilemma.id);
    expect(resolved!.player_choice).toBe('pay_a');
    expect(resolved!.resolved_at).toBeGreaterThan(0);
  });

  it('should have consequences for each choice', () => {
    const result = dilemma.generate('world5', 'Mages', 'Priests');

    for (const choice of result!.choices) {
      expect(choice.consequences).toBeDefined();
      expect(typeof choice.consequences.loyalty_a).toBe('number');
      expect(typeof choice.consequences.loyalty_b).toBe('number');
    }
  });
});
