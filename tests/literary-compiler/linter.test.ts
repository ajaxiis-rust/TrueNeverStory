import { describe, it, expect } from 'bun:test';
import { Linter } from '../../src/mcp/literary-compiler/linter';
import type { QuestTemplate } from '../../src/mcp/literary-compiler/types';

describe('Linter', () => {
  const linter = new Linter();

  const validTemplate: QuestTemplate = {
    id: 'Exodus.14',
    source_book: 'Exodus',
    source_chapter: 14,
    archetype: 'escape',
    applicable_positions: ['leader', 'follower'],
    variables: ['current_leader', 'current_tyrant', 'obstacle'],
    template_text: '[current_leader] leads [followers] away from [current_tyrant].',
    mood: 'epic',
    difficulty: 'high',
    moral_ambiguity: 0.2,
    tags: ['escape', 'water'],
    created_at: Date.now(),
  };

  it('should pass valid templates', () => {
    const result = linter.lint([validTemplate]);

    expect(result.error_count).toBe(0);
    expect(result.valid_templates.length).toBe(1);
    expect(result.invalid_templates.length).toBe(0);
  });

  it('should catch empty required fields', () => {
    const invalidTemplate = { ...validTemplate, id: '', archetype: '' };
    const result = linter.lint([invalidTemplate]);

    expect(result.error_count).toBe(2);
    expect(result.invalid_templates.length).toBe(1);
  });

  it('should catch missing variables', () => {
    const invalidTemplate = { ...validTemplate, variables: [] };
    const result = linter.lint([invalidTemplate]);

    expect(result.error_count).toBe(1);
    expect(result.issues.some(i => i.type === 'missing_variables')).toBe(true);
  });

  it('should catch duplicate IDs', () => {
    const result = linter.lint([validTemplate, validTemplate]);

    expect(result.issues.some(i => i.type === 'duplicate_id')).toBe(true);
    expect(result.warning_count).toBeGreaterThanOrEqual(1);
  });

  it('should catch clichés', () => {
    const clicheTemplate = {
      ...validTemplate,
      template_text: 'The hero delved deep into the darkness, the air crackled with tension.',
    };
    const result = linter.lint([clicheTemplate]);

    expect(result.issues.some(i => i.type === 'cliche')).toBe(true);
  });

  it('should catch invalid moral ambiguity range', () => {
    const invalidTemplate = { ...validTemplate, moral_ambiguity: 1.5 };
    const result = linter.lint([invalidTemplate]);

    expect(result.error_count).toBe(1);
    expect(result.issues.some(i => i.type === 'invalid_range')).toBe(true);
  });

  it('should separate valid and invalid templates', () => {
    const invalidTemplate = { ...validTemplate, id: '' };
    const result = linter.lint([validTemplate, invalidTemplate]);

    expect(result.valid_templates.length).toBe(1);
    expect(result.invalid_templates.length).toBe(1);
    expect(result.valid_templates[0]!.id).toBe('Exodus.14');
  });
});
