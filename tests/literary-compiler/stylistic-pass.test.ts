import { describe, it, expect } from 'bun:test';
import { StylisticPass } from '../../src/mcp/literary-compiler/stylistic-pass';

describe('StylisticPass', () => {
  const pass = new StylisticPass();

  it('should analyze text and extract sensory markers', () => {
    const result = pass.analyze({
      text: 'She saw the bright light and heard the thunder. The cold wind touched her face.',
      source_id: 'test.1',
    });

    expect(result.patterns.length).toBe(1);
    expect(result.errors.length).toBe(0);

    const pattern = result.patterns[0]!;
    expect(pattern.sensory_markers).toContain('sight');
    expect(pattern.sensory_markers).toContain('sound');
    expect(pattern.sensory_markers).toContain('touch');
  });

  it('should infer pacing from sentence structure', () => {
    const fastText = 'He ran. She jumped. They fought. The enemy fell.';
    const slowText = 'The ancient castle stood upon the hill, its weathered stones telling tales of centuries past, while the winds of change blew softly through the valley below.';

    const fastResult = pass.analyze({ text: fastText, source_id: 'fast' });
    const slowResult = pass.analyze({ text: slowText, source_id: 'slow' });

    expect(fastResult.patterns[0]!.pacing).toBe('fast');
    expect(slowResult.patterns[0]!.pacing).toBe('slow');
  });

  it('should infer tone from keywords', () => {
    const darkText = 'Death and darkness filled the land. The cursed king suffered in grief.';
    const lightText = 'Hope and joy brought light. The happy people lived in peace.';

    const darkResult = pass.analyze({ text: darkText, source_id: 'dark' });
    const lightResult = pass.analyze({ text: lightText, source_id: 'light' });

    expect(darkResult.patterns[0]!.tone).toBe('dark');
    expect(lightResult.patterns[0]!.tone).toBe('light');
  });

  it('should calculate lexical richness', () => {
    const repetitiveText = 'The cat sat on the mat. The cat sat on the mat.';
    const diverseText = 'A feline rested upon the rug while a canine slumbered nearby.';

    const repetitiveResult = pass.analyze({ text: repetitiveText, source_id: 'repetitive' });
    const diverseResult = pass.analyze({ text: diverseText, source_id: 'diverse' });

    expect(repetitiveResult.patterns[0]!.lexical_richness).toBeLessThan(
      diverseResult.patterns[0]!.lexical_richness,
    );
  });

  it('should handle empty text', () => {
    const result = pass.analyze({ text: '', source_id: 'empty' });

    expect(result.patterns.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});
