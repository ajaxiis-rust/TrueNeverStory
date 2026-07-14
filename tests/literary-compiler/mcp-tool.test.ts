import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { LiteraryCompilerMCPTools } from '../../src/mcp/tools/literary-compiler';
import { LiteraryCompilerDB } from '../../src/mcp/literary-compiler/schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('LiteraryCompilerMCPTools', () => {
  let tools: LiteraryCompilerMCPTools;
  let db: LiteraryCompilerDB;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-tool-test-'));
    db = new LiteraryCompilerDB(join(tempDir, 'test.db'));

    db.insertTemplate({
      id: 'Exodus.14',
      source_book: 'Exodus',
      source_chapter: 14,
      archetype: 'escape',
      applicable_positions: ['leader', 'follower'],
      variables: ['current_leader', 'current_tyrant', 'obstacle', 'intervention'],
      template_text: '[current_leader] leads [followers] away from [current_tyrant].',
      mood: 'epic',
      difficulty: 'high',
      moral_ambiguity: 0.2,
      tags: ['escape', 'water', 'miracle'],
    });

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

    tools = new LiteraryCompilerMCPTools(db);
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return templates by position', async () => {
    const result = await tools.getQuestTemplates({ position: 'leader' });

    expect(result.templates.length).toBeGreaterThanOrEqual(1);
    expect(result.templates.some(t => t.id === 'Exodus.14')).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('should return templates by archetype', async () => {
    const result = await tools.getQuestTemplates({ archetype: 'loyalty' });

    expect(result.templates.length).toBe(1);
    expect(result.templates[0]!.id).toBe('Ruth.1');
  });

  it('should respect limit parameter', async () => {
    const result = await tools.getQuestTemplates({ limit: 1 });

    expect(result.templates.length).toBe(1);
  });

  it('should return empty array for non-matching position', async () => {
    const result = await tools.getQuestTemplates({ position: 'tyrant' });

    expect(result.templates.length).toBe(0);
  });

  it('should return all templates when no filter specified', async () => {
    const result = await tools.getQuestTemplates({});

    expect(result.templates.length).toBe(2);
  });
});
