import { describe, it, expect } from 'bun:test';
import { MetadataPass } from '../../src/mcp/literary-compiler/metadata-pass';
import type { QuestTemplate } from '../../src/mcp/literary-compiler/types';

describe('MetadataPass', () => {
  const pass = new MetadataPass();

  const baseTemplate: QuestTemplate = {
    id: 'Exodus.14',
    source_book: 'Exodus',
    source_chapter: 14,
    archetype: 'escape',
    applicable_positions: [],
    variables: ['current_leader', 'followers', 'current_tyrant', 'obstacle', 'intervention'],
    template_text: '[current_leader] leads [followers] through the sea, escaping from [current_tyrant].',
    mood: 'epic',
    difficulty: '',
    moral_ambiguity: 0,
    tags: [],
    created_at: Date.now(),
  };

  it('should extract tags from text', () => {
    const result = pass.enrich({ template: baseTemplate });

    expect(result.metadata.tags).toContain('water'); // "sea" in text
  });

  it('should set default positions based on archetype', () => {
    const template = { ...baseTemplate, applicable_positions: [] };
    const result = pass.enrich({ template });

    expect(result.metadata.applicable_positions).toContain('leader');
    expect(result.metadata.applicable_positions).toContain('follower');
  });

  it('should infer difficulty', () => {
    const simpleTemplate = { ...baseTemplate, template_text: 'Short text.', variables: ['a'] };
    const complexTemplate = {
      ...baseTemplate,
      template_text: 'A'.repeat(600),
      variables: ['a', 'b', 'c', 'd', 'e', 'f'],
      moral_ambiguity: 0.8,
    };

    const simpleResult = pass.enrich({ template: simpleTemplate });
    const complexResult = pass.enrich({ template: complexTemplate });

    expect(simpleResult.metadata.difficulty).toBe('low');
    expect(complexResult.metadata.difficulty).toBe('high');
  });

  it('should infer moral ambiguity based on archetype', () => {
    const politicalTemplate = { ...baseTemplate, archetype: 'political', moral_ambiguity: 0 };
    const escapeTemplate = { ...baseTemplate, archetype: 'escape', moral_ambiguity: 0 };

    const politicalResult = pass.enrich({ template: politicalTemplate });
    const escapeResult = pass.enrich({ template: escapeTemplate });

    expect(politicalResult.metadata.moral_ambiguity).toBeGreaterThan(
      escapeResult.metadata.moral_ambiguity,
    );
  });

  it('should preserve existing tags', () => {
    const template = { ...baseTemplate, tags: ['custom_tag'] };
    const result = pass.enrich({ template });

    expect(result.metadata.tags).toContain('custom_tag');
    expect(result.metadata.tags).toContain('water');
  });
});
