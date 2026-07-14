import { describe, it, expect } from 'bun:test';
import { EmotionalPass } from '../../src/mcp/literary-compiler/emotional-pass';

describe('EmotionalPass', () => {
  const pass = new EmotionalPass();

  it('should extract emotions from text', () => {
    const result = pass.analyze({
      text: 'She was afraid of the darkness. Fear gripped her heart as she heard the scream.',
      source_id: 'fear.1',
    });

    expect(result.arcs.length).toBe(1);
    expect(result.errors.length).toBe(0);

    const arc = result.arcs[0]!;
    expect(arc.emotions).toContain('fear');
    expect(arc.dominant_emotion).toBe('fear');
  });

  it('should calculate tension level', () => {
    const lowTension = pass.analyze({
      text: 'She smiled and laughed. The garden was peaceful and calm.',
      source_id: 'low',
    });

    const highTension = pass.analyze({
      text: 'The battle raged. Blood flowed. Screams filled the air as they fought to the death.',
      source_id: 'high',
    });

    expect(lowTension.arcs[0]!.tension_level).toBeLessThan(0.5);
    expect(highTension.arcs[0]!.tension_level).toBeGreaterThan(0.5);
  });

  it('should detect mood transitions', () => {
    const result = pass.analyze({
      text: 'She was happy and joyful. Then darkness fell and fear took hold. Finally, hope returned.',
      source_id: 'transitions',
    });

    expect(result.arcs.length).toBe(1);
    expect(result.arcs[0]!.mood_transitions.length).toBeGreaterThan(0);
  });

  it('should build tension curve', () => {
    const result = pass.analyze({
      text: 'Peace reigned. Then the enemy appeared. Battle erupted. Victory came at last.',
      source_id: 'curve',
    });

    expect(result.arcs.length).toBe(1);
    expect(result.arcs[0]!.tension_curve.length).toBeGreaterThan(0);
    // Кривая должна содержать значения от 0 до 1
    expect(result.arcs[0]!.tension_curve.every(v => v >= 0 && v <= 1)).toBe(true);
  });

  it('should handle empty text', () => {
    const result = pass.analyze({ text: '', source_id: 'empty' });

    expect(result.arcs.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});
