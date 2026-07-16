import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { BibleParser } from '@/mcp/bible/parser';
import { CharacterDB } from '@/mcp/bible/characters';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CharacterDB', () => {
  let parser: BibleParser;
  let charDB: CharacterDB;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bible-char-test-'));
    parser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
    charDB = new CharacterDB(parser);
    charDB.createTables();
  });

  afterAll(() => {
    charDB.close();
    parser.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('createTables creates all tables', () => {
    const tables = charDB.getTables();
    expect(tables).toContain('bible_characters');
    expect(tables).toContain('bible_character_edges');
    expect(tables).toContain('bible_character_mentions');
  });

  test('insertCharacter and getById roundtrip', () => {
    charDB.insertCharacter({
      id: 'elijah',
      canonical_name: 'Elijah',
      hebrew_name: 'אליהו',
      greek_name: null,
      russian_name: 'Илья',
      aliases: ['Elias', 'Илия'],
      significance: 'prophet',
      testament: 'OT',
      description: 'Prophet who called down fire',
    });

    const found = charDB.getById('elijah');
    expect(found).not.toBeNull();
    expect(found!.canonical_name).toBe('Elijah');
    expect(found!.aliases).toEqual(['Elias', 'Илия']);
  });

  test('search finds by canonical name', () => {
    const results = charDB.search('Elijah');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('elijah');
  });

  test('search finds by alias', () => {
    const results = charDB.search('Илья');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('elijah');
  });

  test('insertEdge and getEdges roundtrip', () => {
    charDB.insertEdge('elijah', 'elisha', 'mentor_of', { note: 'Elisha succeeded Elijah' });
    const edges = charDB.getEdges('elijah');
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges[0].to_character).toBe('elisha');
    expect(edges[0].relation).toBe('mentor_of');
  });

  test('insertMention and getMentions roundtrip', () => {
    charDB.insertMention('elijah', '1KI.17.1', 'subject');
    const mentions = charDB.getMentions('elijah');
    expect(mentions.length).toBeGreaterThanOrEqual(1);
    expect(mentions[0].verse_id).toBe('1KI.17.1');
  });
});
