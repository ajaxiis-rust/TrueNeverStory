import { describe, test, expect } from 'bun:test';
import { RuntimeMetrics, type TurnMetrics } from './runtime-metrics';

describe('RuntimeMetrics', () => {
  test('records turn metrics', () => {
    const metrics = new RuntimeMetrics(':memory:');
    metrics.recordTurn({
      turnId: 't1',
      retrievalMs: 5,
      fillMs: 1,
      stylistMs: 1200,
      totalMs: 1250,
      templateUsedId: 'tpl-1',
      archetype: 'escape_liberation',
    });
    const recent = metrics.getRecent(1);
    expect(recent.length).toBe(1);
    expect(recent[0]!.archetype).toBe('escape_liberation');
  });

  test('computes averages', () => {
    const metrics = new RuntimeMetrics(':memory:');
    metrics.recordTurn({ turnId: 't1', stylistMs: 1000, totalMs: 1050 });
    metrics.recordTurn({ turnId: 't2', stylistMs: 1500, totalMs: 1550 });
    const avg = metrics.getAverages();
    expect(avg.avgStylistMs).toBe(1250);
    expect(avg.avgTotalMs).toBe(1300);
  });

  test('getRecent returns limited results', () => {
    const metrics = new RuntimeMetrics(':memory:');
    for (let i = 0; i < 5; i++) {
      metrics.recordTurn({ turnId: `t${i}`, stylistMs: 100 * i, totalMs: 110 * i });
    }
    const recent = metrics.getRecent(3);
    expect(recent.length).toBe(3);
  });

  test('handles optional fields', () => {
    const metrics = new RuntimeMetrics(':memory:');
    metrics.recordTurn({ turnId: 't1' });
    const recent = metrics.getRecent(1);
    expect(recent.length).toBe(1);
    expect(recent[0]!.retrievalMs == null).toBe(true);
  });
});
