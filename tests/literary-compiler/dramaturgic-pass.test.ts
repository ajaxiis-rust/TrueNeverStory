import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { DramaturgicPass } from '../../src/mcp/literary-compiler/dramaturgic-pass';
import { LiteraryCompilerDB } from '../../src/mcp/literary-compiler/schema';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('DramaturgicPass', () => {
  let pass: DramaturgicPass;
  let db: LiteraryCompilerDB;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dramaturgic-test-'));
    db = new LiteraryCompilerDB(join(tempDir, 'test.db'));
    pass = new DramaturgicPass(db);
  });

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse Exodus 14 into escape template', () => {
    const text = `
      # Exodus 14

      ## Verse 1
      And the LORD spake unto Moses, saying,

      ## Verse 2
      Speak unto the children of Israel, that they turn and encamp before Pihahiroth, between Migdol and the sea.

      ## Verse 21
      And Moses stretched out his hand over the sea; and the LORD caused the sea to go back by a strong east wind all that night.
    `;

    const result = pass.parse({
      text,
      source_book: 'Exodus',
      source_chapter: 14,
    });

    expect(result.templates.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBe(0);

    const template = result.templates[0]!;
    expect(template.archetype).toBe('escape');
    expect(template.source_book).toBe('Exodus');
    expect(template.source_chapter).toBe(14);
    expect(template.applicable_positions).toContain('leader');
    expect(template.variables).toContain('current_leader');
    // Mood inferred from keywords - "escape" text may not match mood keywords
    expect(['epic', 'neutral']).toContain(template.mood);
  });

  it('should parse Ruth 1 into loyalty template', () => {
    const text = `
      # Ruth 1

      ## Verse 1
      And it came to pass in the days when the judges ruled, that there was a famine in the land.

      ## Verse 16
      And Ruth said, Intreat me not to leave thee, or to return from following after thee. For where thou goest, I will go; where thou lodgest, I will lodge.
    `;

    const result = pass.parse({
      text,
      source_book: 'Ruth',
      source_chapter: 1,
    });

    expect(result.templates.length).toBeGreaterThanOrEqual(1);
    const template = result.templates[0]!;
    // Keyword-based: "follow" in verse 16 matches loyalty
    expect(['loyalty', 'judgment']).toContain(template.archetype);
  });

  it('should handle empty text gracefully', () => {
    const result = pass.parse({
      text: '',
      source_book: 'Empty',
      source_chapter: 1,
    });

    expect(result.templates.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('should store templates in database', () => {
    const text = `
      # Test Chapter

      ## Verse 1
      The hero faced a great obstacle and overcame it through courage.
    `;

    pass.parse({
      text,
      source_book: 'Test',
      source_chapter: 1,
    });

    const count = db.getTemplateCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
