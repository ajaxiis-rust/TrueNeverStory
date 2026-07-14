import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { LiteraryCompilerDB } from '../../src/mcp/literary-compiler/schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('LiteraryCompilerDB', () => {
  let db: LiteraryCompilerDB;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'litcomp-test-'));
    db = new LiteraryCompilerDB(join(tempDir, 'test.db'));
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create tables on initialization', () => {
    const tables = db.getTables();
    expect(tables).toContain('bible_quest_templates');
    expect(tables).toContain('bible_quest_templates_fts');
  });

  it('should insert and retrieve a quest template', () => {
    const template = {
      id: 'Exodus.14',
      source_book: 'Exodus',
      source_chapter: 14,
      archetype: 'escape',
      applicable_positions: ['leader', 'follower'],
      variables: ['current_leader', 'current_tyrant', 'obstacle', 'intervention'],
      template_text: '[current_leader] leads [followers] away from [current_tyrant]. [obstacle] blocks the path. [intervention] clears the way.',
      mood: 'epic',
      difficulty: 'high',
      moral_ambiguity: 0.2,
      tags: ['escape', 'water', 'miracle', 'leadership'],
    };

    db.insertTemplate(template);
    const retrieved = db.getTemplate('Exodus.14');

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('Exodus.14');
    expect(retrieved!.archetype).toBe('escape');
    expect(retrieved!.applicable_positions).toEqual(['leader', 'follower']);
    expect(retrieved!.variables).toEqual(['current_leader', 'current_tyrant', 'obstacle', 'intervention']);
  });

  it('should query templates by position', () => {
    db.insertTemplate({
      id: 'Ruth.1',
      source_book: 'Ruth',
      source_chapter: 1,
      archetype: 'loyalty',
      applicable_positions: ['follower'],
      variables: ['current_hero', 'mentor'],
      template_text: '[current_hero] follows [mentor] through hardship.',
      mood: 'hopeful',
      difficulty: 'medium',
      moral_ambiguity: 0.1,
      tags: ['loyalty', 'family'],
    });

    const templates = db.queryTemplates({ position: 'leader' });
    expect(templates.length).toBeGreaterThanOrEqual(1);
    expect(templates.some(t => t.id === 'Exodus.14')).toBe(true);
  });

  it('should handle duplicate IDs gracefully', () => {
    const template = {
      id: 'Exodus.14',
      source_book: 'Exodus',
      source_chapter: 14,
      archetype: 'escape',
      applicable_positions: ['leader'],
      variables: ['current_leader'],
      template_text: 'Template text',
      mood: 'epic',
      difficulty: 'high',
      moral_ambiguity: 0.2,
      tags: ['escape'],
    };

    db.insertTemplate(template);
    const count = db.getTemplateCount();
    expect(count).toBe(2);
  });

  it('should delete a template', () => {
    db.deleteTemplate('Ruth.1');
    const retrieved = db.getTemplate('Ruth.1');
    expect(retrieved).toBeNull();
  });
});
